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
import { FINDINGS_SCHEMA, KB_DISTILL_SCHEMA } from "./findings";
import { enforceGates, type GateAction } from "./gates";
import { type KBCandidate, KBCandidate as KBCandidateSchema } from "./kb-distill";
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
  const prior = kb.priorFindings.length
    ? kb.priorFindings
        .map(
          (p) =>
            `  - ${p.title} [${p.severity}/${p.class}]${p.note ? ` — ${p.note}` : ""}${p.pocFile ? ` (reproduce with run_simnet_poc pocFile="${p.pocFile}")` : ""}`,
        )
        .join("\n")
    : "  (none)";
  return `

## Prior audit context (KB) for ${kb.contractId} — baseline-audited as a "${kb.archetype}"
Known sensitive functions: ${fns}.
KNOWN CONFIRMED FINDINGS from the prior audit — RE-VALIDATE each against the current source; unless the
code changed, treat it as a REAL finding at the stated severity/class (don't silently re-downgrade a
known bug to "centralization"). For each you re-confirm at high/critical, REPRODUCE it with run_simnet_poc:
${prior}
ACCEPTED centralization/trust waivers (already reviewed and accepted — do NOT re-report these as new
critical bugs; if you encounter one, label class "centralization"/"info" and note it is a known
accepted assumption, not a novel finding):
${waivers}
Focus on re-confirming the known findings + any NEW bugs/regressions outside the accepted assumptions.`;
}

function orchestratorSystem(panel: Panel, kbContext = "", distillKB = false): string {
  const kbStep = distillKB
    ? `\n6. ALSO emit "kbCandidate" for KB distillation: classify the contract's archetype (governance-dao | vault | amm | treasury | token | other) and list its sensitive/privileged functions — for each: the name, the closest triggerClass (governance.proposal_submitted | governance.proxy_upgrade | counterparty.new | transfer.outflow), the authorized callers from its auth checks (callerAllowlist; [] if open/unclear), and for transfer.outflow fns a suggestedOutflowThreshold {asset, amount} read from any on-chain cap in the source — OMIT it if there is no cap (never guess 0/null).
7. For each CONFIRMED bug finding, also set targetFn (the function it concerns), targetAsset (ft id or 'stx' if it's an outflow bug), and precondition (the condition under which it is exploitable) — these distil into the Type-2 monitoring signatures that watch this contract post-launch.`
    : "";
  const delegate =
    panel === "full"
      ? `Delegate EXACTLY ONCE to each relevant auditor-* subagent (${AUDITOR_DIMS}) - fire them in parallel, ONE Task per dimension. Prioritise auditor-access-control, auditor-governance, auditor-share-accounting for a vault/DAO target.`
      : `Delegate EXACTLY ONCE to the auditor-share-accounting subagent (one Task).`;
  return `You are Audit Sentinel, a Stacks/Clarity smart-contract security auditor. Work EFFICIENTLY - do not over-delegate, re-delegate, or loop.

Process (each step ONCE, in order, then stop):
1. Fetch the target's full source with ${FETCH_TOOL} (closure=true). This is the ONLY way to read source - never use Bash, WebFetch, WebSearch, Read, Grep, or Glob.
2. ${delegate} In each delegation prompt, PASTE THE FULL fetched source verbatim (the subagent also has ${FETCH_TOOL} as a fallback, but inline it so it doesn't have to). Do NOT spawn any subagent more than once.
3. Collect the candidate findings, then verify them in a SINGLE verifier Task call: pass the verifier the FULL contract source AND the complete list of candidate findings at once (NOT one call per finding). It refutes false positives under Clarity semantics - especially internal-vs-live-balance accounting (share price off a data-var, not ft-get-balance, defeats donation/inflation), underflow/overflow ABORT, reverts roll back all state, ft-mint?/ft-burn? of 0 reverts. Mark refuted findings verifierVerdict "refuted" (keep them).
4. For each CONFIRMED high/critical, call ${POC_TOOL} AT MOST ONCE. Choose the substrate: pass substrate="fork" when the bug's exploitability depends on LIVE on-chain state (real balances, roles, share prices, or multi-contract wiring) — it runs the unmodified deployed bytecode against real chain state; pass substrate="airgapped" (the default) for a pure logic bug reproducible from source alone. Set pocStatus "green" if it reproduces (exitCode 0), "failed" if not, "pending" if the sandbox is UNAVAILABLE (e.g. fork ran without containment configured — do NOT retry as airgapped unless the finding is genuinely source-only). Set pocSubstrate to the substrate reported in the tool result (substrate=fork|airgapped). Then STOP (never retry, re-verify, or re-delegate).
5. Return the structured findings object and end your turn. Do not keep working after you have it.
Label findings honestly: real bug vs centralization/trust.
A structural gate runs on your output: a "confirmed" verdict from a run that did NOT call the verifier subagent is auto-downgraded to "uncertain", and a confirmed bug at high/critical with pocStatus "na" is forced to "pending". So actually delegate to the verifier and actually run ${POC_TOOL} — you cannot self-certify past the gate.${kbStep}${kbContext}`;
}

