/**
 * secondlayer subscription -> eve  (HTTP webhook ingress bridge — the audit-on-trigger core, M3)
 *
 * A secondlayer CHAIN subscription POSTs a decoded chain event here. The bridge:
 *   1. verifies the Standard-Webhooks signature (per-subscription secret, resolved by the ruleKey
 *      in the URL path);
 *   2. drops reorg rollbacks + de-duplicates re-deliveries / replays;
 *   3. loads the watched contract's MonitoringConfig and runs the consumer PRE-FILTER — benign
 *      events are logged + 204'd with ZERO spend;
 *   4. for a notable event, builds the audit_targets[] (decoded proposal + its live closure for
 *      governance; the watched contract + KB closure for context) and a [SENTINEL-TRIGGER]
 *      directive;
 *   5. reserves the tier's estimated cost against the daily spend ceiling BEFORE dispatching;
 *   6. routes to the tier's eve deployment (Deep=Opus / Monitor=Sonnet), captures the session id,
 *      and records trigger→session metadata for M4 adjudication.
 * The server owns retry/backoff/dead-letter; the bridge just stays idempotent and returns 2xx.
 *
 * Lives OUTSIDE agent/ so eve's channel discovery doesn't compile it as a native channel. Run as a
 * tiny Bun/Vercel function:  bun run webhooks/secondlayer-webhook.ts   (PORT=3001 by default)
 *
 * Env: EVE_SESSION_URL (fallback), EVE_DEEP_SESSION_URL / EVE_MONITOR_SESSION_URL (tier routing),
 *      SECONDLAYER_WEBHOOK_SECRET (single-sub fallback secret).
 */
import { verifyWebhookSignature } from "@secondlayer/sdk";
import { buildDirective, tierFor } from "../monitoring/directive";
import { eveAuthEnabled, mintEveSessionToken } from "../monitoring/eve-jwt";
import { deriveConfig } from "../monitoring/kb";
import { type ChainEventBody, classify } from "../monitoring/prefilter";
import { reserve, type Tier } from "../monitoring/spend-ceiling";
import { getByRuleKey } from "../monitoring/sub-store";
import { commitDispatch, dedupKey, inDebounce, isDuplicate } from "../monitoring/trigger-state";

const FALLBACK_SECRET = process.env.SECONDLAYER_WEBHOOK_SECRET ?? "";
const FALLBACK_SESSION_URL = process.env.EVE_SESSION_URL ?? "http://127.0.0.1:3000/eve/v1/session";

/** Pick the eve deployment for a tier (Deep=Opus / Monitor=Sonnet); fall back to the single URL. */
function sessionUrlForTier(tier: Tier): string {
  if (tier === "deep") return process.env.EVE_DEEP_SESSION_URL ?? FALLBACK_SESSION_URL;
  return process.env.EVE_MONITOR_SESSION_URL ?? FALLBACK_SESSION_URL;
}

const GOVERNANCE_CLASSES = ["governance.proposal_submitted", "governance.proxy_upgrade"];

/** The decoded chain-subscription envelope. The event is under `event.*`, NOT top-level. */
type ChainWebhook = {
  action?: "apply" | "rollback";
  trigger?: string;
  block_hash?: string;
  block_height?: number;
  tx_id?: string;
  canonical?: boolean;
  event?: ChainEventBody;
};

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

/** Dispatch the directive to eve and return the created session id (best-effort capture). */
async function dispatchToEve(
  message: string,
  tier: Tier,
): Promise<{ ok: boolean; sessionId: string | null; status: number }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (eveAuthEnabled()) headers.authorization = `Bearer ${mintEveSessionToken()}`;
  const res = await fetch(sessionUrlForTier(tier), {
    method: "POST",
    headers,
    body: JSON.stringify({ message }),
  });
  let sessionId: string | null = null;
  const bodyText = await res.text().catch(() => "");
  try {
    const body = JSON.parse(bodyText) as Record<string, unknown>;
    const session = body.session as Record<string, unknown> | undefined;
    sessionId =
      (body.sessionId as string) ?? (body.id as string) ?? (session?.id as string) ?? null;
  } catch {
    // non-JSON body
  }
  // Fallback: a Location header like /eve/v1/session/<id>.
  if (!sessionId) {
    const loc = res.headers.get("location");
    if (loc) sessionId = loc.split("/").filter(Boolean).pop() ?? null;
  }
  return { ok: res.ok, sessionId, status: res.status };
}

