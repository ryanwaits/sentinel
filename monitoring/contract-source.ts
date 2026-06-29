/**
 * Contract source reader — fetch a deployed Clarity contract's source off the Stacks node RPC.
 *
 * Pure (no eve dependency) so BOTH the `fetch_contract_source` agent tool AND the monitoring bridge
 * (closure resolution on a trigger) can use it. Source-read surface: STACKS_NODE_URL must point at
 * the secondlayer-operated node (hard rule: all on-chain data via secondlayer; no third-party APIs).
 * Contract SOURCE is not on the Index yet (deferred "on named pull"), so the node RPC is the path;
 * the silent Hiro default is removed (Hiro only as an explicit spike fallback you opt into).
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
