/**
 * Trigger → audit → adjudicate → alert (the M3/M4 loop on the Agent-SDK substrate).
 *
 * Replaces the eve dispatch path: instead of POSTing a directive to an eve session and later reading
 * the run off a stream, the bridge calls `audit()` (engine/, direct Anthropic) and adjudicates the
 * returned structured findings DIRECTLY — no run-reader, no [SENTINEL-FINDINGS] parsing. Runs async
 * (audits take minutes); the bridge fires it and returns 202.
 */
import { audit } from "../engine/audit";
import type { Adjudication } from "./adjudication";
import { adjudicateFindings } from "./adjudication";
import { tierForArchetype } from "./config";
import { loadRecord } from "./kb";
import { networkOf } from "./network";
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
  // The watched contract's KB feeds the audit (context-aware: archetype + sensitive fns + accepted
  // waivers) AND the adjudicator (waiver suppression). Load it once, up front.
  const kb = loadRecord(ctx.watchedContractId);
  const result = await audit(ctx.target, { tier: ctx.tier, kb });
  const sessionId = result.sessionId ?? `audit:${ctx.txId ?? "no-tx"}:${ctx.target}`;

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

/**
 * On-demand audit request (the "bring your contract" front-door path) — audit → adjudicate → notify,
 * NOT trigger-driven. Reuses the same pipeline as `runTrigger`: a KB record (if the contract has one)
 * makes it context-aware + supplies waivers; the network is auto-derived from the address. `deps.audit`
 * is injectable so this is testable without real model spend. The caller (`POST /audit`) reserves the
 * spend estimate BEFORE calling (cap-before-spend / 429); this true-ups the real cost after.
 */
export type AuditRequest = { contractId: string; tier?: Tier; client?: string };

export async function runAuditRequest(
  req: AuditRequest,
  deps: { audit: typeof audit } = { audit },
): Promise<Adjudication> {
  const kb = loadRecord(req.contractId);
  const tier: Tier = req.tier ?? (kb ? tierForArchetype(kb.archetype) : "monitor");
  const result = await deps.audit(req.contractId, { tier, kb });
  const sessionId = result.sessionId ?? `audit-request:${req.contractId}`;
  const adjudication = adjudicateFindings({
    sessionId,
    contractId: req.contractId,
    findings: result.findings,
    tokenCostUsd: result.metrics.costUsd,
    waivers: kb?.waivers,
  });
  await notify(adjudication);
  if (result.metrics.costUsd > 0) reconcile(TIER_ESTIMATE_USD[tier], result.metrics.costUsd);
  console.log(
    `[audit-request] ${req.contractId} (${tier}, network=${networkOf(req.contractId)}, ` +
      `$${result.metrics.costUsd}, ${result.findings.length} findings) → ${adjudication.alertLevel} | session ${sessionId}`,
  );
  return adjudication;
}
