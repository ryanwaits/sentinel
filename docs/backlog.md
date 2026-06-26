# Backlog

Deferred, non-pressing items. Capture enough context to pick up later.

## Incident-sweep automation (deferred 2026-06-21)
**Status:** not pressing. Clarity-drift half is automated (eve monthly schedule +
`check_clarity_drift`). The incident half is **manual for now** — run the Claude Code
`stacks-hacks-research` workflow on demand to refresh the incident corpus.

**What's left to decide / build:**
- How the monthly incident sweep should run automatically. Options considered:
  1. **Claude Code routine** (recommended) — schedule the `stacks-hacks-research`
     workflow monthly; it can read+write repo files and produces verified, sourced
     entries. No new vendor. (Set up via the `/schedule` skill.)
  2. **Anthropic native web search in eve** — a server-side provider tool through the
     Vercel AI Gateway. Plausible (eve's dist references `provider-defined` /
     `server_tool` / `anthropic.web`), but unproven through `@ai-sdk/gateway`
     (`@ai-sdk/anthropic` is not installed) and lower quality than the workflow for
     verified research.
  3. ~~Tavily / third-party search API~~ — rejected: don't want another service to manage.

**Context:** the `web_search` eve tool (Tavily-based) was removed. Deep, adversarially
-verified incident research already lives in the Claude Code workflow — that's the
better engine; the open question is only how to *schedule* it.

**When picked up:** lean toward option 1; confirm the routine can invoke the workflow
and apply file updates (PR), then drop this item.

## Subagent source self-sufficiency (deferred 2026-06-26)
**Status:** not pressing — pipeline works; this removes the last manual nudge.

**Problem (found in track-A validation):** auditor/verifier subagents are stateless
with no filesystem/sandbox access, so they depend on the orchestrator pasting the
contract source into their prompt. On a large contract (Zest vault = 1046 lines) the
orchestrator economizes to excerpts; the (correctly rigorous) verifier then asks for
specific helper bodies and **bubbles the request to the human** instead of the
orchestrator self-serving from the source it already fetched. Hardening the
delegation contract (always inline FULL source to the verifier) reduced but did not
eliminate this — it's model discipline on a big paste.

**Durable fixes to evaluate:**
1. **Give auditor + verifier subagents their own `fetch_contract_source` tool**
   (a defined eve tool — no sandbox needed) so they pull source directly instead of
   depending on the orchestrator's paste. Cleanest if eve subagents can carry tools;
   verify against `defineAgent`/subagent tool wiring. **Recommended — investigate first.**
2. Orchestrator **chunked-handoff protocol**: standardize a "FULL SOURCE (lines
   1–N)" block per subagent + an explicit "never ask the human for source" rule, and
   auto-answer any subagent source request from its own context.
3. Cap target size for single-pass audits; above N lines, split by module.

**When picked up:** try (1); if subagents can't hold tools, do (2).

## Agent-driven PoC: sandbox prerequisite + graceful degrade (deferred 2026-06-26)
**Status:** not pressing — local-only gap; prod (Vercel Sandbox) unaffected.

**Found in track-A validation:** the full agent pipeline ran end-to-end
(fetch → triage → 6 auditors w/ full source → synthesis of 9 candidates →
adversarial verifier that reduced to one provable invariant and killed a
false-positive), then `run_simnet_poc` failed with `DockerDaemonUnavailableError`
because Docker/OrbStack wasn't running. `agent/sandbox.ts` uses the eve `docker()`
backend; locally it needs the daemon up (`docker info`), in prod it's Vercel Sandbox.

**Two things to do:**
1. **Doc/run prereq:** agent-driven PoC requires Docker running locally — start
   OrbStack/Docker Desktop before triggering a sweep that reaches reproduction.
   (Same image as `bun run sandbox:run`.)
2. **Graceful degrade:** the orchestrator errored on the failed tool instead of
   emitting the report with "PoC: pending (sandbox unavailable)". Harden the
   pipeline so a `run_simnet_poc` failure downgrades the finding's PoC status and
   still produces the final report, rather than aborting the turn.
