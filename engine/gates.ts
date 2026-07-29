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
 *  - Gate 3 — POC COMPLETENESS (freeze/liveness): a confirmed high/crit fund-freeze whose GREEN PoC did
 *    not DEMONSTRATE every claimed value-out path reverting (with a code), or that assumed rather than
 *    established its lock precondition, is downgraded green→pending + confirmed→uncertain. Coverage is
 *    read off the PoC's own emitted manifest (RunEvidence.pocCoverage), never the model's claim — the
 *    fix for the retracted Hermetica #V2 green that never called `fund-claim`.
 *
 * It DOWNGRADES rather than throws: a run still produces output, it just cannot over-claim. This is the
 * codebase rule "every finding adversarially verified AND green PoC before it ships" made an invariant.
 */
import type { Finding } from "../monitoring/adjudication";
import type { PocCoverage } from "./poc-coverage";

/** What the run demonstrably did — gathered from the SDK message stream, NOT from the model's claims. */
export type RunEvidence = {
  /** Count of subagent (Task/Agent) invocations. 0 = the model delegated to nothing. */
  subagentTasks: number;
  /** Subagent types actually invoked (best-effort from Task inputs) — e.g. "verifier", "auditor-*". */
  subagentTypes: Set<string>;
  /** PoC coverage manifests scraped off the run_simnet_poc tool results — the DEMONSTRATED value-out
   *  coverage Gate 3 reconciles against a finding's CLAIMS. Absent for non-freeze / airgapped-only runs. */
  pocCoverage?: PocCoverage[];
};

export type GateAction = {
  title: string;
  rule: "unverified-downgrade" | "poc-required" | "poc-incomplete" | "conditional-impact-unstated";
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

    // Gate 3 — POC COMPLETENESS: a confirmed freeze/liveness bug at high/crit shipping a GREEN PoC must
    // have DEMONSTRATED that every value-out path it claims blocked was actually CALLED and reverted for a
    // stated on-chain reason — read off the PoC's own emitted coverage, not the model's word. Opt-in by
    // impactType, fail-closed for freeze (no manifest ⇒ gap). Raises the floor; cannot prove the exit
    // inventory EXHAUSTIVE without chain enumeration (documented honest limit). This is the two-part
    // Hermetica-#V2 miss encoded: an uncalled claimed exit, AND an assumed (not established) precondition.
    const FREEZE = f.impactType === "freeze" || f.impactType === "liveness";
    if (
      f.verifierVerdict === "confirmed" &&
      f.class === "bug" &&
      HIGH_OR_CRIT(f.severity) &&
      f.pocStatus === "green" &&
      FREEZE
    ) {
      const cov = ev.pocCoverage?.find((c) => c.finding === f.title);
      const claimed = f.valueExitPaths ?? [];
      const coverageGap =
        !cov || // no manifest → can't certify completeness
        claimed.length === 0 || // a freeze that names no blocked exit proves nothing
        claimed.some((p) => {
          // every claimed exit shown reverting WITH a code
          const e = cov.exits.find((x) => x.fn === p);
          return e?.outcome !== "reverted" || !e.errCode;
        }) ||
        (!!f.precondition && !cov.preconditionEstablished); // conditional lock: established, not assumed

      if (coverageGap) {
        actions.push({ title: f.title, rule: "poc-incomplete", from: "green", to: "pending" });
        f = { ...f, pocStatus: "pending", verifierVerdict: "uncertain" }; // provisional-off, needsHuman
      } else if (cov.conditional && !f.precondition) {
        // exits revert ONLY under an applied condition, but the headline is blanket (no precondition) —
        // the second half of #V2: a conditional impact took an unconditional High.
        actions.push({
          title: f.title,
          rule: "conditional-impact-unstated",
          from: "green",
          to: "pending",
        });
        f = { ...f, pocStatus: "pending", verifierVerdict: "uncertain" };
      }
    }

    // NOTE: pocSubstrate (fork | airgapped) is recorded on the finding but does NOT change gate
    // pass/fail here — a fork green is the strongest evidence, an airgapped green still passes.
    // Forcing fork would need the deploy-time containment env and would break local audits.

    return f;
  });

  return { findings: gated, actions, verified };
}
