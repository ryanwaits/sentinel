/**
 * Contract source reader — fetch a deployed Clarity contract's source off the Stacks node RPC.
 *
 * Pure (no SDK dependency) so BOTH the engine's `fetch_contract_source` MCP tool AND the monitoring
 * bridge (closure resolution on a trigger) can use it.
 *
 * HONEST LABEL (no allegiance the code doesn't have): this reads whatever node `STACKS_NODE_URL`
 * points at — nothing here enforces WHICH node. In prod that should be the secondlayer-operated node
 * (`:20443`); Hiro is only an explicit spike fallback you opt into. secondlayer has no contract-
 * source API yet (source is deferred off the Index), so node RPC over `/v2/contracts/source` IS the
 * secondlayer path today. If `STACKS_NODE_URL` is unset, reads return null — no silent third-party
 * default.
 */
const NODE_URL = process.env.STACKS_NODE_URL;

export type SourceResult = {
  contractId: string;
  publishHeight: number;
  lineCount: number;
  source: string;
};

/** Fetch one contract's source off the configured node, or null if not found / node unset. */
export async function fetchSourceById(contractId: string): Promise<SourceResult | null> {
  if (!NODE_URL) return null;
  const [address, contractName] = contractId.split(".");
  if (!address || !contractName) return null;
  const res = await fetch(`${NODE_URL}/v2/contracts/source/${address}/${contractName}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { source: string; publish_height: number };
  return {
    contractId,
    publishHeight: data.publish_height,
    lineCount: data.source.split("\n").length,
    source: data.source,
  };
}

/** True when a source-read surface is configured (STACKS_NODE_URL set). */
export function sourceReadEnabled(): boolean {
  return Boolean(NODE_URL);
}
