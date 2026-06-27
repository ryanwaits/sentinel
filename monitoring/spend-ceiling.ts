/**
 * Global daily spend ceiling — a hard cost cap on the audit-on-trigger path, enforced at
 * DISPATCH (before a sweep fires), so the public webhook is never exposed uncapped.
 *
 * A public webhook + per-trigger spend is a budget-drain weapon: a flood of cheap `propose`
 * calls each dispatches a ~$2 Deep sweep. Debounce/dedup/code-hash-cache reduce volume, but the
 * last line of defense is this ceiling: reserve the tier's estimated cost against a daily budget
 * BEFORE dispatching; on breach, PAUSE the path (deny further dispatches) and PAGE.
 *
 * Why estimate-at-dispatch (not actual-after-run): you must cap BEFORE spending, not reconcile
 * after. Actual cost (from monitoring/run-reader.ts usage.costUsd) can `reconcile()` the accumulator
 * once a run finishes, but the gate uses the known per-tier estimate.
 *
 * MVP state = one JSON file under SENTINEL_SINK_DIR (default .sentinel). Vercel FS is ephemeral →
 * M2 swaps the load/save seam for the same external KV as the rest of the durable state. Single
 * writer assumed (the bridge); a multi-instance bridge needs an atomic KV increment (noted for M2).
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Tier = "monitor" | "deep";

/** Per-tier per-sweep cost estimates (USD), from docs/monitoring-build.md §4 (proven Zest figures). */
export const TIER_ESTIMATE_USD: Record<Tier, number> = {
  monitor: 1.11, // Sonnet x8 (~$0.20) + Opus verifier (~$0.91)
  deep: 2.0, // Opus x8 + verifier
};

const STATE_DIR = process.env.SENTINEL_SINK_DIR ?? join(process.cwd(), ".sentinel");
const STATE_PATH = join(STATE_DIR, "spend.json");
const PAUSED_FLAG = join(STATE_DIR, "PAUSED");

export const DAILY_CEILING_USD = Number(process.env.SENTINEL_DAILY_CEILING_USD ?? "20");

export type SpendState = {
  /** UTC date (YYYY-MM-DD) the spend total applies to; rolls over daily. */
  date: string;
  /** Reserved (estimated) USD spent today. */
  spentUsd: number;
  dispatches: number;
  /** Paused persists across day rollover until a human clears it (fail-safe). */
  paused: boolean;
  pausedReason?: string;
  pausedAt?: string;
};

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function load(now: Date): SpendState {
  let s: SpendState;
  try {
    s = JSON.parse(readFileSync(STATE_PATH, "utf8")) as SpendState;
  } catch {
    s = { date: utcDate(now), spentUsd: 0, dispatches: 0, paused: false };
  }
  // Day rollover: reset spend, but keep a human-set pause in place (don't auto-reopen the path).
  if (s.date !== utcDate(now)) {
    s = {
      date: utcDate(now),
      spentUsd: 0,
      dispatches: 0,
      paused: s.paused,
      pausedReason: s.pausedReason,
      pausedAt: s.pausedAt,
    };
  }
  return s;
}

function save(s: SpendState): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(s, null, 2)}\n`, "utf8");
}

/**
 * PAGE on breach. M0 mechanism: loud log + a durable `PAUSED` marker file + an optional webhook
 * POST (SENTINEL_PAGER_URL). A real Slack/PagerDuty channel is M4's notify path; this is the
 * always-on cost-safety alert that ships WITH the webhook.
 */
async function page(reason: string, state: SpendState): Promise<void> {
  // eslint-disable-next-line no-console
  console.error(
    `[spend-ceiling] PAGE — path PAUSED: ${reason} | spent=$${state.spentUsd.toFixed(2)} ceiling=$${DAILY_CEILING_USD} dispatches=${state.dispatches}`,
  );
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(PAUSED_FLAG, `${state.pausedAt ?? ""} ${reason}\n`, "utf8");
  } catch {}
  const url = process.env.SENTINEL_PAGER_URL;
  if (url) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "spend_ceiling_breached",
          reason,
          state,
          ceilingUsd: DAILY_CEILING_USD,
        }),
      });
    } catch {}
  }
}

export type ReserveResult = {
  allowed: boolean;
  reason?: string;
  estimateUsd: number;
  state: SpendState;
};

/**
 * Reserve the estimated cost of one dispatch against the daily ceiling.
 * Call this BEFORE dispatching a sweep; only dispatch when `allowed` is true.
 *  - if already paused -> deny.
 *  - if spent + estimate would exceed the ceiling -> set paused, page, deny.
 *  - else -> add estimate, persist, allow.
 */
export async function reserve(tier: Tier, now: Date = new Date()): Promise<ReserveResult> {
  const estimateUsd = TIER_ESTIMATE_USD[tier];
  const s = load(now);

  if (s.paused) {
    return { allowed: false, reason: s.pausedReason ?? "path paused", estimateUsd, state: s };
  }

  const projected = s.spentUsd + estimateUsd;
  if (projected > DAILY_CEILING_USD) {
    s.paused = true;
    s.pausedReason = `daily ceiling reached: $${s.spentUsd.toFixed(2)} + $${estimateUsd.toFixed(2)} (${tier}) > $${DAILY_CEILING_USD}`;
    s.pausedAt = now.toISOString();
    save(s);
    await page(s.pausedReason, s);
    return { allowed: false, reason: s.pausedReason, estimateUsd, state: s };
  }

  s.spentUsd = projected;
  s.dispatches += 1;
  save(s);
  return { allowed: true, estimateUsd, state: s };
}

/** Replace a dispatch's estimate with the run's actual cost once known (from run-reader usage). */
export function reconcile(
  estimateUsd: number,
  actualUsd: number,
  now: Date = new Date(),
): SpendState {
  const s = load(now);
  s.spentUsd = Math.max(0, s.spentUsd - estimateUsd + actualUsd);
  save(s);
  return s;
}

export function getState(now: Date = new Date()): SpendState {
  return load(now);
}

export function isPaused(now: Date = new Date()): boolean {
  return load(now).paused;
}

/** Human ack: clear the pause and remove the marker. Spend total is left as-is. */
export function clearPause(now: Date = new Date()): SpendState {
  const s = load(now);
  s.paused = false;
  s.pausedReason = undefined;
  s.pausedAt = undefined;
  save(s);
  try {
    if (existsSync(PAUSED_FLAG)) unlinkSync(PAUSED_FLAG);
  } catch {}
  return s;
}

// CLI: inspect / clear / simulate.  `bun run monitoring/spend-ceiling.ts [state|clear]`
if (import.meta.main) {
  const cmd = process.argv[2] ?? "state";
  if (cmd === "clear") {
    console.log(JSON.stringify(clearPause(), null, 2));
  } else {
    console.log(JSON.stringify({ ceilingUsd: DAILY_CEILING_USD, ...getState() }, null, 2));
  }
}
