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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Adjudication } from "./adjudication";

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

/** The internal alert payload (never a disclosure action). */
function buildPayload(adj: Adjudication, level: string) {
  return {
    event: "sentinel_alert",
    level,
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

async function emit(adj: Adjudication, level: string): Promise<void> {
  const payload = buildPayload(adj, level);
  // eslint-disable-next-line no-console
  console.warn(
    `[notify] ${level} — ${adj.contractId} ${adj.severity}/${adj.class} poc=${adj.pocStatus}` +
      `${adj.provisional ? " (provisional)" : ""} | ${adj.recommendedAction} | session ${adj.sessionId}`,
  );
  const url = process.env.SENTINEL_NOTIFY_URL; // internal channel only
  if (url) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error(`[notify] channel POST failed: ${(err as Error).message}`);
    }
  }
}

/**
 * Route an adjudication. Idempotent per session (warn-once), except a provisional→green promotion.
 * Returns whether an alert was sent and why.
 */
export async function notify(adj: Adjudication): Promise<NotifyResult> {
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
  await emit(adj, level);

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
