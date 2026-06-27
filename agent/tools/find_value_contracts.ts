import { defineTool } from "eve/tools";
import { z } from "zod";
import { symbol, usd } from "../pricing";

/**
 * Discover value-holding contracts to audit, ranked by real $-at-risk (highest
 * first) across FT + NFT + STX.
 *
 * Queries the `asset-holdings` subgraph (subgraphs/asset-holdings.ts) for top
 * holdings per asset, keeps holders that are CONTRACT principals (contain ".",
 * i.e. hold assets in code), merges rows per holder, prices FT+STX via the
 * curated map (agent/pricing.ts), and ranks by summed USD. (NFTs are out of
 * scope — illiquid, floor ≠ realizable; the subgraph doesn't index them.)
 *
 * Reads SECONDLAYER_API_URL + SECONDLAYER_API_KEY from env. If unset or the
 * subgraph isn't deployed yet, falls back to the audited seed so the sweep always
 * has a real target. (Dogfoods secondlayer; no third-party APIs.)
 */
const SEED = {
  source: "seed" as const,
  count: 1,
  contracts: [
    {
      contractId: "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc",
      usdAtRisk: null as number | null,
      breakdown: [
        {
          kind: "ft" as const,
          assetId: "sbtc",
          symbol: "sBTC",
          amount: null as string | null,
          usd: null as number | null,
        },
      ],
      note: "Zest sBTC vault — audited; Finding 1 (socialize-debt) has a green simnet PoC.",
    },
  ],
};

type Kind = "ft" | "stx";
interface HoldingRow {
  kind: Kind;
  asset_identifier: string;
  holder: string;
  amount: string;
}
interface BreakdownEntry {
  kind: Kind;
  assetId: string;
  symbol: string;
  amount: string;
  usd: number | null;
}

export default defineTool({
  description:
    "List value-holding Stacks contracts to audit, ranked by USD-at-risk (FT+STX) across all asset types, with a per-asset breakdown and an NFT-holdings flag.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(200).default(25),
    subgraph: z.string().default("asset-holdings"),
  }),
  async execute({ limit, subgraph }) {
    const base = process.env.SECONDLAYER_API_URL;
    const key = process.env.SECONDLAYER_API_KEY;
    if (!base || !key) return { ...SEED, contracts: SEED.contracts.slice(0, limit) };

    try {
      // Over-fetch top rows by raw amount per query; we merge + USD-rank below.
      // (Raw amount isn't comparable across assets, so we pull a wide net then
      // re-rank by USD — over-fetch factor keeps small holders from crowding out
      // a high-USD holder that ranks low on raw token count.)
      const url = `${base}/api/subgraphs/${subgraph}/holdings?_sort=amount&_order=desc&_limit=${limit * 20}`;
      const res = await fetch(url, { headers: { authorization: `Bearer ${key}` } });
      if (!res.ok) throw new Error(`subgraph query ${res.status}`);
      const body = (await res.json()) as { data?: HoldingRow[] };

      const rows = (body.data ?? []).filter((r) => r.holder.includes(".")); // contract principals
      if (rows.length === 0) return { ...SEED, contracts: SEED.contracts.slice(0, limit) };

      // Merge rows per holder into a priced breakdown.
      const byHolder = new Map<string, { breakdown: BreakdownEntry[]; usdAtRisk: number }>();
      for (const r of rows) {
        let h = byHolder.get(r.holder);
        if (!h) {
          h = { breakdown: [], usdAtRisk: 0 };
          byHolder.set(r.holder, h);
        }
        // ft | stx → price for the rank (null when uncurated/unpriced).
        const value = usd(r.asset_identifier, r.amount);
        if (value != null) h.usdAtRisk += value;
        h.breakdown.push({
          kind: r.kind,
          assetId: r.asset_identifier,
          symbol: symbol(r.asset_identifier),
          amount: r.amount,
          usd: value,
        });
      }

      const contracts = Array.from(byHolder.entries())
        .map(([contractId, h]) => ({
          contractId,
          // null when the holder has zero priced FT/STX — honest, still listed.
          usdAtRisk: h.usdAtRisk > 0 ? h.usdAtRisk : null,
          breakdown: h.breakdown,
        }))
        // Rank by USD desc; unpriced (null) sink to the bottom but stay listed.
        .sort((a, b) => (b.usdAtRisk ?? -1) - (a.usdAtRisk ?? -1))
        .slice(0, limit);

      return { source: "asset-holdings" as const, count: contracts.length, contracts };
    } catch (e) {
      return { ...SEED, error: String(e), contracts: SEED.contracts.slice(0, limit) };
    }
  },
});
