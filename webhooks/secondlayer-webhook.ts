/**
 * secondlayer subscription -> audit()  (HTTP webhook ingress bridge — the audit-on-trigger core)
 *
 * A secondlayer CHAIN subscription POSTs a decoded chain event here. The bridge:
 *   1. verifies the Standard-Webhooks signature (per-subscription secret, resolved by the ruleKey);
 *   2. drops reorg rollbacks + de-duplicates re-deliveries / replays;
 *   3. loads the watched contract's MonitoringConfig and runs the consumer PRE-FILTER — benign
 *      events are logged + 204'd with ZERO spend;
 *   4. for a notable event, decodes the audit target (proposal principal for governance) + tier +
 *      deadline_block, reserves the tier estimate against the daily ceiling, marks dedup/debounce,
 *      and fires `runTrigger` ASYNC (audit → adjudicate → human-gated notify) — returning 202.
 *
 * Migrated off eve: the audit runs in-process via the Claude Agent SDK (engine/audit + the
 * audit-pipeline), direct to Anthropic. The audit takes minutes, so it runs detached (the bridge
 * marks dedup at dispatch so a re-delivery during the run can't double-fire). On a container host the
 * detached task survives; a job queue is the prod upgrade. Run: bun run webhooks/secondlayer-webhook.ts.
 *
 * Env: SECONDLAYER_WEBHOOK_SECRET (single-sub fallback secret); ANTHROPIC_API_KEY + STACKS_NODE_URL
 *      for the audit; SENTINEL_TIMELOCK_BLOCKS for the deadline watchdog.
 */
import {
  type ChainApplyEnvelope,
  type ChainWebhookDelivery,
  decodeChainWebhook,
} from "@secondlayer/sdk";
import { type Adjudication, adjudicateFindings } from "../monitoring/adjudication";
import { type AuditRequest, runAuditRequest, runTrigger } from "../monitoring/audit-pipeline";
import {
  getAuditStatus,
  setAuditDone,
  setAuditError,
  setAuditRunning,
  toPublicResult,
} from "../monitoring/audit-results";
import { routeForTriggerClass } from "../monitoring/config";
import { buildDirective, tierFor } from "../monitoring/directive";
import { triageTrigger } from "../monitoring/incident-triage";
import { deriveConfig } from "../monitoring/kb";
import { isValidContractId, networkOf } from "../monitoring/network";
import { type ChainEventBody, classifyMaybe } from "../monitoring/prefilter";
import { renderSummary } from "../monitoring/render-summary";
import { verifySignature } from "../monitoring/sources/trigger-source";
import { reserve, type Tier } from "../monitoring/spend-ceiling";
import { getByRuleKey } from "../monitoring/sub-store";
import { dedupKey, inDebounce, isDuplicate, markDispatched } from "../monitoring/trigger-state";

const FALLBACK_SECRET = process.env.SECONDLAYER_WEBHOOK_SECRET ?? "";

/** Representative governance timelock window (blocks) for the deadline watchdog. ~1 day at ~10min/block. */
const TIMELOCK_BLOCKS = Number(process.env.SENTINEL_TIMELOCK_BLOCKS ?? 144);

/** The apply-envelope metadata the dispatch path needs (tx/block/trigger). `ChainApplyEnvelope.data`
 *  is fully typed by the sdk; this is the subset `handleTransfer` + the audit dispatch read. */
type ApplyMeta = Pick<ChainApplyEnvelope, "tx_id" | "block_height" | "block_hash" | "trigger">;

/**
 * Durable event dedup (tx-based) covers re-delivery; this in-memory set short-circuits an obvious
 * retry of an ALREADY-HANDLED delivery (same webhook-id). Marked only on definitive handling — NOT
 * on transient failure (429/502) so the server's retry can re-drive. Bounded; durable swap in prod.
 */
const SEEN_CAP = 5000;
const handledWebhookIds = new Set<string>();
function alreadyHandled(id: string | undefined): boolean {
  return Boolean(id && handledWebhookIds.has(id));
}
function markHandled(id: string | undefined): void {
  if (!id) return;
  if (handledWebhookIds.size >= SEEN_CAP) handledWebhookIds.clear();
  handledWebhookIds.add(id);
}

/** Resolve the ruleKey from the request path (`/<ruleKey>`), URL-decoded. */
function ruleKeyFromPath(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
}

