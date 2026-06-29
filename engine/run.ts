/**
 * CLI for the audit engine. Load env (ANTHROPIC_API_KEY + STACKS_NODE_URL), then:
 *   bun run engine/run.ts [contractId] [tier]        # tier = monitor | deep (default deep)
 *   bun run engine/run.ts <contractId> deep
 * Prints native metrics + the structured findings.
 */

import type { Tier } from "../monitoring/spend-ceiling";
import { audit } from "./audit";

const contractId = process.argv[2] ?? "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc";
const tier = (process.argv[3] as Tier) ?? "deep";

console.log(`=== audit ===\ntarget: ${contractId}\ntier:   ${tier}\n`);

const res = await audit(contractId, {
  tier,
  onTool: (name, ms) => console.log(`[${(ms / 60000).toFixed(1)}m] tool: ${name}`),
});

console.log("\n=== RESULT ===");
console.log(`status:     ${res.status} | model ${res.model} | panel ${res.panel}`);
console.log(
  `wall-clock: ${(res.metrics.wallMs / 60000).toFixed(2)} min | cost $${res.metrics.costUsd}`,
);
console.log(
  `turns:      ${res.metrics.numTurns} | tool calls ${res.metrics.toolCalls} | subagent tasks ${res.metrics.subagentTasks}`,
);
console.log(`findings:   ${res.findings.length}`);
console.log(JSON.stringify(res.findings, null, 2));
