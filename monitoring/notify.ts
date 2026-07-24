/**
 * Notify (M4) — route an adjudication to ONE internal alert channel, human-gated and warn-once.
 *
 * Hard rules:
 *  - DISCLOSURE IS HUMAN-GATED. This emits an INTERNAL alert only (a loud log + an optional
 *    SENTINEL_NOTIFY_URL webhook to a Slack/PagerDuty-style channel). It NEVER contacts a project,
 *    files a bounty, or publishes a PoC — no automated outward disclosure, ever.
 *  - WARN-ONCE. Each session alerts at most once (idempotent across re-adjudication / re-runs),
 *    so an accepted-waiver finding (suppressed to alertLevel "none") never pages, and a real
 *    finding doesn't re-page on every poll.
 *  - AUTO-PROMOTE. The single exception to warn-once: a session first alerted as PROVISIONAL
 *    (verdict ahead of PoC) emits one more notice when a later adjudication shows the PoC green.
 *
 * State persists in `.sentinel/notifications.json` (same seam as the rest; external KV in prod).
 */
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Adjudication } from "./adjudication";
import { renderSummary } from "./render-summary";

const STATE_DIR = process.env.SENTINEL_SINK_DIR ?? join(process.cwd(), ".sentinel");
const STATE_PATH = join(STATE_DIR, "notifications.json");

type NotifiedRecord = {
  sessionId: string;
  alertLevel: Adjudication["alertLevel"];
  severity: Adjudication["severity"];
  provisional: boolean;
  pocStatus: Adjudication["pocStatus"];
  promoted: boolean;
  notifiedAt: string;
};

type State = Record<string, NotifiedRecord>;

function load(): State {
  if (!existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8")) as State;
  } catch {
    return {};
  }
}

function save(state: State): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export type NotifyResult = {
  sent: boolean;
  reason: string;
  /** "WARN" | "INFO" | "PROMOTED" when sent. */
  level?: string;
  promoted?: boolean;
};

/** The internal alert payload (never a disclosure action). `summary` is the house-voice prose the human
 *  being paged reads first; the structured fields below remain for machine routing. */
export function buildPayload(adj: Adjudication, level: string, summary: string) {
  return {
    event: "sentinel_alert",
    level,
    summary,
    sessionId: adj.sessionId,
    contractId: adj.contractId,
    severity: adj.severity,
    class: adj.class,
    pocStatus: adj.pocStatus,
    provisional: adj.provisional,
    needsHuman: adj.needsHuman,
    suppressed: adj.suppressed,
    recommendedAction: adj.recommendedAction,
    tokenCostUsd: adj.tokenCostUsd,
    keptFindings: adj.findings
      .filter((f) => f.kept)
      .map((f) => ({ title: f.title, severity: f.severity, class: f.class })),
    disclosure: "human-gated — no automated action taken",
  };
}

/**
 * Sign an outbound payload with Standard Webhooks HMAC — SYMMETRIC with the ingress
 * `verifyWebhookSignature` (round-trip verified). Headers `webhook-id` / `webhook-timestamp` /
 * `webhook-signature`; signed content `id.timestamp.body`; HMAC-SHA256 → base64, `v1,`-prefixed. The
 * secret may be `whsec_<base64>` (key = decoded bytes) or a raw string (key = utf8).
 */
export function signStandardWebhook(
  body: string,
  secret: string,
  id: string,
  tsSec: number,
): Record<string, string> {
  const key = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret, "utf8");
  const sig = createHmac("sha256", key).update(`${id}.${tsSec}.${body}`).digest("base64");
  return { "webhook-id": id, "webhook-timestamp": String(tsSec), "webhook-signature": `v1,${sig}` };
}

async function emit(
  adj: Adjudication,
  level: string,
  render: (adj: Adjudication) => Promise<string>,
): Promise<void> {
  const summary = await render(adj); // house-voice prose; never throws (falls back to a template)
  const payload = buildPayload(adj, level, summary);
  // eslint-disable-next-line no-console
  console.warn(
    `[notify] ${level} — ${adj.contractId} ${adj.severity}/${adj.class} poc=${adj.pocStatus}` +
      `${adj.provisional ? " (provisional)" : ""} | ${summary.split("\n")[0]} | session ${adj.sessionId}`,
  );
  const url = process.env.SENTINEL_NOTIFY_URL; // internal channel only
  if (!url) return;

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env.SENTINEL_NOTIFY_SECRET;
  if (secret) {
    const id = `msg_${adj.sessionId}:${level}`;
    Object.assign(headers, signStandardWebhook(body, secret, id, Math.floor(Date.now() / 1000)));
  } else {
    // Never silently ship unsigned — a downstream verifier can't trust it, and quiet is dishonest.
    console.warn(
      "[notify] SENTINEL_NOTIFY_SECRET unset — POSTing UNSIGNED; set it to sign egress.",
    );
  }
  try {
    await fetch(url, { method: "POST", headers, body });
  } catch (err) {
    console.error(`[notify] channel POST failed: ${(err as Error).message}`);
  }
}

/**
 * Route an adjudication. Idempotent per session (warn-once), except a provisional→green promotion.
 * Returns whether an alert was sent and why.
 */
export async function notify(
  adj: Adjudication,
  render: (adj: Adjudication) => Promise<string> = renderSummary,
): Promise<NotifyResult> {
  const state = load();
  const prior = state[adj.sessionId];

  if (adj.alertLevel === "none") {
    return { sent: false, reason: "no actionable findings (clean / all refuted or waived)" };
  }

  const promotion = Boolean(prior?.provisional && !adj.provisional && adj.pocStatus === "green");
  if (prior && !promotion) {
    return { sent: false, reason: "already notified (warn-once)" };
  }

  const level = promotion ? "PROMOTED" : adj.alertLevel.toUpperCase();
  await emit(adj, level, render); // render only happens here — no summary work for skipped alerts

  state[adj.sessionId] = {
    sessionId: adj.sessionId,
    alertLevel: adj.alertLevel,
    severity: adj.severity,
    provisional: adj.provisional,
    pocStatus: adj.pocStatus,
    promoted: promotion || (prior?.promoted ?? false),
    notifiedAt: new Date().toISOString(),
  };
  save(state);
  return {
    sent: true,
    reason: promotion ? "provisional promoted on green PoC" : "alert sent",
    level,
    promoted: promotion,
  };
}