/**
 * Map a typed apply envelope (`decodeChainWebhook` output) → our internal `ChainEventBody`. The sdk's
 * discriminated union already handled every trap the old hand-rolled normalizer guessed at (nested vs
 * flat, the `_event` suffix, `contract_id` vs `contract_identifier`). We discriminate the two event
 * families the monitor cares about: a transfer-family `ChainEventEnvelope` (carries `event_index` + a
 * nested `data`) vs a tx-level `ChainTxLevelEvent` (flat, `function_name`, no `event_index`).
 */
function toEventBody(data: { trigger: string; event: unknown }): ChainEventBody {
  // The envelope (trigger/tx/block) stays fully typed; the event's inner fields are polymorphic per
  // trigger and TS can't correlate the generic `trigger`↔`event` pairing through a runtime check, so we
  // read them structurally — decodeChainWebhook already validated the delivery shape.
  const ev = data.event as {
    event_index?: number;
    data?: { sender?: string; recipient?: string; amount?: string; asset_identifier?: string };
    sender?: string;
    status?: string;
    contract_id?: string | null;
    function_name?: string | null;
    function_args?: string[] | null;
    result_hex?: string | null;
  };
  // transfer-family carries event_index + a nested `data`; tx-level (contract_call/deploy) is flat.
  if (ev.event_index != null && ev.data) {
    return {
      type: data.trigger, // "stx_transfer" | "ft_transfer" | …
      event_index: ev.event_index, // load-bearing for per-event transfer dedup
      sender: ev.data.sender,
      recipient: ev.data.recipient,
      amount: ev.data.amount,
      asset_identifier: ev.data.asset_identifier,
    };
  }
  return {
    type: data.trigger, // "contract_call" | "contract_deploy" | (sbtc/other → no contract/fn → no-op)
    contract_id: ev.contract_id ?? undefined,
    function_name: ev.function_name ?? undefined,
    function_args: ev.function_args ?? undefined,
    sender: ev.sender,
    status: ev.status,
    result_hex: ev.result_hex ?? undefined,
  };
}

/** A transfer-trigger event (ft/stx outflow sub) carries no function_name; the watched contract is
 *  the SENDER (we scope subs to sender=contract). Discriminate on the mapped `type`. */
function isTransferEvent(event: ChainEventBody): boolean {
  return event.type === "ft_transfer" || event.type === "stx_transfer";
}

/**
 * Type-2 TRANSFER (outflow) path: the watched contract is `event.sender`; match the watched
 * transfer.outflow fn by asset; pre-filter; on a notable event run INCIDENT TRIAGE (no audit, no
 * reserve — the code is unchanged, nothing to re-audit). Detection, not prevention.
 */
async function handleTransfer(
  delivery: ApplyMeta,
  event: ChainEventBody,
  webhookId: string | undefined,
): Promise<Response> {
  const contractId = event.sender;
  if (!contractId) {
    markHandled(webhookId);
    return new Response("transfer event without sender — no-op", { status: 200 });
  }
  let config: ReturnType<typeof deriveConfig>;
  try {
    config = deriveConfig(contractId);
  } catch {
    markHandled(webhookId);
    return new Response("unmonitored contract", { status: 204 });
  }
  const asset = event.asset_identifier ?? "stx";
  const fn =
    config.sensitiveFns.find(
      (f) =>
        f.triggerClass === "transfer.outflow" &&
        (f.outflowThreshold?.asset === asset || f.suggestedOutflowThreshold?.asset === asset),
    ) ?? config.sensitiveFns.find((f) => f.triggerClass === "transfer.outflow");
  if (!fn) {
    markHandled(webhookId);
    return new Response("no outflow watch for this asset", { status: 204 });
  }
  // Per-event dedup: one tx emits many transfer events (a swap → N outflows), each with a distinct
  // event_index. Keying on it stops same-tx outflows collapsing to one key (dropping all but the first).
  const fnLabel =
    event.event_index != null ? `outflow:${asset}:${event.event_index}` : `outflow:${asset}`;
  const key = dedupKey(delivery.tx_id, contractId, fnLabel, delivery.block_hash);
  if (isDuplicate(key)) {
    markHandled(webhookId);
    return new Response("duplicate event", { status: 200 });
  }
  const verdict = await classifyMaybe(fn, event);
  if (!verdict.notable) {
    console.log(`[bridge] benign outflow ${contractId} (${asset}): ${verdict.reason} — no spend`);
    markHandled(webhookId);
    return new Response(`benign: ${verdict.reason}`, { status: 204 });
  }
  markDispatched(key, contractId, fnLabel);
  triageTrigger({
    config,
    contractId,
    fnLabel,
    triggerClass: "transfer.outflow",
    event,
    verdict,
    txId: delivery.tx_id,
    blockHeight: delivery.block_height,
    dedupKey: key,
  }).catch((err) =>
    console.error(`[bridge] triage failed for ${contractId}: ${(err as Error).message}`),
  );
  markHandled(webhookId);
  console.log(`[bridge] triage queued: ${contractId} ${fnLabel} (${verdict.reason})`);
  return new Response("triage queued", { status: 202 });
}

