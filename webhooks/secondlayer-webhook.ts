/**
 * secondlayer subscription -> eve  (HTTP webhook ingress bridge)
 *
 * A secondlayer chain-subscription POSTs here when a watched, value-holding
 * contract changes state (contract_call on an admin fn, large ft_transfer,
 * contract_deploy by the same team, etc). We verify the signature, map the
 * event to an audit request, and forward it to the eve agent's built-in HTTP
 * session endpoint — re-auditing the contract on every meaningful change.
 *
 * Lives OUTSIDE agent/ so eve's channel discovery doesn't try to compile it as a
 * native channel. Once eve's `defineChannel` route API stabilizes, this collapses
 * into agent/channels/secondlayer.ts. Run as a tiny Bun/Vercel function.
 *
 *   bun run webhooks/secondlayer-webhook.ts   (PORT=3001 by default)
 *
 * Env: SECONDLAYER_WEBHOOK_SECRET (per-subscription signing secret),
 *      EVE_SESSION_URL (default http://127.0.0.1:3000/eve/v1/session).
 */
import { verifyWebhookSignature } from "@secondlayer/sdk";

const EVE_SESSION_URL = process.env.EVE_SESSION_URL ?? "http://127.0.0.1:3000/eve/v1/session";
const SECRET = process.env.SECONDLAYER_WEBHOOK_SECRET ?? "";

type ChainEvent = {
  event?: { type?: string; asset_identifier?: string };
  // chain-subscription envelope carries the triggering contract on the tx
  tx_id?: string;
  block_height?: number;
  contract_id?: string;
};

export async function handle(req: Request): Promise<Response> {
  const raw = await req.text();
  const headers = Object.fromEntries(req.headers);

  // 1) verify it really came from secondlayer (Standard Webhooks HMAC)
  if (SECRET && !verifyWebhookSignature(raw, headers, SECRET)) {
    return new Response("bad signature", { status: 401 });
  }

  // 2) map the event -> an audit request
  const payload = JSON.parse(raw) as ChainEvent;
  const contractId = payload.contract_id ?? payload.event?.asset_identifier?.split("::")[0];
  if (!contractId) return new Response("no contract in payload", { status: 422 });

  const message =
    `State change on ${contractId} (${payload.event?.type ?? "event"} @ block ${payload.block_height ?? "?"}, tx ${payload.tx_id ?? "?"}). ` +
    `Re-audit it: fetch source, run the auditor-* subagents, verify findings, reproduce any confirmed high/critical with run_simnet_poc, and report.`;

  // 3) forward to the eve agent (built-in HTTP session endpoint)
  const res = await fetch(EVE_SESSION_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return new Response(res.ok ? "queued" : "eve error", { status: res.ok ? 202 : 502 });
}

// Minimal Bun server when run directly.
if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3001);
  Bun.serve({ port, fetch: (req) => (req.method === "POST" ? handle(req) : new Response("POST only", { status: 405 })) });
  console.log(`secondlayer-webhook bridge listening on :${port} -> ${EVE_SESSION_URL}`);
}
