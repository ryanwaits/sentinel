/**
 * Mint a short-lived HS256 bearer JWT for the eve session endpoint.
 *
 * The eve channel verifies these with `jwtHmac(...)` (see agent/channels/eve.ts). Both the
 * audit-on-trigger bridge (webhooks/secondlayer-webhook.ts) and the run reader
 * (monitoring/run-reader.ts) mint a token per request. Short TTL (default 2 min) bounds the
 * blast radius of a leaked token — the threat model is an attacker forging session POSTs to
 * drain budget, so a stolen long-lived token would itself be a budget-drain weapon.
 *
 * Node `crypto` only — no new dependency. Bridge runs on bun, reader on bun/node; both expose
 * `node:crypto`.
 */
import { createHmac } from "node:crypto";

export const EVE_JWT_ISSUER = "sentinel-bridge";
export const EVE_JWT_AUDIENCE = "eve-session";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export type MintOptions = {
  secret?: string;
  ttlSeconds?: number;
  issuer?: string;
  audience?: string;
  subject?: string;
  /** Inject a fixed now (seconds) for testing; defaults to wall clock. */
  nowSeconds?: number;
};

/** Returns a signed HS256 JWT, or throws if no secret is available. */
export function mintEveSessionToken(opts: MintOptions = {}): string {
  const secret = opts.secret ?? process.env.EVE_SESSION_SECRET;
  if (!secret) throw new Error("EVE_SESSION_SECRET not set — cannot mint eve session token");
  const iat = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const exp = iat + (opts.ttlSeconds ?? 120);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: opts.issuer ?? EVE_JWT_ISSUER,
      aud: opts.audience ?? EVE_JWT_AUDIENCE,
      sub: opts.subject ?? "sentinel",
      iat,
      exp,
    }),
  );
  const data = `${header}.${payload}`;
  const sig = b64url(createHmac("sha256", secret).update(data).digest());
  return `${data}.${sig}`;
}

/** True when a session secret is configured (auth is enforced). */
export function eveAuthEnabled(): boolean {
  return Boolean(process.env.EVE_SESSION_SECRET);
}
