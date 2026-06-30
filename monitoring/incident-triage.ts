/**
 * Incident triage (Type-2) — runtime behavior on UNCHANGED code → NO re-audit.
 *
 * The Type-2 counterpart to audit-pipeline.ts. A transfer.outflow / counterparty.new event hits
 * already-deployed bytecode, so re-auditing yields nothing new. Instead we CORRELATE the event against
 * what the audit already taught us (the KB `signatures`) + the prefilter verdict, deterministically —
 * no model, no spend — and route a human-gated DETECTION alert. Reuses the Finding/Adjudication shape
 * so notify is unchanged; triage findings carry `origin:"incident"` and a correlation-confidence
 * (NEVER a confirmed exploit — by the time the webhook fires, the tx is already on-chain).
 */
import { adjudicateFindings, type Finding } from "./adjudication";
import type { MonitoringConfig } from "./config";
import { notify } from "./notify";
import type { ChainEventBody, PrefilterVerdict } from "./prefilter";
import { recordSession } from "./trigger-state";

export type TriageContext = {
  config: MonitoringConfig;
  contractId: string;
  /** "outflow:<asset>" for a transfer sub, or the fn name for counterparty.new. */
  fnLabel: string;
  triggerClass: string;
  event: ChainEventBody;
  verdict: PrefilterVerdict;
  txId?: string;
  blockHeight?: number;
  dedupKey: string;
};

/** Asset implicated by a transfer event (ft id, or "stx" for an stx transfer), else undefined. */
function eventAsset(event: ChainEventBody): string | undefined {
  if (event.asset_identifier) return event.asset_identifier;
  if (event.type === "stx_transfer") return "stx";
  return undefined;
}

/**
 * Deterministic triage → Finding[]. Two producers:
 *  1. signature-match — a CONFIRMED-bug signature is implicated (its fn was called OR its asset left
 *     the contract). A CORRELATION, never confirmation: `uncertain` / 0.6, precondition surfaced so a
 *     routine authorized op isn't read as an exploit. `class:"bug"` (proven bug; waiver-immune).
 *  2. verdict-passthrough — ONE finding wrapping the prefilter verdict (covers threshold-exceeded,
 *     new-counterparty, AND the no-threshold fail-safe). `class:"info"` so a generic large outflow
 *     never implies a proven vuln or matches a centralization waiver.
 */
export function triageFindings(ctx: TriageContext): Finding[] {
  const { config, event, verdict, triggerClass } = ctx;
  const asset = eventAsset(event);
  const out: Finding[] = [];

  for (const sig of config.signatures) {
    const fnMatch = event.function_name != null && event.function_name === sig.fn;
    const assetMatch = sig.asset != null && asset != null && sig.asset === asset;
    if (!fnMatch && !assetMatch) continue;
    out.push({
      title: `Possible exploitation of "${sig.title}"`,
      severity: sig.severity ?? "high",
      class: "bug",
      verifierVerdict: "uncertain",
      pocStatus: "na",
      confidence: 0.6,
      origin: "incident",
      targetFn: sig.fn,
      targetAsset: sig.asset,
      precondition: sig.precondition,
      blastRadius:
        asset != null
          ? `${event.amount ?? "?"} of ${asset} left ${ctx.contractId}${event.recipient ? ` to ${event.recipient}` : ""}`
          : undefined,
      recommendedAction:
        "A function/asset with a PROVEN vulnerability was involved — VERIFY whether THIS event hit the precondition" +
        `${sig.precondition ? ` ("${sig.precondition}")` : ""}, not a routine authorized op. Disclosure human-gated — no automated action taken.`,
    });
  }

  // Always emit the generic signal (every event reaching triage is notable). class:"info".
  out.push({
    title: `Notable ${triggerClass} event on ${ctx.contractId}`,
    severity: verdict.suspicious ? "high" : "medium",
    class: "info",
    verifierVerdict: "uncertain",
    pocStatus: "na",
    confidence: 0.4,
    origin: "incident",
    blastRadius:
      verdict.amount != null ? `amount ${verdict.amount}${asset ? ` ${asset}` : ""}` : undefined,
    recommendedAction: `${verdict.reason}. Runtime detection (already on-chain) — human-gated incident review; no automated action taken.`,
  });

  return out;
}

/** Run one Type-2 triage end-to-end: deterministic findings → adjudicate → notify → ledger. */
export async function triageTrigger(ctx: TriageContext): Promise<void> {
  const findings = triageFindings(ctx);
  const sessionId = `incident:${ctx.txId ?? "no-tx"}:${ctx.contractId}:${ctx.fnLabel}`;
  const adjudication = adjudicateFindings({
    sessionId,
    contractId: ctx.contractId,
    findings,
    tokenCostUsd: 0, // deterministic — no model spend
    waivers: ctx.config.waivers,
  });
  await notify(adjudication);
  recordSession({
    sessionId,
    contractId: ctx.contractId,
    fn: ctx.fnLabel,
    triggerClass: ctx.triggerClass,
    tier: "monitor",
    txId: ctx.txId,
    blockHeight: ctx.blockHeight,
    deadlineBlock: null,
    auditTargets: [],
    suspicious: ctx.verdict.suspicious,
    dispatchedAt: new Date().toISOString(),
    route: "type2",
    signals: findings.map((f) => f.title),
  });
  console.log(
    `[triage] ${ctx.contractId}.${ctx.fnLabel} → ${findings.length} signal(s) → ${adjudication.alertLevel} | session ${sessionId}`,
  );
}
