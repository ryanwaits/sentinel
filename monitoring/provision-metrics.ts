/**
 * Provision metrics — turns the provisioner's "measure the N-sub pain" claim into actual data, so
 * f043 (watchlist-provisioning: collapse N create calls → 1) is a measured decision, not a vibe.
 *
 * Two append-only JSONL ledgers under SENTINEL_SINK_DIR (same seam as sub-store / spend-ceiling):
 *  - provision-metrics.jsonl  — one record per FULL reconcile (`--apply`, no `--only`): the N (sub
 *    count for the contract), the create/update/delete diff, and the wall-clock latency of applying
 *    it. This is the N-sub-pain signal: how many subs per contract, how slow N creates are.
 *  - delivery-metrics.jsonl   — one record per `--test` smoke: did the signed test webhook land, and
 *    how many of the recent deliveries failed (the silent-trigger-outage signal).
 *
 * ⚠️ Vercel FS is ephemeral → swap for an external KV in prod; this module is the seam where that
 * happens (same note as sub-store.ts).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const STATE_DIR = process.env.SENTINEL_SINK_DIR ?? join(process.cwd(), ".sentinel");
const RECONCILE_PATH = join(STATE_DIR, "provision-metrics.jsonl");
const DELIVERY_PATH = join(STATE_DIR, "delivery-metrics.jsonl");

/** One full-reconcile measurement — the f043 N-sub-pain signal. */
export type ReconcileMetric = {
  ts: string;
  contractId: string;
  /** Desired sub count for this contract (= sensitive fns) — the "N" f043 would collapse to 1. */
  n: number;
  created: number;
  updated: number;
  deleted: number;
  /** Wall-clock ms to apply the whole create/update/delete plan against the live account. */
  applyLatencyMs: number;
};

/** One delivery-health measurement from a `--test` smoke — the silent-outage signal. */
export type DeliveryMetric = {
  ts: string;
  ruleKey: string;
  subId: string;
  /** The synchronous test(id) result. `testStatus` null = no response received. */
  testOk: boolean;
  testStatus: number | null;
  /** Count of recent deliveries with a non-2xx status (failed/late). */
  recentFailures: number;
  recentTotal: number;
};

function appendLine(path: string, obj: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(obj)}\n`, "utf8");
}

function readLines<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

export function recordReconcile(m: ReconcileMetric): void {
  appendLine(RECONCILE_PATH, m);
}

export function recordDelivery(m: DeliveryMetric): void {
  appendLine(DELIVERY_PATH, m);
}

/** Percentile (nearest-rank) of a numeric series; 0 for an empty series. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)];
}

export type MetricsRollup = {
  reconciles: number;
  contracts: number;
  /** Sum of the latest N across distinct contracts — total live subs Sentinel manages by hand. */
  liveSubsManaged: number;
  /** Largest single-contract N seen — the worst N-sub fan-out. */
  maxN: number;
  applyLatencyP50Ms: number;
  applyLatencyP95Ms: number;
  deliveryTests: number;
  deliveryFailures: number;
};

/** Roll up both ledgers into the f043-deciding numbers. */
export function rollup(): MetricsRollup {
  const recs = readLines<ReconcileMetric>(RECONCILE_PATH);
  const dels = readLines<DeliveryMetric>(DELIVERY_PATH);

  // Latest N per contract (last reconcile wins) → the current hand-managed footprint.
  const latestNByContract = new Map<string, number>();
  for (const r of recs) latestNByContract.set(r.contractId, r.n);
  const latestNs = [...latestNByContract.values()];
  const latencies = recs.map((r) => r.applyLatencyMs);

  return {
    reconciles: recs.length,
    contracts: latestNByContract.size,
    liveSubsManaged: latestNs.reduce((a, b) => a + b, 0),
    maxN: latestNs.reduce((a, b) => Math.max(a, b), 0),
    applyLatencyP50Ms: percentile(latencies, 50),
    applyLatencyP95Ms: percentile(latencies, 95),
    deliveryTests: dels.length,
    deliveryFailures: dels.reduce((a, d) => a + d.recentFailures, 0),
  };
}

/** Human-readable rollup for the provisioner `--metrics` flag. */
export function formatRollup(): string {
  const r = rollup();
  return [
    "[provision-metrics] f043 N-sub-pain readout",
    `  reconciles=${r.reconciles}  contracts=${r.contracts}  liveSubsManaged=${r.liveSubsManaged}  maxN=${r.maxN}`,
    `  applyLatency p50=${r.applyLatencyP50Ms}ms p95=${r.applyLatencyP95Ms}ms`,
    `  deliveryTests=${r.deliveryTests}  deliveryFailures=${r.deliveryFailures}`,
  ].join("\n");
}
