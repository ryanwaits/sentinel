/**
 * Trigger → audit → adjudicate → alert (the M3/M4 loop on the Agent-SDK substrate).
 *
 * Replaces the eve dispatch path: instead of POSTing a directive to an eve session and later reading
 * the run off a stream, the bridge calls `audit()` (engine/, direct Anthropic) and adjudicates the
 * returned structured findings DIRECTLY — no run-reader, no [SENTINEL-FINDINGS] parsing. Runs async
 * (audits take minutes); the bridge fires it and returns 202.
 */
import { audit } from "../engine/audit";
import { adjudicateFindings } from "./adjudication";
import { loadRecord } from "./kb";
import { notify } from "./notify";
import { reconcile, TIER_ESTIMATE_USD, type Tier } from "./spend-ceiling";
import { recordSession } from "./trigger-state";

export type TriggerContext = {
  /** The watched contract (KB waivers + ledger key). */
  watchedContractId: string;
  /** Primary audit target — the decoded proposal principal for governance, else the watched contract. */
  target: string;
  tier: Tier;
  fn: string;
  triggerClass: string;
  dedupKey: string;
  txId?: string;
  blockHeight?: number;
  deadlineBlock?: number | null;
  auditTargets: string[];
  suspicious: boolean;
};

/**
 * Run one triggered audit end-to-end. Awaitable, but the bridge fires it WITHOUT awaiting (it returns
 * 202 immediately) — so the caller must `.catch()` to avoid an unhandled rejection.
 */
export async function runTrigger(ctx: TriggerContext): Promise<void> {
  const result = await audit(ctx.target, { tier: ctx.tier });
  const sessionId = result.sessionId ?? `audit:${ctx.txId ?? "no-tx"}:${ctx.target}`;

  const kb = loadRecord(ctx.watchedContractId);
  const adjudication = adjudicateFindings({
    sessionId,
    contractId: ctx.watchedContractId,
    findings: result.findings,
    tokenCostUsd: result.metrics.costUsd,
    waivers: kb?.waivers,
  });

  await notify(adjudication);

  // True-up the daily spend accumulator with the real cost (reserve happened at dispatch).
  if (result.metrics.costUsd > 0) reconcile(TIER_ESTIMATE_USD[ctx.tier], result.metrics.costUsd);

  recordSession({
    sessionId,
    contractId: ctx.watchedContractId,
    fn: ctx.fn,
    triggerClass: ctx.triggerClass,
    tier: ctx.tier,
    txId: ctx.txId,
    blockHeight: ctx.blockHeight,
    deadlineBlock: ctx.deadlineBlock,
    auditTargets: ctx.auditTargets,
    suspicious: ctx.suspicious,
    dispatchedAt: new Date().toISOString(),
  });

  console.log(
    `[pipeline] ${ctx.watchedContractId}.${ctx.fn} → audit ${ctx.target} (${ctx.tier}, $${result.metrics.costUsd}, ${result.findings.length} findings) → ${adjudication.alertLevel} | session ${sessionId}`,
  );
}
