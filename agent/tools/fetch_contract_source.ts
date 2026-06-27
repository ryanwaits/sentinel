import { defineTool } from "eve/tools";
import { z } from "zod";
import { type ClosureEntry, resolveClosure } from "../../monitoring/closure";

/**
 * Fetch a deployed Clarity contract's source via the Stacks node RPC, optionally with its full
 * static call-graph dependency closure (the target + every contract its `(contract-call? …)` /
 * trait refs reach — catches proposal-by-indirection, where a hostile proposal acts via a
 * separate deployed M).
 *
 * Source-read surface: STACKS_NODE_URL must point at the **secondlayer-operated node** (hard rule:
 * all on-chain data via secondlayer; no third-party APIs). The silent Hiro default is removed —
 * Hiro is only an explicit spike fallback you opt into by setting STACKS_NODE_URL to it.
 */
const NODE_URL = process.env.STACKS_NODE_URL;

type SourceResult = {
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

export default defineTool({
  description:
    "Fetch the raw Clarity source of a deployed contract (address.contract-name). Set closure=true to also resolve its static call-graph dependency closure (every contract it reaches), e.g. for auditing a governance proposal plus the contracts it acts through.",
  inputSchema: z.object({
    address: z.string().describe("Deployer principal, e.g. SP1A27KFY...BSYADJ7"),
    contractName: z.string().describe("Contract name, e.g. v0-vault-sbtc"),
    closure: z
      .boolean()
      .default(false)
      .describe("Also fetch the static call-graph dependency closure (target + reachable contracts)."),
    maxDepth: z.number().int().min(1).max(8).default(4),
  }),
  async execute({ address, contractName, closure, maxDepth }) {
    if (!NODE_URL) {
      return {
        ok: false as const,
        error: "STACKS_NODE_URL unset — point it at the secondlayer-operated node (Hiro only as an explicit spike fallback).",
      };
    }
    const contractId = `${address}.${contractName}`;
    const root = await fetchSourceById(contractId);
    if (!root) return { ok: false as const, error: `source fetch failed for ${contractId}` };

    if (!closure) {
      return { ok: true as const, ...root };
    }
    const entries: ClosureEntry[] = await resolveClosure(
      contractId,
      async (id) => (await fetchSourceById(id))?.source ?? null,
      { maxDepth },
    );
    return {
      ok: true as const,
      ...root,
      closure: entries.map((e) => ({ contractId: e.contractId, depth: e.depth, lineCount: e.source.split("\n").length })),
      closureSources: entries.map((e) => ({ contractId: e.contractId, source: e.source })),
    };
  },
});
