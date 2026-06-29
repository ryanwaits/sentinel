/**
 * The Sentinel in-process MCP server — the engine's tool surface (replaces eve's tool wiring).
 * Bundles the source reader + the simnet PoC runner. The agent sees `mcp__sentinel__*`.
 */
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { fetchContractSourceTool } from "./contract-source";
import { runSimnetPocTool } from "./run-simnet-poc";

export const sentinelServer = createSdkMcpServer({
  name: "sentinel",
  version: "0.1.0",
  tools: [fetchContractSourceTool, runSimnetPocTool],
});

export const FETCH_TOOL = "mcp__sentinel__fetch_contract_source";
export const POC_TOOL = "mcp__sentinel__run_simnet_poc";
