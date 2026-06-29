/**
 * Audit engine — `audit(contractId, {tier|model|panel|effort})` on the Claude Agent SDK, direct to
 * Anthropic (no eve, no Vercel, no AI Gateway). Promoted from spike/; the validated lean substrate.
 *
 * Returns structured findings (validated through the SAME zod schema the adjudicator consumes,
 * monitoring/adjudication.ts) PLUS native metrics (cost/turns/usage/duration) off the SDK `result`
 * message — the observability the eve run-reader could not provide. Subagents reuse the EXISTING
 * agent/subagents/*​/instructions.md verbatim; tools are the in-process Sentinel MCP server
 * (fetch_contract_source + run_simnet_poc).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Options, query } from "@anthropic-ai/claude-agent-sdk";
import { type Finding, SentinelFindings } from "../monitoring/adjudication";
import type { Tier } from "../monitoring/spend-ceiling";
import { FINDINGS_SCHEMA } from "./findings";
import { FETCH_TOOL, POC_TOOL, sentinelServer } from "./tools";

export type Panel = "minimal" | "full";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** Tier → execution defaults (overridable). Monitor = fast/cheap; Deep = full Opus panel. */
const TIER_DEFAULTS: Record<Tier, { model: string; panel: Panel; effort: Effort }> = {
  monitor: { model: "claude-sonnet-4-6", panel: "minimal", effort: "medium" },
  deep: { model: "claude-opus-4-8", panel: "full", effort: "high" },
};

const AUDITOR_DIMS =
  "access-control, reentrancy, share-accounting, interest-math, flashloan-economics, invariants-dos, governance, oracle";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Reuse the real subagent instructions.md as AgentDefinition prompts (first line = description). */
function loadSubagents(panel: Panel): NonNullable<Options["agents"]> {
  const dir = join(process.cwd(), "agent", "subagents");
  const minimal = new Set(["auditor-share-accounting", "verifier"]);
  const agents: NonNullable<Options["agents"]> = {};
  for (const name of readdirSync(dir).filter((n) => existsSync(join(dir, n, "instructions.md")))) {
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

function orchestratorSystem(panel: Panel): string {
  const delegate =
    panel === "full"
      ? `Delegate IN PARALLEL to every relevant auditor-* subagent (${AUDITOR_DIMS}) via the Task tool — at minimum auditor-access-control, auditor-governance, and auditor-share-accounting for a vault/DAO target. Pass each the FULL fetched source inline (they have no fetch tool).`
      : `Delegate a focused review to the auditor-share-accounting subagent (Task tool): pass it the FULL fetched source inline (it has no fetch tool).`;
  return `You are Audit Sentinel, a Stacks/Clarity smart-contract security auditor.

Audit the target contract for asset-safety bugs. Process:
1. Fetch the target's full source with the ${FETCH_TOOL} tool (closure=true to pull in dependencies). This is the ONLY way to read source — never use Bash, WebFetch, WebSearch, Read, Grep, or Glob.
2. ${delegate}
3. Adversarially verify every candidate finding with the verifier subagent: pass it the finding + the relevant source inline. Default to skepticism under Clarity semantics (underflow/overflow ABORT; reverts roll back all state; ft-mint?/ft-burn? of 0 reverts). Drop hallucinated findings.
4. Reproduce any CONFIRMED high/critical finding with ${POC_TOOL}: pocStatus "green" if it reproduces (exitCode 0), "failed" if not, "pending" if the sandbox is UNAVAILABLE. Do not loop on an unavailable sandbox.
Label findings honestly: real bug vs centralization/trust. Include refuted findings with verifierVerdict "refuted". Return ONLY the structured findings object.`;
}

function auditOptions(model: string, panel: Panel, effort: Effort): Options {
  return {
    model,
    systemPrompt: orchestratorSystem(panel),
    agents: loadSubagents(panel),
    mcpServers: { sentinel: { type: "sdk", name: "sentinel", instance: sentinelServer.instance } },
    allowedTools: [FETCH_TOOL, POC_TOOL, "Task", "Agent"],
    disallowedTools: [
      "Bash",
      "WebFetch",
      "WebSearch",
      "Read",
      "Grep",
      "Glob",
      "Write",
      "Edit",
      "NotebookEdit",
    ],
    permissionMode: "bypassPermissions",
    settingSources: [],
    maxTurns: 80,
    effort,
    outputFormat: { type: "json_schema", schema: FINDINGS_SCHEMA },
  };
}

export type AuditMetrics = {
  wallMs: number;
  costUsd: number;
  numTurns: number;
  toolCalls: number;
  subagentTasks: number;
  ttftMs?: number;
  durationApiMs?: number;
  usage?: unknown;
};

export type AuditResult = {
  contractId: string;
  model: string;
  panel: Panel;
  tier?: Tier;
  status: "success" | "error" | "incomplete";
  findings: Finding[];
  metrics: AuditMetrics;
  /** Raw final text (fallback / debugging). */
  rawResult?: string;
};

/** Run one audit. `onTool` is an optional progress hook (toolName, elapsedMs). */
export async function audit(
  contractId: string,
  opts: {
    tier?: Tier;
    model?: string;
    panel?: Panel;
    effort?: Effort;
    onTool?: (name: string, elapsedMs: number) => void;
  } = {},
): Promise<AuditResult> {
  const d = TIER_DEFAULTS[opts.tier ?? "deep"];
  const model = opts.model ?? d.model;
  const panel = opts.panel ?? d.panel;
  const effort = opts.effort ?? d.effort;

  const prompt = `Audit this deployed Clarity contract for asset-safety bugs: ${contractId}\n\nFetch its source (closure=true), delegate to the auditor subagents, adversarially verify each finding, reproduce confirmed high/critical with the PoC tool, and return the structured findings.`;

  const t0 = Date.now();
  let toolCalls = 0;
  let subagentTasks = 0;
  let result: Record<string, unknown> | null = null;

  for await (const msg of query({ prompt, options: auditOptions(model, panel, effort) })) {
    if (msg.type === "assistant") {
      for (const block of (msg.message?.content ?? []) as Array<{ type: string; name?: string }>) {
        if (block.type === "tool_use") {
          toolCalls++;
          if (block.name === "Agent" || block.name === "Task") subagentTasks++;
          opts.onTool?.(block.name ?? "?", Date.now() - t0);
        }
      }
    } else if (msg.type === "result") {
      result = msg as unknown as Record<string, unknown>;
    }
  }

  const wallMs = Date.now() - t0;
  if (!result) {
    return {
      contractId,
      model,
      panel,
      tier: opts.tier,
      status: "error",
      findings: [],
      metrics: { wallMs, costUsd: 0, numTurns: 0, toolCalls, subagentTasks },
    };
  }

  // Validate the model's structured output through the SAME schema the adjudicator uses.
  let findings: Finding[] = [];
  const parsed = SentinelFindings.safeParse(result.structured_output);
  if (parsed.success) findings = parsed.data.findings;

  return {
    contractId,
    model,
    panel,
    tier: opts.tier,
    status: result.subtype === "success" ? "success" : "incomplete",
    findings,
    metrics: {
      wallMs,
      costUsd: (result.total_cost_usd as number) ?? 0,
      numTurns: (result.num_turns as number) ?? 0,
      toolCalls,
      subagentTasks,
      ttftMs: result.ttft_ms as number | undefined,
      durationApiMs: result.duration_api_ms as number | undefined,
      usage: result.usage,
    },
    rawResult: result.result as string | undefined,
  };
}
