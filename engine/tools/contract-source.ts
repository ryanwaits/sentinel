/**
 * MCP tool — fetch a deployed Clarity contract's source (+ optional static call-graph closure),
 * wrapping the EXISTING monitoring/contract-source.ts reader. Runs in-process; the agent sees it as
 * `mcp__sentinel__fetch_contract_source`. The ONLY source-read path for the engine.
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { resolveClosure } from "../../monitoring/closure";
import { fetchSourceById } from "../../monitoring/contract-source";

export const fetchContractSourceTool = tool(
  "fetch_contract_source",
  "Fetch the raw Clarity source of a deployed contract (address.contract-name) from the Stacks node. Set closure=true to also fetch its static call-graph dependency closure (the proposal-by-indirection catch). This is the ONLY way to read contract source — do not use Bash/WebFetch/Read.",
  {
    contractId: z.string().describe("address.contract-name, e.g. SP1A27...BSYADJ7.v0-vault-sbtc"),
    closure: z.boolean().default(false).describe("Also fetch the static dependency closure."),
    maxDepth: z.number().int().min(1).max(8).default(3),
  },
  async ({ contractId, closure, maxDepth }) => {
    const root = await fetchSourceById(contractId);
    if (!root) {
      return {
        content: [
          {
            type: "text",
            text: `ERROR: source fetch failed for ${contractId} (set STACKS_NODE_URL for a deployed contract, or SENTINEL_LOCAL_SOURCES to audit a pre-deployment .clar file)`,
          },
        ],
      };
    }
    // Provenance banner: a `local` read is PRE-DEPLOYMENT / not chain-confirmed — the auditor must
    // treat findings as reviewed against these exact bytes, and the report must say so.
    const provenance =
      root.origin === "local"
        ? `;; SOURCE: LOCAL pre-deployment bytes${root.ref ? ` @ ${root.ref}` : ""} — NOT chain-confirmed\n`
        : "";
    if (!closure) {
      return {
        content: [
          {
            type: "text",
            text: `${provenance};; ${contractId} (${root.lineCount} lines)\n${root.source}`,
          },
        ],
      };
    }
    const entries = await resolveClosure(
      contractId,
      async (id) => (await fetchSourceById(id))?.source ?? null,
      { maxDepth },
    );
    const text = entries
      .map(
        (e) =>
          `;; ===== ${e.contractId} (depth ${e.depth}, ${e.source.split("\n").length} lines) =====\n${e.source}`,
      )
      .join("\n\n");
    return { content: [{ type: "text", text }] };
  },
);
