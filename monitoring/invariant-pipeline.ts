/**
 * Invariant → adjudicate → alert — the poll-lane's analogue of `audit-pipeline.ts::runTrigger`.
 *
 * `monitoring/invariant.ts` evaluates conservation invariants into `Finding`s (origin "incident") but
 * routes them NOWHERE — its CLI dead-ends at `console.log`. This closes that gap: an invariant's
 * findings flow through the SAME `adjudicateFindings` → `notify` path the reactive lane uses, so a
 * conservation breach reuses warn-once suppression, waiver suppression, and the hard human-gating — it
 * pages exactly like an audit finding, never auto-discloses. This is what makes the invariant lane
 * actually alert; the scheduler (Tier 2) then calls `runInvariantRegistry` on a cadence.
 */
import { createHash } from "node:crypto";
import { adjudicateFindings, resolveWaivers } from "./adjudication";
import {
  evaluateAndRecord,
  type Invariant,
  type ObservationReader,
  SecondLayerObservationReader,
} from "./invariant";
import { loadRecord } from "./kb";
import { notify } from "./notify";

export type InvariantRunResult = {
  invariantId: string;
  violations: number;
  alertLevel: string;
  /** Whether an alert was emitted (false = clean, or warn-once suppressed). */
  sent: boolean;
  reason?: string;
};

/** Short deterministic digest of the observed state — no clock/random, so it's replay-stable. */
function observationDigest(observations: Record<string, string>): string {
  const canonical = Object.keys(observations)
    .sort()
    .map((k) => `${k}=${observations[k]}`)
    .join("|");
  return createHash("sha1").update(canonical).digest("hex").slice(0, 12);
}

/**
 * Evaluate ONE invariant and route any violations → adjudicate → notify.
 *
 * The sessionId is keyed by the observed STATE (not just the invariant id): a standing breach with
 * unchanged readings is warn-once (pages once), while a CHANGED breach — a further reserve drain, a
 * wider backing gap — gets a fresh session and re-pages. This is load-bearing for the stateless
 * conservation kind, which would otherwise re-fire identically every poll. Polling has no model spend,
 * so `tokenCostUsd` is 0. The invariant's contract KB waivers are applied, so an accepted
 * centralization breach is suppressed like any other finding.
 */
export async function runInvariant(
  inv: Invariant,
  reader: ObservationReader = new SecondLayerObservationReader(),
): Promise<InvariantRunResult> {
  const { violations, findings, snapshot } = await evaluateAndRecord(inv, reader);
  if (findings.length === 0) {
    return { invariantId: inv.id, violations: 0, alertLevel: "none", sent: false };
  }

  const kb = loadRecord(inv.contractId);
  const sessionId = `invariant:${inv.id}:${observationDigest(snapshot.observations)}`;
  const adjudication = adjudicateFindings({
    sessionId,
    contractId: inv.contractId,
    findings,
    tokenCostUsd: 0,
    waivers: kb?.waivers,
    waived: await resolveWaivers(findings, kb?.waivers),
  });
  const res = await notify(adjudication);

  console.log(
    `[invariant] ${inv.id} → ${violations.length} violation(s) → ${adjudication.alertLevel} | ` +
      `${res.sent ? "ALERTED" : res.reason} | session ${sessionId}`,
  );
  return {
    invariantId: inv.id,
    violations: violations.length,
    alertLevel: adjudication.alertLevel,
    sent: res.sent,
    reason: res.reason,
  };
}

/**
 * Evaluate a registry of invariants → adjudicate + notify each. Sequential (polling is cheap and the
 * node RPC is rate-limited; no need to fan out). Returns a per-invariant result summary. This is the
 * entry point the scheduled-eval runner (Tier 2) calls on a cadence.
 */
export async function runInvariantRegistry(
  invariants: readonly Invariant[],
  reader: ObservationReader = new SecondLayerObservationReader(),
): Promise<InvariantRunResult[]> {
  const out: InvariantRunResult[] = [];
  for (const inv of invariants) out.push(await runInvariant(inv, reader));
  return out;
}
