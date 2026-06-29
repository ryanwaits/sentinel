import { defineTool } from "eve/tools";
import { z } from "zod";
import { type ClosureEntry, resolveClosure } from "../../monitoring/closure";
import { fetchSourceById, sourceReadEnabled } from "../../monitoring/contract-source";

/**
 * Fetch a deployed Clarity contract's source via the Stacks node RPC, optionally with its full
 * static call-graph dependency closure (the target + every contract its `(contract-call? …)` /
 * trait refs reach — catches proposal-by-indirection, where a hostile proposal acts via a
 * separate deployed M).
 *
 * The actual node read lives in `monitoring/contract-source.ts` (pure, eve-free) so the monitoring
 * bridge can reuse it for trigger-time closure resolution. STACKS_NODE_URL must point at the
 * secondlayer-operated node (hard rule); Hiro only as an explicit spike fallback.
 */
export { fetchSourceById };

export default defineTool({
  description:
    "Fetch the raw Clarity source of a deployed contract (address.contract-name). Set closure=true to also resolve its static call-graph dependency closure (every contract it reaches), e.g. for auditing a governance proposal plus the contracts it acts through.",
  inputSchema: z.object({
    address: z.string().describe("Deployer principal, e.g. SP1A27KFY...BSYADJ7"),
    contractName: z.string().describe("Contract name, e.g. v0-vault-sbtc"),
    closure: z
      .boolean()
      .default(false)
      .describe(
        "Also fetch the static call-graph dependency closure (target + reachable contracts).",
      ),
    maxDepth: z.number().int().min(1).max(8).default(4),
  }),
  async execute({ address, contractName, closure, maxDepth }) {
    if (!sourceReadEnabled()) {
      return {
        ok: false as const,
        error:
          "STACKS_NODE_URL unset — point it at the secondlayer-operated node (Hiro only as an explicit spike fallback).",
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
      closure: entries.map((e) => ({
        contractId: e.contractId,
        depth: e.depth,
        lineCount: e.source.split("\n").length,
      })),
      closureSources: entries.map((e) => ({ contractId: e.contractId, source: e.source })),
    };
  },
});