function auditOptions(
  model: string,
  panel: Panel,
  effort: Effort,
  kbContext: string,
  distillKB: boolean,
): Options {
  return {
    model,
    systemPrompt: orchestratorSystem(panel, kbContext, distillKB),
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
    outputFormat: { type: "json_schema", schema: distillKB ? KB_DISTILL_SCHEMA : FINDINGS_SCHEMA },
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
  /** Present when opts.distillKB: the LLM-extracted archetype + sensitive fns for KB distillation. */
  kbCandidate?: KBCandidate;
  metrics: AuditMetrics;
  /** Credibility-gate outcome: whether the run was verifier-backed + any structural downgrades applied. */
  gate?: { verified: boolean; actions: GateAction[] };
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
    /** Baseline mode: also emit a KB candidate (archetype + sensitive fns) for distillation. */
    distillKB?: boolean;
    onTool?: (name: string, elapsedMs: number) => void;
  } = {},
): Promise<AuditResult> {
  const d = TIER_DEFAULTS[opts.tier ?? "deep"];
  const model = opts.model ?? d.model;
  const panel = opts.panel ?? d.panel;
  const effort = opts.effort ?? d.effort;
  const kbContext = opts.kb ? kbContextBlock(opts.kb) : "";
  const distillKB = opts.distillKB ?? false;

  const prompt = `Audit this deployed Clarity contract for asset-safety bugs: ${contractId}\n\nFetch its source (closure=true), delegate to the auditor subagents, adversarially verify each finding, reproduce confirmed high/critical with the PoC tool, and return the structured findings.`;

  const t0 = Date.now();
  let toolCalls = 0;
  let subagentTasks = 0;
  // Which subagents actually ran — the evidence the credibility gate reads (not the model's claims).
  const subagentTypes = new Set<string>();
  let result: Record<string, unknown> | null = null;

  for await (const msg of query({
    prompt,
    options: auditOptions(model, panel, effort, kbContext, distillKB),
  })) {
    if (msg.type === "assistant") {
      for (const block of (msg.message?.content ?? []) as Array<{
        type: string;
        name?: string;
        input?: { subagent_type?: string };
      }>) {
        if (block.type === "tool_use") {
          toolCalls++;
          if (block.name === "Agent" || block.name === "Task") {
            subagentTasks++;
            if (block.input?.subagent_type) subagentTypes.add(block.input.subagent_type);
          }
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

  // Credibility gates (structural): downgrade a self-labelled "confirmed" from a run with no verifier
  // pass, and force a bug-tier high/critical with no PoC attempt onto the provisional path. Runs on the
  // evidence of what actually executed — the model cannot self-certify past this.
  const gate = enforceGates(findings, { subagentTasks, subagentTypes });
  findings = gate.findings;
  if (gate.actions.length > 0) {
    console.warn(
      `[audit] credibility gate acted on ${gate.actions.length} finding(s)` +
        `${gate.verified ? "" : " · UNVERIFIED run (no verifier pass)"}: ` +
        gate.actions.map((a) => `${a.rule}[${a.from}→${a.to}]`).join(", "),
    );
  }

  let kbCandidate: KBCandidate | undefined;
  if (distillKB) {
    const k = KBCandidateSchema.safeParse(
      (result.structured_output as { kbCandidate?: unknown })?.kbCandidate,
    );
    if (k.success) kbCandidate = k.data;
  }

  return {
    contractId,
    model,
    panel,
    tier: opts.tier,
    sessionId: result.session_id as string | undefined,
    status: result.subtype === "success" ? "success" : "incomplete",
    findings,
    kbCandidate,
    gate: { verified: gate.verified, actions: gate.actions },
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
