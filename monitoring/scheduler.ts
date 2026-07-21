/**
 * Scheduled-eval runner — the poll lane's cadence, and the missing enabler for the invariant lane.
 *
 * The reactive lane is push (secondlayer webhook → bridge). The invariant lane is POLL: it needs
 * something to call it on an interval. This is that something. An interval loop runs the invariant
 * registry (→ adjudicate → notify, via invariant-pipeline) every SENTINEL_SCHEDULE_INTERVAL_MS. It
 * runs as its OWN container/service (`bun run scheduler`) so it restarts independently of the bridge
 * and shares only the durable sink (warn-once state, snapshots). The cadence is a seam: swap this
 * in-process interval for a platform cron hitting a /tick endpoint without touching `runScheduledTick`.
 *
 * Drift-check (monthly clarity-drift) is a PLANNED second job — `check_clarity_drift` was gutted with
 * eve and is re-added in Tier 4. Until then the tick announces it is not wired (never a silent skip —
 * the credibility rule). Wire it into `runScheduledTick` when it lands.
 */
import type { Invariant, ObservationReader } from "./invariant";
import { runInvariantRegistry } from "./invariant-pipeline";
import { POX5_INVARIANTS } from "./pox5-bond-ops";

export type TickResult = {
  at: string;
  invariants: number;
  violations: number;
  alerted: number;
  driftCheck: "not-wired";
};

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 min — reserve/backing invariants; tune per cadence needs

function intervalMs(): number {
  const raw = Number(process.env.SENTINEL_SCHEDULE_INTERVAL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INTERVAL_MS;
}

/**
 * One evaluation tick: run every registered invariant → adjudicate/notify → summarise. Injectable
 * (invariants + reader) so it unit-tests without a chain. `now` is passed in (never read from a clock
 * inside) so a test is deterministic.
 */
export async function runScheduledTick(opts?: {
  invariants?: readonly Invariant[];
  reader?: ObservationReader;
  now?: string;
}): Promise<TickResult> {
  const invariants = opts?.invariants ?? POX5_INVARIANTS;
  const at = opts?.now ?? new Date().toISOString();
  const results = await runInvariantRegistry(invariants, opts?.reader);
  const violations = results.reduce((n, r) => n + r.violations, 0);
  const alerted = results.filter((r) => r.sent).length;
  console.log(
    `[scheduler] tick ${at} — invariants=${results.length} violations=${violations} alerted=${alerted}` +
      " · drift-check: NOT YET WIRED (Tier 4, check_clarity_drift re-add)",
  );
  return { at, invariants: results.length, violations, alerted, driftCheck: "not-wired" };
}

/**
 * Start the interval loop: one tick at boot, then every `ms`. Non-overlapping (a slow tick skips the
 * next rather than piling up). Returns a stop() handle. This is the runtime shell; the testable unit
 * is `runScheduledTick`.
 */
export function startScheduler(ms: number = intervalMs()): () => void {
  console.log(`[scheduler] starting — interval ${ms}ms, ${POX5_INVARIANTS.length} invariant(s)`);
  let running = false;
  const tick = async () => {
    if (running) {
      console.warn("[scheduler] previous tick still running — skipping this interval");
      return;
    }
    running = true;
    try {
      await runScheduledTick();
    } catch (e) {
      console.error(`[scheduler] tick error: ${(e as Error).message}`);
    } finally {
      running = false;
    }
  };
  void tick(); // run once immediately at boot
  const handle = setInterval(() => void tick(), ms);
  return () => clearInterval(handle);
}

if (import.meta.main) {
  startScheduler();
  // Keep the process alive; the interval holds the event loop.
}