export async function handle(req: Request): Promise<Response> {
  const raw = await req.text();
  const reqHeaders = Object.fromEntries(req.headers);
  const webhookId = reqHeaders["webhook-id"];

  // 1) verify (per-ruleKey secret from KV; env fallback for a single-sub setup).
  const ruleKey = ruleKeyFromPath(req.url);
  const secret = getByRuleKey(ruleKey)?.signingSecret ?? FALLBACK_SECRET;
  if (secret && !verifySignature(raw, reqHeaders, secret)) {
    return new Response("bad signature", { status: 401 });
  }

  // 2) short-circuit an already-handled delivery retry.
  if (alreadyHandled(webhookId)) return new Response("duplicate", { status: 200 });

  // Decode + validate the delivery via the sdk's typed decoder (throws on a non-chain-webhook body).
  let delivery: ChainWebhookDelivery;
  try {
    delivery = decodeChainWebhook(raw);
  } catch (err) {
    console.warn(`[bridge] malformed delivery: ${(err as Error).message}`);
    return new Response("malformed chain-webhook delivery", { status: 400 });
  }
  if (process.env.SENTINEL_DEBUG_RAW) console.log(`[bridge:raw] ${raw}`);

  // Discriminate on the outer delivery type (test ping / reorg / apply) — narrows `delivery.data`.
  if (delivery.type === "chain.test.apply") {
    // Subscription verification ping, not a chain event — ack, never dispatch.
    markHandled(webhookId);
    return new Response("test delivery acked", { status: 200 });
  }
  // 3) reorg — an orphaned tx must NOT fire an audit (real retraction of an in-flight adjudication
  //    is M4). Acknowledge + drop.
  if (delivery.type === "chain.reorg.rollback") {
    console.log(`[bridge] rollback acked: fork @ ${delivery.data.fork_point_height} — no dispatch`);
    markHandled(webhookId);
    return new Response("rollback acked", { status: 204 });
  }

  // apply envelope — fully typed (tx/block/trigger/event). Map the event → our internal ChainEventBody.
  const data = delivery.data;
  const event = toEventBody(data);

  // Type-2 TRANSFER (outflow) event — no function_name; the watched contract is the sender. Route to
  // incident triage (detection), never a re-audit.
  if (isTransferEvent(event)) {
    return handleTransfer(data, event, webhookId);
  }

  const contractId = event.contract_id;
  const fnName = event.function_name;
  if (!contractId || !fnName) {
    markHandled(webhookId);
    return new Response("accepted (no contract/fn to audit)", { status: 200 });
  }

  // 4) load the watched contract's config; an unmonitored contract (no KB record) is a no-op.
  let config: ReturnType<typeof deriveConfig>;
  try {
    config = deriveConfig(contractId);
  } catch {
    console.log(`[bridge] no config for ${contractId} — unmonitored, dropping`);
    markHandled(webhookId);
    return new Response("unmonitored contract", { status: 204 });
  }
  const fn = config.sensitiveFns.find((f) => f.name === fnName);
  if (!fn) {
    markHandled(webhookId);
    return new Response("fn not watched", { status: 204 });
  }

  // 5) event-level dedup (tx-based) — a replay/re-delivery of the same event is a no-op. A contract_call
  //    is tx-level (one event per tx), so no event_index is needed; block_hash guards the reorg re-mine.
  const key = dedupKey(data.tx_id, contractId, fnName, data.block_hash);
  if (isDuplicate(key)) {
    markHandled(webhookId);
    return new Response("duplicate event", { status: 200 });
  }

  // 6) PRE-FILTER — benign ⇒ log + 204, ZERO spend.
  const verdict = await classifyMaybe(fn, event);
  if (!verdict.notable) {
    console.log(`[bridge] benign ${contractId}.${fnName}: ${verdict.reason} — no spend`);
    markHandled(webhookId);
    return new Response(`benign: ${verdict.reason}`, { status: 204 });
  }

  // 6b) Type-2 on a contract_call sub (counterparty.new) — runtime behavior, no new code → TRIAGE,
  //     never re-audit. No reserve (triage is deterministic, ~$0). Only Type-1 proceeds to the audit.
  if (routeForTriggerClass(fn.triggerClass) === "type2") {
    markDispatched(key, contractId, fnName);
    triageTrigger({
      config,
      contractId,
      fnLabel: fnName,
      triggerClass: fn.triggerClass,
      event,
      verdict,
      txId: data.tx_id,
      blockHeight: data.block_height,
      dedupKey: key,
    }).catch((err) =>
      console.error(`[bridge] triage failed for ${contractId}: ${(err as Error).message}`),
    );
    markHandled(webhookId);
    return new Response("triage queued", { status: 202 });
  }

  // 7) debounce floody classes (governance is exempt — every distinct proposal must be audited;
  //    dedup already blocks exact refire, the spend ceiling is the ultimate cap).
  if (routeForTriggerClass(fn.triggerClass) !== "type1") {
    const deb = inDebounce(contractId, fnName);
    if (deb.blocked) {
      console.log(
        `[bridge] debounced ${contractId}.${fnName} (${deb.elapsedMs}ms since last) — no spend`,
      );
      markHandled(webhookId);
      return new Response("debounced", { status: 200 });
    }
  }

  // 8) reserve the tier's estimated cost BEFORE any dispatch (cap before spend). On breach the
  //    ceiling pauses + pages; shed with 429 and DO NOT mark handled (server retry can re-drive
  //    after a day rollover / human clear).
  const tier = tierFor(fn.triggerClass, config.tier);
  const gate = await reserve(tier);
  if (!gate.allowed) {
    return new Response(`spend ceiling: ${gate.reason}`, { status: 429 });
  }

  // 9) build the directive (audit_targets[] incl. decoded proposal + live closure) and dispatch.
  //    For a governance proposal the verdict races a timelock: deadline_block = the block by which a
  //    WARN must land (trigger block + the DAO's timelock window). The agent uses it to deliver a
  //    verdict before the slow PoC. SENTINEL_TIMELOCK_BLOCKS is the representative window (real
  //    per-DAO timelock read is a later refinement).
  const deadlineBlock =
    routeForTriggerClass(fn.triggerClass) === "type1" && data.block_height
      ? data.block_height + TIMELOCK_BLOCKS
      : null;
  const { directive } = await buildDirective(config, fn, event, verdict, {
    txId: data.tx_id,
    blockHeight: data.block_height,
    deadlineBlock,
  });

  // 10) DISPATCH: mark dedup+debounce NOW (so a re-delivery during the minutes-long audit is
  //     deduped), then fire the audit→adjudicate→notify pipeline ASYNC and return 202. The audit
  //     target is the decoded proposal principal for governance, else the watched contract.
  markDispatched(key, contractId, fnName);
  const target = directive.proposal_target ?? contractId;
  runTrigger({
    watchedContractId: contractId,
    target,
    tier,
    fn: fnName,
    triggerClass: fn.triggerClass,
    dedupKey: key,
    txId: data.tx_id,
    blockHeight: data.block_height,
    deadlineBlock: directive.deadline_block,
    auditTargets: directive.audit_targets,
    suspicious: verdict.suspicious,
  }).catch((err) =>
    console.error(`[bridge] audit pipeline failed for ${target}: ${(err as Error).message}`),
  );

  markHandled(webhookId);
  console.log(
    `[bridge] dispatched ${tier} audit of ${target} (${directive.audit_targets.length} targets) for ${contractId}.${fnName}`,
  );
  return new Response("queued", { status: 202 });
}

