/**
 * Outflow baseline — data-driven threshold suggestions from a contract's REAL on-chain outflow history
 * (secondlayer Index). Upgrades the audit's `suggestedOutflowThreshold` from "on-chain-cap-or-omit" to
 * "p99 of what actually left this contract" — no client needed, just real history. Advisory only: a
 * human reviews + promotes into `sentinel/kb/`; this never touches the LIVE gate the prefilter reads.
 *
 * Also the seed of the learned behavioral baseline (distinct-recipients / distribution) that a later
 * anomaly-detecting triage tier will consume.
 *
 *   . ./.env.local && bun run baseline <contractId> [limit]
 */
import { SecondLayer } from "@secondlayer/sdk";

export type OutflowSample = { asset: string; amount: bigint; recipient?: string };

export type AssetBaseline = {
  asset: string;
  count: number;
  p50: string;
  p95: string;
  p99: string;
  max: string;
  distinctRecipients: number;
  /** Suggested absolute threshold (p99) — advisory; a human promotes it into outflowThreshold. */
  suggestedAmount: string;
};

function slClient(): SecondLayer {
  const baseUrl = process.env.SECONDLAYER_API_URL;
  const apiKey = process.env.SECONDLAYER_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("SECONDLAYER_API_URL + SECONDLAYER_API_KEY required");
  return new SecondLayer({ baseUrl, apiKey, origin: "session" });
}

/** Fetch recent outflows (ft + stx) where sender = the contract, from the Index. */
export async function fetchOutflows(contractId: string, limit = 500): Promise<OutflowSample[]> {
  const sl = slClient();
  const out: OutflowSample[] = [];
  for (const eventType of ["ft_transfer", "stx_transfer"] as const) {
    const { events } = await sl.index.events.list({ eventType, sender: contractId, limit });
    for (const e of events as Array<Record<string, unknown>>) {
      const raw = String(e.amount ?? "");
      if (!/^\d+$/.test(raw)) continue;
      out.push({
        asset: eventType === "stx_transfer" ? "stx" : String(e.asset_identifier ?? "ft"),
        amount: BigInt(raw),
        recipient: typeof e.recipient === "string" ? e.recipient : undefined,
      });
    }
  }
  return out;
}

/** Nearest-rank percentile of a sorted bigint[]. */
export function percentile(sorted: bigint[], p: number): bigint {
  if (sorted.length === 0) return 0n;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)];
}

/** Pure: per-asset outflow distribution + a p99 suggested threshold. */
export function computeBaseline(samples: OutflowSample[]): AssetBaseline[] {
  const byAsset = new Map<string, OutflowSample[]>();
  for (const s of samples) {
    const list = byAsset.get(s.asset) ?? [];
    list.push(s);
    byAsset.set(s.asset, list);
  }
  const out: AssetBaseline[] = [];
  for (const [asset, list] of byAsset) {
    const sorted = list.map((s) => s.amount).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const recipients = new Set(list.map((s) => s.recipient).filter(Boolean));
    const p99 = percentile(sorted, 99).toString();
    out.push({
      asset,
      count: list.length,
      p50: percentile(sorted, 50).toString(),
      p95: percentile(sorted, 95).toString(),
      p99,
      max: (sorted[sorted.length - 1] ?? 0n).toString(),
      distinctRecipients: recipients.size,
      suggestedAmount: p99,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

// CLI: query the Index + print suggested thresholds (advisory — human promotes into sentinel/kb/).
if (import.meta.main) {
  const contractId = process.argv[2];
  const limit = Number(process.argv[3] ?? 500);
  if (!contractId) {
    console.error("usage: bun run baseline <contractId> [limit]");
    process.exit(1);
  }
  const samples = await fetchOutflows(contractId, limit);
  const baselines = computeBaseline(samples);
  console.log(`=== outflow baseline === ${contractId} (${samples.length} outflows sampled)\n`);
  if (!baselines.length) {
    console.log("no outflows found — no data-driven threshold; leave unset (fail-safe-triaged).");
  }
  for (const b of baselines) {
    console.log(
      `asset ${b.asset} | n=${b.count} recipients=${b.distinctRecipients} | p50=${b.p50} p95=${b.p95} p99=${b.p99} max=${b.max}`,
    );
    console.log(
      `  → suggestedOutflowThreshold: { "asset": "${b.asset}", "amount": "${b.suggestedAmount}" }   (review + promote into sentinel/kb/)`,
    );
  }
}
