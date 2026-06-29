/**
 * Spike — the audit orchestrator on the Claude Agent SDK (the lean alternative to eve).
 *
 * Mirrors eve's structure for readability: an orchestrator + filesystem-defined subagents (reusing
 * the EXISTING agent subagents' instructions.md verbatim) + the in-process source tool. Talks
 * DIRECT to Anthropic (ANTHROPIC_API_KEY) — no eve, no Vercel, no AI Gateway. `outputFormat` makes
 * the model return the findings as validated `result.structured_output` (no [SENTINEL-FINDINGS]
 * parsing); the `result` message carries cost/usage/turns/duration directly (the observability the
 * eve run-reader couldn't give).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { sentinelTools } from "./tools/contract-source";

// Run from the project root (`bun run spike/run-audit.ts`), so reuse paths are root-relative.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const FETCH_TOOL = "mcp__sentinel__fetch_contract_source";

/** The findings contract — returned as validated structured output (no text-block parsing). */
const FINDINGS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
          class: { type: "string", enum: ["bug", "centralization", "info"] },
          verifierVerdict: { type: "string", enum: ["confirmed", "refuted", "uncertain"] },
          pocStatus: { type: "string", enum: ["green", "pending", "failed", "na"] },
          confidence: { type: "number" },
          blastRadius: { type: "string" },
          recommendedAction: { type: "string" },
        },
        required: [
          "title",
          "severity",
          "class",
          "verifierVerdict",
          "pocStatus",
          "blastRadius",
          "recommendedAction",
        ],
      },
    },
  },
  required: ["findings"],
} as const;

/** Build AgentDefinitions by reusing the real subagent instructions.md (first line = description). */
function loadSubagents(
  panel: "minimal" | "full",
): Record<string, NonNullable<Options["agents"]>[string]> {
  const dir = join(process.cwd(), "agent", "subagents");
  const names = readdirSync(dir).filter((n) => existsSync(join(dir, n, "instructions.md")));
  const minimal = new Set(["auditor-share-accounting", "verifier"]);
  const agents: Record<string, NonNullable<Options["agents"]>[string]> = {};
  for (const name of names) {
    if (panel === "minimal" && !minimal.has(name)) continue;
    const prompt = read(join("agent", "subagents", name, "instructions.md"));
    const description =
      prompt
        .split("\n")
        .find((l) => l.trim())
        ?.slice(0, 200) ?? name;
    agents[name] = { description, prompt, tools: [], model: "inherit" };
  }
  return agents;
}

const AUDITOR_DIMS =
  "access-control, reentrancy, share-accounting, interest-math, flashloan-economics, invariants-dos, governance, oracle";

function orchestratorSystem(panel: "minimal" | "full"): string {
  const delegate =
    panel === "full"
      ? `Delegate IN PARALLEL to every relevant auditor-* subagent (${AUDITOR_DIMS}) via the Task tool — at minimum auditor-access-control, auditor-governance, and auditor-share-accounting for a vault/DAO target. Pass each the FULL fetched source inline (they have no fetch tool).`
      : `Delegate a focused review to the auditor-share-accounting subagent (Task tool): pass it the FULL fetched source inline (it has no fetch tool).`;
  return `You are Audit Sentinel, a Stacks/Clarity smart-contract security auditor.

Audit the target contract for asset-safety bugs. Process:
1. Fetch the target's full source with the ${FETCH_TOOL} tool (closure=true to pull in dependencies). This is the ONLY way to read source — never use Bash, WebFetch, WebSearch, or Read.
2. ${delegate}
3. Adversarially verify every candidate finding with the verifier subagent: pass it the finding + the relevant source inline. Default to skepticism under Clarity semantics (underflow/overflow ABORT; reverts roll back all state; ft-mint?/ft-burn? of 0 reverts).
4. PoC is out of scope for this run — set pocStatus "pending" for any confirmed high/critical.
Label findings honestly: real bug vs centralization/trust. If a finding is refuted, include it with verifierVerdict "refuted". Return ONLY the structured findings object.`;
}

export function auditOptions(
  model: string,
  panel: "minimal" | "full" = "minimal",
  effort: "low" | "medium" | "high" | "xhigh" | "max" = "medium",
): Options {
  return {
    model,
    systemPrompt: orchestratorSystem(panel),
    agents: loadSubagents(panel),
    mcpServers: {
      sentinel: { type: "sdk", name: "sentinel", instance: sentinelTools.instance },
    },
    allowedTools: [FETCH_TOOL, "Task"],
    disallowedTools: ["Bash", "WebFetch", "WebSearch", "Read", "Write", "Edit", "NotebookEdit"],
    permissionMode: "bypassPermissions",
    settingSources: [],
    maxTurns: 80,
    effort,
    outputFormat: { type: "json_schema", schema: FINDINGS_SCHEMA },
  };
}

export function auditPrompt(contractId: string): string {
  return `Audit this deployed Clarity contract for asset-safety bugs: ${contractId}\n\nFetch its source (closure=true), delegate to the auditor subagents, adversarially verify each finding, and return the structured findings.`;
}