// The front door is a first-party product surface (browser → worker), so /audit responses carry CORS.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
} as const;
const jsonCors = (data: unknown, status = 200): Response =>
  Response.json(data, { status, headers: CORS });

/**
 * Mock audit runner (local dev): a canned adjudication, no model spend, so the onboarding → worker →
 * report wiring is testable end-to-end without burning tokens. Enabled by `SENTINEL_AUDIT_MOCK=1`;
 * OFF in prod, where the real `runAuditRequest` fires an Opus sweep.
 */
async function mockAuditRun(req: AuditRequest): Promise<Adjudication> {
  console.log(`[audit-request] MOCK run for ${req.contractId} (SENTINEL_AUDIT_MOCK)`);
  await new Promise((r) => setTimeout(r, 1500));
  return adjudicateFindings({
    sessionId: `mock:${req.contractId}`,
    contractId: req.contractId,
    findings: [
      {
        title: "socialize-debt forces unbounded LP loss",
        severity: "critical",
        class: "bug",
        verifierVerdict: "confirmed",
        pocStatus: "green",
        origin: "audit",
        blastRadius: "100% of LP redemption value",
        recommendedAction:
          "Cap the socialize-debt write-down and re-check the authorized-caller set.",
      },
    ],
    tokenCostUsd: 0,
  });
}

