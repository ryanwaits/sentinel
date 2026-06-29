/**
 * secondlayer subscription -> eve  (HTTP webhook ingress bridge)
 *
 * A secondlayer CHAIN subscription POSTs here when a watched, value-holding contract changes
 * state (contract_call on an admin fn, large ft_transfer, contract_deploy by the same team, …).
 * We verify the Standard-Webhooks signature, map the decoded chain event to an audit request, and
 * forward it to the eve agent's built-in HTTP session endpoint — re-auditing on every meaningful
 * change.
 *
 * Lives OUTSIDE agent/ so eve's channel discovery doesn't try to compile it as a native channel.
 * Once eve's `defineChannel` route API stabilizes, this collapses into agent/channels/secondlayer.ts.
 * Run as a tiny Bun/Vercel function:
 *
 *   bun run webhooks/secondlayer-webhook.ts   (PORT=3001 by default)
 *
 * URL scheme: the provisioner registers each subscription with `url = <BRIDGE_BASE_URL>/<ruleKey>`,
 * so the path segment IS the ruleKey. The bridge resolves the per-subscription signing secret from
 * the durable sub-store by that ruleKey (env SECONDLAYER_WEBHOOK_SECRET is the single-sub fallback).
 *
 * Env: EVE_SESSION_URL (default http://127.0.0.1:3000/eve/v1/session),
 *      SECONDLAYER_WEBHOOK_SECRET (fallback signing secret when no per-ruleKey record exists).
 */
import { verifyWebhookSignature } from "@secondlayer/sdk";
import { eveAuthEnabled, mintEveSessionToken } from "../monitoring/eve-jwt";
import { reserve, type Tier } from "../monitoring/spend-ceiling";
import { getByRuleKey } from "../monitoring/sub-store";

const EVE_SESSION_URL = process.env.EVE_SESSION_URL ?? "http://127.0.0.1:3000/eve/v1/session";
const FALLBACK_SECRET = process.env.SECONDLAYER_WEBHOOK_SECRET ?? "";

/**
 * The decoded chain-subscription envelope (Standard Webhooks body). The triggering contract +
 * function live under `event.*` — NOT at the top level. `action` is "apply" on a canonical block
 * and "rollback" when a reorg orphans a previously-delivered tx.
 */
type ChainWebhook = {
  action?: "apply" | "rollback";
  trigger?: string;
  block_hash?: string;
  block_height?: number;
  tx_id?: string;
  canonical?: boolean;
  event?: {
    type?: string;
    contract_id?: string;
    function_name?: string;
    function_args?: string[];
    sender?: string;
    status?: string;
    result_hex?: string;
    asset_identifier?: string;
  };
};

/**
 * MVP tier = trigger-class policy (governance/proxy-upgrade -> Deep; else Monitor), NOT TVL-driven
 * (the stakes->tier router needs the asset-holdings subgraph + price feed, M3+). Defaults to Deep
 * (worst case) when the fn is unknown, so the ceiling never under-reserves.
 */
function classifyTier(ev: ChainWebhook["event"]): Tier {
  const fn = (ev?.function_name ?? "").toLowerCase();
  const monitorish = ["transfer", "deposit", "withdraw"];
  if (monitorish.some((m) => fn.includes(m))) return "monitor";
  return "deep";
}

/**
 * Idempotency: Standard Webhooks retries carry a STABLE `webhook-id` header. The server owns
 * retry/backoff/dead-letter; the bridge just stays idempotent + returns 2xx. In-memory dedup is the
 * MVP — bounded so a long-lived process can't leak; swap for the durable sub-store / external KV in
 * prod alongside the sub records.
 */
const SEEN_CAP = 5000;
const seen = new Set<string>();
function markSeen(id: string): boolean {
  if (seen.has(id)) return true;
  if (seen.size >= SEEN_CAP) seen.clear();
  seen.add(id);
  return false;
}

/** Resolve the ruleKey from the request path (`/<ruleKey>`), URL-decoded. */
function ruleKeyFromPath(url: string): string {
  const path = new URL(url).pathname.replace(/^\/+/, "");
  return decodeURIComponent(path);
}

export async function handle(req: Request): Promise<Response> {
  const raw = await req.text();
  const reqHeaders = Object.fromEntries(req.headers);

  // 1) verify it really came from secondlayer (Standard Webhooks HMAC). Secret is resolved by the
  //    ruleKey in the URL path; env fallback covers a single-sub setup / pre-reconciler smoke.
  const ruleKey = ruleKeyFromPath(req.url);
  const secret = getByRuleKey(ruleKey)?.signingSecret ?? FALLBACK_SECRET;
  if (secret && !verifyWebhookSignature(raw, reqHeaders, secret)) {
    return new Response("bad signature", { status: 401 });
  }

  // 2) idempotency — a retried delivery (same webhook-id) is a no-op 2xx.
  const webhookId = reqHeaders["webhook-id"];
  if (webhookId && markSeen(webhookId)) {
    return new Response("duplicate", { status: 200 });
  }

  const payload = JSON.parse(raw) as ChainWebhook;

  // 3) reorg — an orphaned tx must NOT fire an audit. Acknowledge + drop (real retraction of any
  //    in-flight adjudication is M3/M4). Server delivers up to 500 orphans per rollback.
  if (payload.action === "rollback") {
    console.log(
      `[bridge] rollback (reorg) acked: tx ${payload.tx_id ?? "?"} @ block ${payload.block_height ?? "?"} — no dispatch`,
    );
    return new Response("rollback acked", { status: 204 });
  }

  // 4) map the decoded event -> an audit target. A test/ping or a contract-less event verifies the
  //    signature path but has nothing to audit -> accept as a no-op (keeps test(id) green w/o spend).
  const ev = payload.event;
  const contractId = ev?.contract_id ?? ev?.asset_identifier?.split("::")[0];
  if (!contractId) {
    return new Response("accepted (no contract to audit)", { status: 200 });
  }

  // 5) GLOBAL DAILY SPEND CEILING — reserve the tier's estimated cost BEFORE dispatching, so the
  //    path is never exposed uncapped. On breach the ceiling pauses + pages; we shed the trigger.
  const tier = classifyTier(ev);
  const gate = await reserve(tier);
  if (!gate.allowed) {
    return new Response(`spend ceiling: ${gate.reason}`, { status: 429 });
  }

  const message =
    `State change on ${contractId} (${ev?.type ?? "event"} ${ev?.function_name ?? ""} @ block ${payload.block_height ?? "?"}, tx ${payload.tx_id ?? "?"}). ` +
    `Re-audit it: fetch source, run the auditor-* subagents, verify findings, reproduce any confirmed high/critical with run_simnet_poc, and report.`;

  // 6) forward to the eve agent (built-in HTTP session endpoint), authed with a short-lived HMAC JWT
  //    so an unauthenticated POST can't force a (budgeted) sweep.
  const eveHeaders: Record<string, string> = { "content-type": "application/json" };
  if (eveAuthEnabled()) eveHeaders.authorization = `Bearer ${mintEveSessionToken()}`;
  const res = await fetch(EVE_SESSION_URL, {
    method: "POST",
    headers: eveHeaders,
    body: JSON.stringify({ message }),
  });
  return new Response(res.ok ? "queued" : "eve error", { status: res.ok ? 202 : 502 });
}

// Minimal Bun server when run directly.
if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3001);
  Bun.serve({
    port,
    fetch: (req) =>
      req.method === "POST" ? handle(req) : new Response("POST only", { status: 405 }),
  });
  console.log(`secondlayer-webhook bridge listening on :${port} -> ${EVE_SESSION_URL}`);
}