export async function handle(req: Request): Promise<Response> {
  const raw = await req.text();
  const reqHeaders = Object.fromEntries(req.headers);
  const webhookId = reqHeaders["webhook-id"];

  // 1) verify (per-ruleKey secret from KV; env fallback for a single-sub setup).
  const ruleKey = ruleKeyFromPath(req.url);
  const secret = getByRuleKey(ruleKey)?.signingSecret ?? FALLBACK_SECRET;
  if (secret && !verifyWebhookSignature(raw, reqHeaders, secret)) {
    return new Response("bad signature", { status: 401 });
  }

  // 2) short-circuit an already-handled delivery retry.
  if (alreadyHandled(webhookId)) return new Response("duplicate", { status: 200 });

  const payload = JSON.parse(raw) as ChainWebhook;

  // 3) reorg — an orphaned tx must NOT fire an audit (real retraction of an in-flight adjudication
  //    is M4). Acknowledge + drop.
  if (payload.action === "rollback") {
    console.log(
      `[bridge] rollback acked: tx ${payload.tx_id ?? "?"} @ ${payload.block_height ?? "?"} — no dispatch`,
    );
    markHandled(webhookId);
    return new Response("rollback acked", { status: 204 });
  }

  const event = payload.event;
  const contractId = event?.contract_id ?? event?.asset_identifier?.split("::")[0];
  const fnName = event?.function_name;
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

  // 5) event-level dedup (tx-based) — a replay/re-delivery of the same event is a no-op.
  const key = dedupKey(payload.tx_id, contractId, fnName);
  if (isDuplicate(key)) {
    markHandled(webhookId);
    return new Response("duplicate event", { status: 200 });
  }

  // 6) PRE-FILTER — benign ⇒ log + 204, ZERO spend.
  const verdict = classify(fn, event as ChainEventBody);
  if (!verdict.notable) {
    console.log(`[bridge] benign ${contractId}.${fnName}: ${verdict.reason} — no spend`);
    markHandled(webhookId);
    return new Response(`benign: ${verdict.reason}`, { status: 204 });
  }

  // 7) debounce floody classes (governance is exempt — every distinct proposal must be audited;
  //    dedup already blocks exact refire, the spend ceiling is the ultimate cap).
  if (!GOVERNANCE_CLASSES.includes(fn.triggerClass)) {
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
  const { message, directive } = await buildDirective(
    config,
    fn,
    event as ChainEventBody,
    verdict,
    {
      txId: payload.tx_id,
      blockHeight: payload.block_height,
    },
  );
  const dispatch = await dispatchToEve(message, tier);
  if (!dispatch.ok) {
    // transient — let the server retry (do NOT mark handled).
    return new Response("eve error", { status: 502 });
  }

  // 10) commit: dedup + debounce + trigger→session ledger (M4 reads this with readRun(sessionId)).
  const sessionId = dispatch.sessionId ?? `unknown:${key}`;
  commitDispatch(key, {
    sessionId,
    contractId,
    fn: fnName,
    triggerClass: fn.triggerClass,
    tier,
    txId: payload.tx_id,
    blockHeight: payload.block_height,
    deadlineBlock: directive.deadline_block,
    auditTargets: directive.audit_targets,
    suspicious: verdict.suspicious,
    dispatchedAt: new Date().toISOString(),
  });
  markHandled(webhookId);
  console.log(
    `[bridge] dispatched ${tier} audit for ${contractId}.${fnName} (${directive.audit_targets.length} targets, session ${sessionId})`,
  );
  return new Response("queued", { status: 202 });
}

// Minimal Bun server when run directly.
if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3001);
  Bun.serve({
    port,
    fetch: (req) =>
      req.method === "POST" ? handle(req) : new Response("POST only", { status: 405 }),
  });
  console.log(
    `secondlayer-webhook bridge listening on :${port} (deep -> ${sessionUrlForTier("deep")})`,
  );
}
