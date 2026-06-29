/**
 * Spike entrypoint — run one audit on the lean Claude Agent SDK path and measure it.
 *
 *   ANTHROPIC_API_KEY + STACKS_NODE_URL in env (load .env.local), then:
 *   bun run spike/run-audit.ts [contractId] [model]
 *
 * Default target = the real Zest sBTC vault (Finding 1). Prints cost / tokens / turns / wall-clock
 * and the structured findings — the head-to-head against eve (hours, unmeasurable).
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { auditOptions, auditPrompt } from "./agent";

const contractId = process.argv[2] ?? "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc";
const model = process.argv[3] ?? "claude-sonnet-4-6";

console.log(`=== Agent SDK spike ===\ntarget: ${contractId}\nmodel:  ${model}\n`);

const t0 = Date.now();
let result: Record<string, unknown> | null = null;
let toolCalls = 0;
let subagentTasks = 0;

for await (const msg of query({ prompt: auditPrompt(contractId), options: auditOptions(model) })) {
  if (msg.type === "assistant") {
    for (const block of (msg.message?.content ?? []) as Array<{ type: string; name?: string }>) {
      if (block.type === "tool_use") {
        toolCalls++;
        if (block.name === "Task") subagentTasks++;
        const mins = ((Date.now() - t0) / 60000).toFixed(1);
        console.log(`[${mins}m] tool: ${block.name}`);
      }
    }
  } else if (msg.type === "result") {
    result = msg as unknown as Record<string, unknown>;
  }
}

const wallMin = ((Date.now() - t0) / 60000).toFixed(2);
console.log("\n=== RESULT ===");
if (!result) {
  console.log("no result message");
  process.exit(1);
}
console.log(`subtype:      ${result.subtype}`);
console.log(`wall-clock:   ${wallMin} min`);
console.log(
  `duration_ms:  ${result.duration_ms} (api ${result.duration_api_ms}, ttft ${result.ttft_ms ?? "?"})`,
);
console.log(
  `num_turns:    ${result.num_turns}  | tool calls: ${toolCalls} (subagent tasks: ${subagentTasks})`,
);
console.log(`total_cost:   $${result.total_cost_usd}`);
console.log(`usage:        ${JSON.stringify(result.usage)}`);

const structured = result.structured_output as { findings?: unknown[] } | undefined;
if (structured?.findings) {
  console.log(`\n=== FINDINGS (${structured.findings.length}, structured_output — no parsing) ===`);
  console.log(JSON.stringify(structured.findings, null, 2));
} else {
  console.log("\n=== no structured_output; raw result text ===");
  console.log(String(result.result).slice(0, 2000));
}
