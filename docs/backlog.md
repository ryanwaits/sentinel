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

## Monitor wedge — inner-contract-call visibility ("ninja contract" detector) (2026-06-26)
**Status:** the product play. Distinct from auditing — this is the MONITOR stage data layer.

**The gap it closes (Charisma-DAO-owner complaint):** a Stacks tx has ONE top-level
principal sender + ONE entry-point contract. When the entry point is an attacker
contract M that internally `(contract-call? victim ...)`, the call to `victim` is an
*event in M's execution trace*, NOT a top-level tx. Explorers key the per-contract
"transactions" view on the **entry-point / direct caller**, so a privileged call to
`victim` routed through M (a contract the owners didn't know existed) **never shows up
under victim's tx list**. The owners "couldn't see the malicious txs" because the
standard view doesn't surface inner/nested contract-calls into their contract.

**Why secondlayer solves it:** the decoded Index/Streams capture `contract_call`
events at execution granularity, indexable by the contract *touched* (not just the
entry point). A subgraph can materialize "every caller of a protected contract's
privileged fns, at any call depth," which (a) enhances/over-lays explorers with the
visibility owners wanted, and (b) is the trigger source for the monitor gate →
auditor evaluation.

**Nesting-depth finding (checked the installed types):** the subgraph `contract_call`
source's `ContractCallEvent` is **top-level only** — fields are `sender` ("the
principal who signed the tx"), `contractId`, `functionName`, `args`, `result`; there
is NO immediate-caller or call-depth field. So a `contract_call` subgraph alone has
the SAME blind spot as explorers (it sees the entry-point call, not the inner call to
victim). Two ways around it:
- **Effect-based (works today):** the DRAIN itself — value leaving victim — surfaces
  as `ft/nft/stx` asset events with victim as `sender` **at any call depth**, because
  asset events are emitted regardless of which contract triggered the move. Our
  `asset-holdings` subgraph already indexes exactly this. So "unexpected outflow from a
  protected contract" is detectable now, even when the triggering contract is hidden.
- **Call-attribution (needs verification):** to name the malicious *caller* (not just
  the effect), check whether the decoded **Index / Streams** expose the execution call
  tree or `contract_log`/print events that identify the inner call. The subgraph source
  doesn't; the Index API might. Verify before promising "see who called you."

**To build:**
1. **`contract-call-watch` / outflow-watch:** start with asset-event outflows from a
   watchlist of protected contracts (depth-independent, available now); layer
   call-attribution if the Index exposes the call tree.
2. **Monitor gate:** alert on an unexpected privileged outflow / interaction on a
   protected contract → hand it to the governance/access-control auditors for live
   adjudication (event-driven triage, not "audit this contract"). Wire via
   `webhooks/secondlayer-webhook.ts` (exists, not wired).

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
