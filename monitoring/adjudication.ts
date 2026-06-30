/**
 * Adjudication (M4) — turn a finished audit run's report into a structured, routable verdict.
 *
 * The agent ends a monitoring-trigger report with a machine-readable `[SENTINEL-FINDINGS]{…}` block
 * (agent/instructions.md). We parse it DETERMINISTICALLY — no extra model call, no spend — and:
 *  - DROP refuted findings (verifier killed them);
 *  - SUPPRESS accepted centralization/trust waivers (warn-once, then never re-page) by matching
 *    against the contract's KB waivers;
 *  - mark PROVISIONAL-CRITICAL a confirmed high/critical whose PoC is still pending (deadline race):
 *    WARN now, auto-promote when the PoC turns green (the promotion is detected in notify.ts across
 *    re-adjudications);
 *  - roll up an overall severity / class / alert level / recommended action + the real token cost.
 *
 * Disclosure stays HUMAN-GATED: this produces an internal alert verdict only — never an action.
 * Pure + deterministic (state/idempotency live in notify.ts), so it unit-tests without chain/spend.
 */
import { z } from "zod";
import type { KBRecord } from "./kb";
import type { TriggerRecord } from "./trigger-state";

export const Severity = z.enum(["critical", "high", "medium", "low", "info"]);
export type Severity = z.infer<typeof Severity>;

export const FindingClass = z.enum(["bug", "centralization", "info"]);
export type FindingClass = z.infer<typeof FindingClass>;

export const VerifierVerdict = z.enum(["confirmed", "refuted", "uncertain"]);
export const PocStatus = z.enum(["green", "pending", "failed", "na"]);
export type PocStatus = z.infer<typeof PocStatus>;

/** One finding as emitted in the report's [SENTINEL-FINDINGS] block. */
export const Finding = z.object({
  title: z.string(),
  severity: Severity,
  class: FindingClass,
  verifierVerdict: VerifierVerdict,
  pocStatus: PocStatus.default("na"),
  confidence: z.number().min(0).max(1).optional(),
  blastRadius: z.string().optional(),
  recommendedAction: z.string().optional(),
});
export type Finding = z.infer<typeof Finding>;

export const SentinelFindings = z.object({ findings: z.array(Finding) });

export const AlertLevel = z.enum(["warn", "info", "none"]);
export type AlertLevel = z.infer<typeof AlertLevel>;

/** A finding after adjudication — kept/dropped with the reason. */
export type AdjudicatedFinding = Finding & {
  kept: boolean;
  /** Why it was dropped/suppressed (refuted / waived), if not kept. */
  disposition: "kept" | "refuted" | "waived";
  provisional: boolean;
};

export type Adjudication = {
  sessionId: string;
  contractId: string;
  severity: Severity;
  /** Worst kept finding's class (bug > centralization > info). */
  class: FindingClass;
  alertLevel: AlertLevel;
  pocStatus: PocStatus;
  /** A confirmed high/critical is awaiting its PoC — WARN now, promote on green. */
  provisional: boolean;
  /** An uncertain kept finding needs a human look. */
  needsHuman: boolean;
  findings: AdjudicatedFinding[];
  /** Titles suppressed as accepted centralization waivers (warn-once). */
  suppressed: string[];
  recommendedAction: string;
  tokenCostUsd: number;
};

const OPEN = "[SENTINEL-FINDINGS]";
const CLOSE = "[/SENTINEL-FINDINGS]";

