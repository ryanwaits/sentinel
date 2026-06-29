/**
 * Spike — in-process MCP tool wrapping the EXISTING monitoring/contract-source.ts reader.
 *
 * Shows the migration path: the same node-RPC source reader + closure resolver Sentinel already
 * has, exposed to the Claude Agent SDK as an SDK MCP tool (runs in THIS process — no subprocess
 * round-trip for the fetch). The agent sees it as `mcp__sentinel__fetch_contract_source`.
 */
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { resolveClosure } from "../../monitoring/closure";
import { fetchSourceById } from "../../monitoring/contract-source";

export const sentinelTools = createSdkMcpServer({
  name: "sentinel",
  version: "0.1.0",
  tools: [
    tool(
      "fetch_contract_source",
      "Fetch the raw Clarity source of a deployed contract (address.contract-name) from the Stacks node. Set closure=true to also fetch its static call-graph dependency closure (the proposal-by-indirection catch). This is the ONLY way to read contract source — do not use Bash/WebFetch.",
      {
        contractId: z
          .string()
          .describe("address.contract-name, e.g. SP1A27...BSYADJ7.v0-vault-sbtc"),
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
                text: `ERROR: source fetch failed for ${contractId} (is STACKS_NODE_URL set?)`,
              },
            ],
          };
        }
        if (!closure) {
          return {
            content: [
              { type: "text", text: `;; ${contractId} (${root.lineCount} lines)\n${root.source}` },
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
    ),
  ],
});
