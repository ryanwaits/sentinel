/**
 * Incident triage (Type-2) — runtime behavior on UNCHANGED code → NO re-audit.
 *
 * The Type-2 counterpart to audit-pipeline.ts. A transfer.outflow / counterparty.new event hits
 * already-deployed bytecode, so re-auditing yields nothing new. Instead we CORRELATE the event against
 * what the audit already taught us (the KB `signatures`) + the prefilter verdict — signature-match
 * stays deterministic; the generic anomaly's severity may be refined by Jev (confidence-gated,
 * heuristic fallback) — and route a human-gated DETECTION alert. Reuses the Finding/Adjudication
 * shape so notify is unchanged; triage findings carry `origin:"incident"` and a correlation-confidence
 * (NEVER a confirmed exploit — by the time the webhook fires, the tx is already on-chain).
 */
import { adjudicateFindings, type Finding, resolveWaivers } from "./adjudication";
import type { MonitoringConfig } from "./config";
import {
  type AnomalyState,
  type ClassifyAnomaly,
  classifyAnomaly,
  jevConfidenceFloor,
} from "./jev";
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

const safeBig = (s: string): bigint | null => (/^\d+$/.test(s) ? BigInt(s) : null);

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

  // Baseline-aware generic signal (always emitted; every event here is notable). If a learned baseline
  // exists for the asset, ESCALATE when the outflow is anomalous — above the historical max, > 2× p99,
  // or to a brand-new recipient (the "big and weird" vs "big but normal" distinction). Else a plain
  // medium signal (→ INFO). class:"info" so a generic outflow never implies a proven bug.
  const bl = asset != null ? config.outflowBaselines.find((b) => b.asset === asset) : undefined;
  let severity: Finding["severity"] = verdict.suspicious ? "high" : "medium";
  let confidence = 0.4;
  let anomaly = "";
  if (bl && verdict.amount != null) {
    const p99 = safeBig(bl.p99);
    const max = safeBig(bl.max);
    const newRecipient =
      event.recipient != null &&
      bl.recipients.length > 0 &&
      !bl.recipients.includes(event.recipient);
    if (max != null && verdict.amount > max) {
      severity = "high";
      confidence = 0.55;
      anomaly = ` ANOMALY: ${verdict.amount} exceeds the historical max (${bl.max}) over ${bl.count} outflows.`;
    } else if (p99 != null && p99 > 0n && verdict.amount > p99 * 2n) {
      severity = "high";
      confidence = 0.5;
      anomaly = ` ANOMALY: ${verdict.amount} is >2× the p99 baseline (${bl.p99}).`;
    } else if (newRecipient) {
      severity = "high";
      confidence = 0.5;
      anomaly = ` ANOMALY: recipient ${event.recipient} is not among the ${bl.recipients.length} known counterparties.`;
    } else {
      anomaly = ` (within baseline: <= p99 ${bl.p99}, known recipient).`;
    }
  }
  out.push({
    title: `Notable ${triggerClass} event on ${ctx.contractId}`,
    severity,
    class: "info",
    verifierVerdict: "uncertain",
    pocStatus: "na",
    confidence,
    origin: "incident",
    blastRadius:
      verdict.amount != null
        ? `amount ${verdict.amount}${asset ? ` ${asset}` : ""}${event.recipient ? ` -> ${event.recipient}` : ""}`
        : undefined,
    recommendedAction: `${verdict.reason}.${anomaly} Runtime detection (already on-chain) — human-gated incident review; no automated action taken.`,
  });

  return out;
}

function anomalyState(ctx: TriageContext, info: Finding): AnomalyState {
  const asset = eventAsset(ctx.event);
  const bl = asset != null ? ctx.config.outflowBaselines.find((b) => b.asset === asset) : undefined;
  return {
    contractId: ctx.contractId,
    triggerClass: ctx.triggerClass,
    event: {
      type: ctx.event.type,
      amount: ctx.event.amount,
      recipient: ctx.event.recipient,
      asset,
      function_name: ctx.event.function_name,
      sender: ctx.event.sender,
    },
    verdict: {
      reason: ctx.verdict.reason,
      suspicious: ctx.verdict.suspicious,
      amount: ctx.verdict.amount != null ? ctx.verdict.amount.toString() : null,
    },
    baseline: bl
      ? {
          asset: bl.asset,
          count: bl.count,
          p99: bl.p99,
          max: bl.max,
          recipients: bl.recipients,
        }
      : null,
    heuristic: { severity: info.severity, confidence: info.confidence ?? 0.4 },
  };
}

/**
 * Overlay Jev on the generic (class:info) passthrough finding. Signature-match findings stay
 * heuristic. High-confidence Jev replaces severity/confidence; below the floor (or any failure)
 * keeps the heuristic and annotates recommendedAction.
 */
export async function refineAnomaly(
  ctx: TriageContext,
  findings: Finding[],
  classify: ClassifyAnomaly = classifyAnomaly,
): Promise<Finding[]> {
  const infoIdx = findings.findIndex((f) => f.class === "info" && f.origin === "incident");
  if (infoIdx < 0) return findings;
  const info = findings[infoIdx];
  if (!info) return findings;
  const decision = await classify(anomalyState(ctx, info));
  if (!decision) return findings;
  const floor = jevConfidenceFloor();
  const used = decision.confidence >= floor;
  console.log(
    `[jev] ${ctx.contractId} ${decision.severity} conf=${decision.confidence.toFixed(2)} exploit-p=${decision.likelyExploit.toFixed(2)} tokens=${decision.inputTokens}${used ? "" : " (abstain)"}`,
  );
  const tag = used
    ? ` Jev: ${decision.severity} (conf ${decision.confidence.toFixed(2)}, exploit-p ${decision.likelyExploit.toFixed(2)}).`
    : ` Jev abstained (conf ${decision.confidence.toFixed(2)} < ${floor}, said ${decision.severity}).`;
  return findings.map((f, i) =>
    i !== infoIdx
      ? f
      : {
          ...f,
          ...(used ? { severity: decision.severity, confidence: decision.confidence } : {}),
          recommendedAction: `${f.recommendedAction ?? ""}${tag}`,
        },
  );
}

/** Run one Type-2 triage end-to-end: findings → (optional Jev refine) → adjudicate → notify → ledger. */
export async function triageTrigger(ctx: TriageContext): Promise<void> {
  const findings = await refineAnomaly(ctx, triageFindings(ctx));
  const sessionId = `incident:${ctx.txId ?? "no-tx"}:${ctx.contractId}:${ctx.fnLabel}`;
  const adjudication = adjudicateFindings({
    sessionId,
    contractId: ctx.contractId,
    findings,
    tokenCostUsd: 0, // Type-2: no audit spend (Jev pennies ignored)
    waivers: ctx.config.waivers,
    waived: await resolveWaivers(findings, ctx.config.waivers),
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
