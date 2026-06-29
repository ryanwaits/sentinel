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
import { readFileSync } from "node:fs";
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

const ORCHESTRATOR_SYSTEM = `You are Audit Sentinel, a Stacks/Clarity smart-contract security auditor.

Audit the target contract for asset-safety bugs. Process:
1. Fetch the target's full source with the ${FETCH_TOOL} tool (closure=true to pull in dependencies). This is the ONLY way to read source — never use Bash, WebFetch, or WebSearch.
2. Delegate a focused review to the auditor-share-accounting subagent (Task tool): pass it the FULL fetched source inline (it has no fetch tool of its own).
3. Adversarially verify every candidate finding with the verifier subagent: pass it the finding + the relevant source inline. Default to skepticism under Clarity semantics (underflow/overflow ABORT; reverts roll back all state; ft-mint?/ft-burn? of 0 reverts).
4. PoC is out of scope for this run — set pocStatus "pending" for any confirmed high/critical.
Label findings honestly: real bug vs centralization/trust. If a finding is refuted, include it with verifierVerdict "refuted". Return ONLY the structured findings object.`;

export function auditOptions(model: string): Options {
  return {
    model,
    systemPrompt: ORCHESTRATOR_SYSTEM,
    agents: {
      "auditor-share-accounting": {
        description:
          "Audits ERC-4626-style share accounting (convert/deposit/redeem, rounding, inflation, zero-share). Use for vault/share-token targets.",
        prompt: read("agent/subagents/auditor-share-accounting/instructions.md"),
        tools: [],
        model: "inherit",
      },
      verifier: {
        description:
          "Adversarially verifies a single finding under Clarity semantics; defaults to refute.",
        prompt: read("agent/subagents/verifier/instructions.md"),
        tools: [],
        model: "inherit",
      },
    },
    mcpServers: {
      sentinel: { type: "sdk", name: "sentinel", instance: sentinelTools.instance },
    },
    allowedTools: [FETCH_TOOL, "Task"],
    disallowedTools: ["Bash", "WebFetch", "WebSearch", "Write", "Edit", "NotebookEdit"],
    permissionMode: "bypassPermissions",
    settingSources: [],
    maxTurns: 40,
    effort: "medium",
    outputFormat: { type: "json_schema", schema: FINDINGS_SCHEMA },
  };
}

export function auditPrompt(contractId: string): string {
  return `Audit this deployed Clarity contract for asset-safety bugs: ${contractId}\n\nFetch its source (closure=true), delegate to auditor-share-accounting, adversarially verify each finding, and return the structured findings.`;
}
