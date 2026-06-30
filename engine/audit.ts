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
import type { KBRecord } from "../monitoring/kb";
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
    // Give subagents the source tool as a fallback: if the orchestrator's inlined source is
    // incomplete, they fetch it themselves rather than returning "could not access source".
    agents[name] = { description, prompt, tools: [FETCH_TOOL], model: "inherit", maxTurns: 6 };
  }
  return agents;
}

/**
 * Prior-audit context from the watched contract's KB record — makes the audit CONTEXT-AWARE: the
 * panel knows the archetype + already-known sensitive fns, and (load-bearing for calibration) does
 * NOT re-litigate accepted centralization/trust waivers as fresh criticals.
 */
function kbContextBlock(kb: KBRecord): string {
  const fns =
    kb.sensitiveFns.map((f) => `${f.name} (${f.triggerClass})`).join(", ") || "(none recorded)";
  const waivers = kb.waivers.length
    ? kb.waivers
        .map((w) => `  - ${w.finding} [${w.label}]${w.note ? ` — ${w.note}` : ""}`)
        .join("\n")
    : "  (none)";
  return `

## Prior audit context (KB) for ${kb.contractId} — baseline-audited as a "${kb.archetype}"
Known sensitive functions: ${fns}.
ACCEPTED centralization/trust waivers (already reviewed and accepted — do NOT re-report these as new
critical bugs; if you encounter one, label class "centralization"/"info" and note it is a known
accepted assumption, not a novel finding):
${waivers}
Focus on NEW bugs, regressions, or anything OUTSIDE these accepted assumptions.`;
}

function orchestratorSystem(panel: Panel, kbContext = ""): string {
  const delegate =
    panel === "full"
      ? `Delegate EXACTLY ONCE to each relevant auditor-* subagent (${AUDITOR_DIMS}) - fire them in parallel, ONE Task per dimension. Prioritise auditor-access-control, auditor-governance, auditor-share-accounting for a vault/DAO target.`
      : `Delegate EXACTLY ONCE to the auditor-share-accounting subagent (one Task).`;
  return `You are Audit Sentinel, a Stacks/Clarity smart-contract security auditor. Work EFFICIENTLY - do not over-delegate, re-delegate, or loop.

Process (each step ONCE, in order, then stop):
1. Fetch the target's full source with ${FETCH_TOOL} (closure=true). This is the ONLY way to read source - never use Bash, WebFetch, WebSearch, Read, Grep, or Glob.
2. ${delegate} In each delegation prompt, PASTE THE FULL fetched source verbatim (the subagent also has ${FETCH_TOOL} as a fallback, but inline it so it doesn't have to). Do NOT spawn any subagent more than once.
3. Collect the candidate findings, then verify them in a SINGLE verifier Task call: pass the verifier the FULL contract source AND the complete list of candidate findings at once (NOT one call per finding). It refutes false positives under Clarity semantics - especially internal-vs-live-balance accounting (share price off a data-var, not ft-get-balance, defeats donation/inflation), underflow/overflow ABORT, reverts roll back all state, ft-mint?/ft-burn? of 0 reverts. Mark refuted findings verifierVerdict "refuted" (keep them).
4. For each CONFIRMED high/critical, call ${POC_TOOL} AT MOST ONCE: pocStatus "green" if it reproduces (exitCode 0), "failed" if not, "pending" if the sandbox is UNAVAILABLE - then STOP (never retry, re-verify, or re-delegate).
5. Return the structured findings object and end your turn. Do not keep working after you have it.
Label findings honestly: real bug vs centralization/trust.${kbContext}`;
}

function auditOptions(model: string, panel: Panel, effort: Effort, kbContext: string): Options {
  return {
    model,
    systemPrompt: orchestratorSystem(panel, kbContext),
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
  /** The SDK session id (traceability / ledger key). */
  sessionId?: string;
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
    /** Prior-audit context (the watched contract's KB record) — makes the audit context-aware. */
    kb?: KBRecord | null;
    onTool?: (name: string, elapsedMs: number) => void;
  } = {},
): Promise<AuditResult> {
  const d = TIER_DEFAULTS[opts.tier ?? "deep"];
  const model = opts.model ?? d.model;
  const panel = opts.panel ?? d.panel;
  const effort = opts.effort ?? d.effort;
  const kbContext = opts.kb ? kbContextBlock(opts.kb) : "";

  const prompt = `Audit this deployed Clarity contract for asset-safety bugs: ${contractId}\n\nFetch its source (closure=true), delegate to the auditor subagents, adversarially verify each finding, reproduce confirmed high/critical with the PoC tool, and return the structured findings.`;

  const t0 = Date.now();
  let toolCalls = 0;
  let subagentTasks = 0;
  let result: Record<string, unknown> | null = null;

  for await (const msg of query({
    prompt,
    options: auditOptions(model, panel, effort, kbContext),
  })) {
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
    sessionId: result.session_id as string | undefined,
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
