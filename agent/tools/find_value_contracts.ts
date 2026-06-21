import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * Discover value-holding contracts to audit, ranked by TVL (highest first).
 *
 * Queries the `token-balances` subgraph (subgraphs/token-balances.ts) for the
 * top holders, keeps the ones whose holder is a CONTRACT principal (contains a
 * ".", i.e. holds assets in code), and returns them as audit targets.
 *
 * Reads SECONDLAYER_API_URL + SECONDLAYER_API_KEY from env. If unset or the
 * subgraph isn't deployed yet, falls back to the audited seed so the weekly
 * sweep always has a real target. (Dogfoods secondlayer; no third-party APIs.)
 */
const SEED = [
  {
    contractId: "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc",
    asset: "sbtc",
    amount: null as string | null,
    note: "Zest sBTC vault — audited; Finding 1 (socialize-debt) has a green simnet PoC.",
  },
];

export default defineTool({
  description:
    "List value-holding Stacks contracts to audit, ranked by TVL (highest asset-at-risk first).",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(200).default(25),
    subgraph: z.string().default("token-balances"),
  }),
  async execute({ limit, subgraph }) {
    const base = process.env.SECONDLAYER_API_URL;
    const key = process.env.SECONDLAYER_API_KEY;
    if (!base || !key) {
      return { source: "seed", count: SEED.length, contracts: SEED.slice(0, limit) };
    }
    try {
      // Top balances overall; we over-fetch then keep contract-principal holders.
      const url = `${base}/v1/subgraphs/${subgraph}/balances?_sort=amount&_order=desc&_limit=${limit * 5}`;
      const res = await fetch(url, { headers: { authorization: `Bearer ${key}` } });
      if (!res.ok) throw new Error(`subgraph query ${res.status}`);
      const body = (await res.json()) as { results?: Array<{ holder: string; asset_identifier: string; amount: string }> };
      const contracts = (body.results ?? [])
        .filter((r) => r.holder.includes(".")) // contract principals hold value in code
        .slice(0, limit)
        .map((r) => ({ contractId: r.holder, asset: r.asset_identifier, amount: r.amount, note: "" }));
      if (contracts.length === 0) return { source: "seed", count: SEED.length, contracts: SEED.slice(0, limit) };
      return { source: "token-balances", count: contracts.length, contracts };
    } catch (e) {
      return { source: "seed", error: String(e), count: SEED.length, contracts: SEED.slice(0, limit) };
    }
  },
});
