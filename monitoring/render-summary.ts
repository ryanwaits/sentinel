/**
 * House-voice summary renderer — turns an adjudicated audit verdict into the terse, trusted-colleague
 * prose a real user sees on the onboarding verdict (above the structured finding cards).
 *
 * The voice is Sentinel's report voice, single-sourced in `.claude/skills/finding-report/SKILL.md`
 * (open with the finding in plain words, terse, honest about uncertain/degraded reads, one-line fix,
 * no PoC narration). This module is the MACHINE encoding of it; keep the system prompt in sync with
 * the skill.
 *
 * Two paths, so the verdict never blocks and dev/tests never spend:
 *  - `llmRenderSummary` — one cheap `query()` (Haiku) that renders the findings to the full voice.
 *  - `templateSummary` — a pure, deterministic fallback used under SENTINEL_AUDIT_MOCK, on any LLM
 *    error, and in unit tests.
 * `renderSummary` picks: mock → template (no spend); else llm, catch → template.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AdjudicatedFinding, Adjudication } from "./adjudication";

const RENDER_MODEL = process.env.SENTINEL_SUMMARY_MODEL ?? "claude-haiku-4-5-20251001";

/** The finding-report voice, compact (source of truth: .claude/skills/finding-report/SKILL.md). */
const VOICE = `You are Sentinel writing an audit finding for a client, in the house voice.

Rules:
- Open with what's broken (or "no exploitable bug") in plain words — a colleague telling a teammate.
- Terse. ~6-10 lines total. No preamble, no "During our review", no restated headings.
- Plain words over jargon: "the user's funds get stuck", not "denial of access to principal".
- Name the ONE thing worth acting on. State severity in a clause; one honest caveat, then move on.
- Be honest about uncertainty: if a finding is "uncertain" or a read was degraded, say so plainly —
  never smooth it into "clean". A monitoring correlation is "looks like", not a reproduced exploit.
- If motion is "detection", open with "DETECTION — already on-chain." Correlation, not confirmation.
  Name the precondition to verify. Do not claim a PoC on the event. If motion is "prevention", it is
  an audit of incoming/new code (veto if a timelock remains).
- Never imply Sentinel took any action — it routes intent to a human; it never acts on-chain or discloses.
- If there's a fix, one line naming the change. Do NOT narrate the PoC.
- Active voice. No hedging ("we would note that"), no em dashes.
Output the summary prose only — no headings, no markdown fences.`;

const keptOrUncertain = (f: AdjudicatedFinding): boolean =>
  f.kept || f.verifierVerdict === "uncertain";

/** Compact the adjudication into the facts the renderer reasons over (no internal session/tool detail). */
function factsFor(adj: Adjudication): string {
  const fs = adj.findings.filter(keptOrUncertain).map((f) => ({
    title: f.title,
    severity: f.severity,
    class: f.class,
    verdict: f.verifierVerdict,
    pocStatus: f.pocStatus,
    origin: f.origin,
    precondition: f.precondition,
    blastRadius: f.blastRadius,
    recommendedAction: f.recommendedAction,
  }));
  return JSON.stringify(
    {
      contractId: adj.contractId,
      origin: adj.origin ?? "audit",
      motion: (adj.origin ?? "audit") === "incident" ? "detection" : "prevention",
      overallSeverity: adj.severity,
      overallClass: adj.class,
      pocStatus: adj.pocStatus,
      needsHuman: adj.needsHuman,
      recommendedAction: adj.recommendedAction,
      costUsd: adj.tokenCostUsd,
      findings: fs,
    },
    null,
    2,
  );
}

/** Render via a single cheap model call. Throws on any SDK/parse failure (caught by renderSummary). */
export async function llmRenderSummary(adj: Adjudication): Promise<string> {
  let text = "";
  for await (const msg of query({
    prompt: `Write the house-voice summary for this audit verdict.\n\n${factsFor(adj)}`,
    options: {
      model: RENDER_MODEL,
      systemPrompt: VOICE,
      allowedTools: [],
      disallowedTools: [
        "Bash",
        "WebFetch",
        "WebSearch",
        "Read",
        "Grep",
        "Glob",
        "Write",
        "Edit",
        "Task",
        "Agent",
      ],
      permissionMode: "bypassPermissions",
      settingSources: [],
      maxTurns: 1,
    },
  })) {
    if (msg.type === "result") text = ((msg as { result?: string }).result ?? "").trim();
  }
  if (!text) throw new Error("empty summary from renderer");
  return text;
}

const SEV_ORDER = ["critical", "high", "medium", "low", "info"] as const;

/**
 * Deterministic house-voice-shaped fallback — no model, no spend. Used under SENTINEL_AUDIT_MOCK, on an
 * LLM error, and in unit tests. Reads a touch more structured than the LLM path but follows the shape.
 */
export function templateSummary(adj: Adjudication): string {
  // Actionable = kept AND adversarially confirmed; uncertain = any unresolved verdict (kept or not).
  const confirmed = adj.findings.filter((f) => f.kept && f.verifierVerdict === "confirmed");
  const uncertain = adj.findings.filter((f) => f.verifierVerdict === "uncertain");
  const bugs = confirmed.filter((f) => f.class === "bug");
  const worst = [...confirmed].sort(
    (a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity),
  )[0];

  const lines: string[] = [];
  if ((adj.origin ?? "audit") === "incident") {
    const lead =
      adj.findings.find((f) => f.origin === "incident" && f.class === "bug") ??
      adj.findings.find((f) => f.kept) ??
      adj.findings[0];
    lines.push(
      `DETECTION — already on-chain. ${adj.contractId}: ${lead?.title ?? "runtime event"} (${lead?.severity ?? adj.severity}).`,
    );
    lines.push(
      "Correlation, not confirmation. A watched path fired — verify THIS event hit the precondition, not a routine authorized op.",
    );
    if (lead?.precondition) lines.push(`Precondition to verify: ${lead.precondition}.`);
    lines.push("Disclosure human-gated — no automated action taken.");
    return lines.join("\n");
  }
  if (bugs.length > 0) {
    lines.push(`${adj.contractId}: ${bugs[0].title} (${bugs[0].severity}).`);
  } else if (confirmed.length > 0) {
    lines.push(`${adj.contractId}: no exploitable bug — ${adj.class} only.`);
  } else {
    lines.push(`${adj.contractId}: no confirmed exploitable bug.`);
  }
  if (worst) {
    const act = worst.recommendedAction ?? adj.recommendedAction;
    lines.push(
      `The one thing worth acting on: ${worst.title} (${worst.severity}, ${worst.class}). ${act}`,
    );
  }
  if (uncertain.length) {
    lines.push(
      `${uncertain.length} caveat${uncertain.length > 1 ? "s" : ""} still uncertain, needing a look: ${uncertain
        .map((f) => f.title)
        .join("; ")}.`,
    );
  }
  lines.push(
    adj.pocStatus === "green"
      ? "PoC reproduces green."
      : "No PoC — nothing outsider-reachable to reproduce.",
  );
  return lines.join("\n");
}

/** The verdict-safe renderer: never throws, never spends under mock, and can't call the model without a
 *  key — so mock, tests, and keyless dev all deterministically get the template; prod gets the LLM voice. */
export async function renderSummary(adj: Adjudication): Promise<string> {
  if (process.env.SENTINEL_AUDIT_MOCK || !process.env.ANTHROPIC_API_KEY)
    return templateSummary(adj);
  try {
    return await llmRenderSummary(adj);
  } catch (e) {
    console.warn(`[render-summary] llm render failed, using template: ${(e as Error).message}`);
    return templateSummary(adj);
  }
}