/** Extract + validate the findings block from a report, or null if absent/malformed. */
export function extractFindings(report: string): z.infer<typeof SentinelFindings> | null {
  const open = report.indexOf(OPEN);
  const close = report.indexOf(CLOSE);
  if (open < 0 || close < 0 || close < open) return null;
  const json = report.slice(open + OPEN.length, close).trim();
  try {
    return SentinelFindings.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};
const HIGH_OR_CRIT = (s: Severity) => s === "critical" || s === "high";

function worseSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A non-bug finding is waived if its text overlaps an accepted KB waiver. Fuzzy substring match. */
function matchesWaiver(finding: Finding, waivers: KBRecord["waivers"]): boolean {
  if (finding.class === "bug") return false; // a real bug is never waived away
  const hay = normalize(`${finding.title} ${finding.blastRadius ?? ""}`);
  return waivers.some((w) => {
    const needle = normalize(w.finding);
    return needle.length > 0 && (hay.includes(needle) || needle.includes(hay));
  });
}

/**
 * Adjudicate a finished run. `waivers` come from the contract's KB record (accepted
 * centralization/trust findings — surfaced once, then suppressed).
 */
export function adjudicate(input: {
  sessionId: string;
  contractId: string;
  report: string;
  usage: { costUsd: number };
  waivers?: KBRecord["waivers"];
  trigger?: TriggerRecord | null;
}): Adjudication {
  const { sessionId, contractId, report, usage } = input;
  const parsed = extractFindings(report);

  // No machine-readable block ⇒ degrade to a human-review WARN (don't silently pass).
  if (!parsed) {
    return {
      sessionId,
      contractId,
      severity: "info",
      class: "info",
      alertLevel: "warn",
      pocStatus: "na",
      provisional: false,
      needsHuman: true,
      findings: [],
      suppressed: [],
      recommendedAction:
        "No [SENTINEL-FINDINGS] block in the report — manual review required. Disclosure human-gated.",
      tokenCostUsd: usage.costUsd,
    };
  }
  return adjudicateFindings({
    sessionId,
    contractId,
    findings: parsed.findings,
    tokenCostUsd: usage.costUsd,
    waivers: input.waivers,
  });
}

/**
 * Adjudicate findings DIRECTLY (the Agent-SDK path: `engine/audit` returns validated findings, so
 * there's no report text to parse). `adjudicate({report})` parses then calls this.
 */
export function adjudicateFindings(input: {
  sessionId: string;
  contractId: string;
  findings: Finding[];
  tokenCostUsd: number;
  waivers?: KBRecord["waivers"];
}): Adjudication {
  const { sessionId, contractId, tokenCostUsd } = input;
  const waivers = input.waivers ?? [];

  const adjudicated: AdjudicatedFinding[] = input.findings.map((f) => {
    if (f.verifierVerdict === "refuted") {
      return { ...f, kept: false, disposition: "refuted", provisional: false };
    }
    if (matchesWaiver(f, waivers)) {
      return { ...f, kept: false, disposition: "waived", provisional: false };
    }
    const provisional =
      f.verifierVerdict === "confirmed" && HIGH_OR_CRIT(f.severity) && f.pocStatus === "pending";
    return { ...f, kept: true, disposition: "kept", provisional };
  });

  const kept = adjudicated.filter((f) => f.kept);
  const suppressed = adjudicated.filter((f) => f.disposition === "waived").map((f) => f.title);

  let severity: Severity = "info";
  let cls: FindingClass = "info";
  let provisional = false;
  let needsHuman = false;
  for (const f of kept) {
    severity = worseSeverity(severity, f.severity);
    if (f.class === "bug") cls = "bug";
    else if (f.class === "centralization" && cls !== "bug") cls = "centralization";
    if (f.provisional) provisional = true;
    if (f.verifierVerdict === "uncertain") needsHuman = true;
  }

  // Alert level: any kept high/critical ⇒ WARN (human-gated); lesser kept ⇒ INFO; nothing ⇒ NONE.
  const hasHighCrit = kept.some((f) => HIGH_OR_CRIT(f.severity));
  const alertLevel: AlertLevel = hasHighCrit ? "warn" : kept.length > 0 ? "info" : "none";

  const pocStatus: PocStatus = provisional
    ? "pending"
    : kept.some((f) => HIGH_OR_CRIT(f.severity) && f.pocStatus === "green")
      ? "green"
      : "na";

  const lead = kept[0];
  const recommendedAction =
    kept.length === 0
      ? suppressed.length > 0
        ? "All findings refuted or accepted-waivers — no action. Disclosure human-gated."
        : "Audit clean — no action. Disclosure human-gated."
      : `${provisional ? "PROVISIONAL — verdict ahead of PoC (auto-promotes on green). " : ""}` +
        `${lead?.recommendedAction ?? "Review confirmed finding(s)"}. Disclosure human-gated — no automated action taken.`;

  return {
    sessionId,
    contractId,
    severity,
    class: cls,
    alertLevel,
    pocStatus,
    provisional,
    needsHuman,
    findings: adjudicated,
    suppressed,
    recommendedAction,
    tokenCostUsd,
  };
}