const defaultAuditRunner: (r: AuditRequest) => Promise<Adjudication> = process.env
  .SENTINEL_AUDIT_MOCK
  ? mockAuditRun
  : runAuditRequest;

/**
 * On-demand audit ingress (the "bring your contract" front door): `POST /audit {contractId, tier?}`.
 * Validates the id via `@secondlayer/stacks`, reserves the spend estimate (cap-before-spend → 429),
 * registers the request, then fires the audit ASYNC (sweeps run minutes) and returns 202 + a requestId.
 * The browser polls `GET /audit/:requestId` for the verdict; the verdict also flows to `notify`.
 * Network is auto-derived from the address (Tier 3.1). NOT signature-gated: this is a first-party
 * product surface, not a webhook — front the worker with the LB/auth in prod.
 */
export async function handleAuditRequest(
  req: Request,
  run: (r: AuditRequest) => Promise<Adjudication> = defaultAuditRunner,
  render: (adj: Adjudication) => Promise<string> = renderSummary,
): Promise<Response> {
  let body: { contractId?: string; tier?: string; client?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonCors({ error: "invalid JSON body" }, 400);
  }
  const contractId = body.contractId?.trim() ?? "";
  if (!isValidContractId(contractId)) {
    return jsonCors({ error: "contractId must be a valid address.contract-name" }, 400);
  }
  const tier: Tier = body.tier === "deep" ? "deep" : "monitor";
  const gate = await reserve(tier);
  if (!gate.allowed) {
    return jsonCors({ error: `spend ceiling: ${gate.reason}` }, 429);
  }

  const request: AuditRequest = { contractId, tier, client: body.client };
  const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  setAuditRunning(requestId, contractId, tier);
  // Fire-and-forget: audits take minutes. On completion the public result lands in the store for the
  // browser to poll. (Durable queue + store is a backend-hardening item.)
  run(request)
    .then(async (adj) => {
      const summary = await render(adj); // house-voice prose; never throws (falls back to a template)
      setAuditDone(requestId, toPublicResult(adj, summary));
    })
    .catch((e) => {
      console.error(`[audit-request] ${contractId} failed: ${(e as Error).message}`);
      setAuditError(requestId, (e as Error).message);
    });
  console.log(
    `[audit-request] queued ${contractId} (${tier}, ${networkOf(contractId)}) → ${requestId}`,
  );
  return jsonCors(
    { status: "running", sessionId: requestId, contractId, tier, network: networkOf(contractId) },
    202,
  );
}

/** `GET /audit/:requestId` — the browser polls this for the audit's status + public verdict. */
export function handleAuditStatus(requestId: string): Response {
  const s = getAuditStatus(requestId);
  if (!s) return jsonCors({ error: "unknown request id" }, 404);
  return jsonCors(s);
}

// Minimal Bun server when run directly.
if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3001);
  Bun.serve({
    port,
    fetch: (req) => {
      const { pathname } = new URL(req.url);
      // CORS preflight for the browser-facing /audit routes.
      if (req.method === "OPTIONS" && pathname.startsWith("/audit")) {
        return new Response(null, { status: 204, headers: CORS });
      }
      // Liveness probe for the container host / LB (RUNBOOK health check).
      if (req.method === "GET" && pathname === "/health") {
        return Response.json({ ok: true, service: "sentinel-bridge" });
      }
      // On-demand audit front door + status polling.
      if (req.method === "POST" && pathname === "/audit") return handleAuditRequest(req);
      if (req.method === "GET" && pathname.startsWith("/audit/")) {
        return handleAuditStatus(decodeURIComponent(pathname.slice("/audit/".length)));
      }
      return req.method === "POST" ? handle(req) : new Response("POST only", { status: 405 });
    },
  });
  console.log(
    `secondlayer-webhook bridge listening on :${port} → audit() pipeline (direct Anthropic)`,
  );
}
