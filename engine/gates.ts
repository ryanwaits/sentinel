/**
 * Credibility gates — STRUCTURAL enforcement of the audit's honesty invariants, in code, before a
 * finding reaches adjudication.
 *
 * Until now verify + PoC were prompt conventions the model self-reported: nothing in code stopped the
 * orchestrator labelling a finding "confirmed" with no verifier pass, or shipping a bug at high/critical
 * with pocStatus "na" (no reproduction attempted). This closes that gap. The gate reads what the run
 * DEMONSTRABLY did (subagent invocations off the SDK message stream — not the model's claims) and:
 *  - Gate 1 — VERIFY IS STRUCTURAL: a "confirmed" verdict from a run with no verifier pass is
 *    self-labelled; it is downgraded to "uncertain" so it surfaces to a human, never ships as proven.
 *  - Gate 2 — POC ATTEMPT REQUIRED: a confirmed bug at high/critical with pocStatus "na" is forced to
 *    "pending" — the provisional path that WARNs now and only auto-promotes when a green PoC lands.
 *
 * It DOWNGRADES rather than throws: a run still produces output, it just cannot over-claim. This is the
 * codebase rule "every finding adversarially verified AND green PoC before it ships" made an invariant.
 */
import type { Finding } from "../monitoring/adjudication";

/** What the run demonstrably did — gathered from the SDK message stream, NOT from the model's claims. */
export type RunEvidence = {
  /** Count of subagent (Task/Agent) invocations. 0 = the model delegated to nothing. */
  subagentTasks: number;
  /** Subagent types actually invoked (best-effort from Task inputs) — e.g. "verifier", "auditor-*". */
  subagentTypes: Set<string>;
};

export type GateAction = {
  title: string;
  rule: "unverified-downgrade" | "poc-required";
  from: string;
  to: string;
};

export type GateReport = {
  findings: Finding[];
  actions: GateAction[];
  /** Whether the run carried a verifier pass — a "confirmed" is trustworthy only when this is true. */
  verified: boolean;
};

const HIGH_OR_CRIT = (s: Finding["severity"]) => s === "critical" || s === "high";

/**
 * A run has NO verifier pass when it delegated to nothing, OR it delegated but the verifier subagent
 * demonstrably was not among those invoked. When subagent types couldn't be captured (tasks > 0 but the
 * set is empty — an introspection gap), we do NOT accuse: benefit of the doubt, no downgrade.
 */
export function verifierRan(ev: RunEvidence): boolean {
  if (ev.subagentTasks === 0) return false; // delegated to nothing → everything is self-labelled
  if (ev.subagentTypes.size === 0) return true; // couldn't introspect the types; don't over-penalise
  return ev.subagentTypes.has("verifier");
}

/**
 * Enforce the credibility gates over a run's findings. Pure + deterministic (no chain, no model) — the
 * whole testable heart of the invariant. Returns the gated findings, the actions taken, and whether the
 * run was verified.
 */
export function enforceGates(findings: Finding[], ev: RunEvidence): GateReport {
  const verified = verifierRan(ev);
  const actions: GateAction[] = [];

  const gated = findings.map((finding) => {
    let f = finding;

    // Gate 1 — with no verifier pass, a "confirmed" is self-labelled; downgrade to "uncertain" so it
    // reaches a human instead of shipping as proven.
    if (!verified && f.verifierVerdict === "confirmed") {
      actions.push({
        title: f.title,
        rule: "unverified-downgrade",
        from: "confirmed",
        to: "uncertain",
      });
      f = { ...f, verifierVerdict: "uncertain" };
    }

    // Gate 2 — a confirmed bug at high/critical cannot ship proven with no reproduction attempt (`na`);
    // force it to `pending`, the provisional path (WARN now, auto-promote on a green PoC).
    if (
      f.verifierVerdict === "confirmed" &&
      f.class === "bug" &&
      HIGH_OR_CRIT(f.severity) &&
      f.pocStatus === "na"
    ) {
      actions.push({ title: f.title, rule: "poc-required", from: "na", to: "pending" });
      f = { ...f, pocStatus: "pending" };
    }

    return f;
  });

  return { findings: gated, actions, verified };
}
