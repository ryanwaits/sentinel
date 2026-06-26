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

**Call-tree finding (VERIFIED 2026-06-26 against the live Index + installed types):**
There is **no structured nested call graph.** `sl index transactions get <tx>` returns
top-level metadata + the entry-point `contract_call` + `post_conditions` — no events
array, no inner-call tree. `sl index contract-calls` is top-level entry points only
(`contract_id` = directly-called contract, `sender` = principal). The subgraph
`contract_call` source matches (no caller/depth field). BUT the decoded **event stream**
reconstructs the reverse index explorers lack, at any depth, keyed by the touched
contract:
- **`print` events carry caller attribution.** Verified: a vault `redeem` print event
  is indexed under `contract_id = vault` with `payload.value.caller =
  SP...v0-4-market` — i.e. the contract logged `contract-caller`, so an INNER call into
  the vault is fully visible ("who called my privileged fn"). Caveat: depends on the
  contract emitting the caller in a print (this vault does — prints caller in
  redeem/socialize-debt/system-borrow; an arbitrary victim might not).
- **`ft/nft/stx` asset events are depth-independent.** Value leaving victim emits an
  event with victim as `sender` regardless of call depth → the DRAIN effect is always
  visible (our `asset-holdings` already indexes this).
- **Mempool is queryable** (`sl index mempool`) — pending txs before mining, with full
  `contract_call` + post-conditions → PRE-confirmation warning, not just post-mortem.

So secondlayer DOES expose what explorers hide — via prints (caller attribution when
instrumented) + asset events (effect, always) + mempool (pre-confirmation). No call
tree needed.

**To build:**
1. **outflow + privileged-call watch:** subgraph/Index watch over a watchlist of
   protected contracts — (a) asset-event outflows (depth-independent, now), (b) `print`
   events surfacing `caller` for privileged fns, (c) authorization-change calls
   (`set-approved-*`, `set-impl`, proposal submission) as pre-drain setup signals.
2. **mempool pre-confirmation tap:** flag a pending tx touching a protected contract's
   privileged fn → warn (and pause if the contract is pausable) before it mines.
3. **Monitor gate:** route any of the above to the governance/access-control auditors
   for live adjudication (event-driven triage). Wire via
   `webhooks/secondlayer-webhook.ts` (exists, not wired).

**Timing reality (the "isn't monitoring too late?" answer):** atomic single-tx flash
exploits can only be reacted to — but (a) mempool gives a pre-confirmation window,
(b) most big drains are MULTI-tx (Velar 236 wallets, Zest ~5 calls) so catching tx 1
and pausing stops txs 2..N, and (c) the attacker's SETUP phase (deploy + get authorized)
precedes the drain and is itself detectable — the strongest early warning.

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
