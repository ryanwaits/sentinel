# audit-sentinel — project instructions

**Sentinel — audit-informed, context-aware, Stacks-native security monitoring** for
smart contracts. ONE focused product (continuous monitoring); the multi-agent **audit
engine is a tiered, triggerable capability inside it** (pre/post-launch, on-upgrade,
on-demand, and fired reactively from monitoring triggers — a full sweep is ~$2). See
[docs/monitoring.md](./docs/monitoring.md). **Separate project, powered by secondlayer**
(a dependency, not a parent). Own release cadence, license, business.

Audit engine: discover value-holding Clarity contracts → prioritize by TVL × risk →
audit (multi-agent, model-tiered) → adversarially verify → **reproduce exploit in
sandbox** → report (honest bug-vs-centralization). Monitoring (the product): continuous
behavioral surveillance scoped to the client KB, secondlayer-powered, alert/trigger
driven → act (disclosure/escalation, human-gated).

Agent operating guide: see [AGENTS.md](./AGENTS.md). **Sequence + status:
[docs/roadmap.md](./docs/roadmap.md).** Strategy docs:
[docs/business-model.md](./docs/business-model.md),
[docs/validation-sweep.md](./docs/validation-sweep.md).

## Be terse
Concise responses, sacrifice grammar. Concise plans + unresolved-questions list.
Commit messages extremely concise. **No `Co-Authored-By` trailer.**

## Powered-by-secondlayer (hard rule)
- Depend ONLY on PUBLISHED `@secondlayer/*` — never workspace/internal.
  Pinned: `@secondlayer/sdk@^6.25.1`, `@secondlayer/stacks@^2.11.0`,
  `@secondlayer/subgraphs@^3.16.0`.
- Clarity values via `@secondlayer/stacks/clarity` (`Cl`), NOT `@stacks/transactions`.
- All on-chain data via secondlayer SDK / hosted Index / Subgraphs / Streams /
  Subscriptions. Do NOT swap in third-party APIs (raw Hiro, etc.) without being asked.
  (`STACKS_NODE_URL` defaults to Hiro only as a spike fallback — repoint at secondlayer.)
- Simnet uses `@stacks/clarinet-sdk` (new home; NOT `@hirosystems/clarinet-sdk`) —
  wire-compatible w/ `@secondlayer/stacks` `Cl`.

## Runtime constraints (don't break — they're load-bearing)
- **Engine: `@anthropic-ai/claude-agent-sdk` (`engine/audit.ts`), DIRECT to Anthropic**
  (`ANTHROPIC_API_KEY`). **eve is GUTTED** (spike showed it never finished a sweep; the
  Agent SDK does it in minutes — see memory `agent-sdk-vs-eve-spike` + docs/product/
  eve-to-agent-sdk-migration.md). NO Vercel AI Gateway, NO `ai` override pin.
- `audit(contractId, {tier})`: tier `monitor`=Sonnet/minimal-panel, `deep`=Opus/full-panel.
  Subagents reuse `agent/subagents/*/instructions.md`; tools = the in-process Sentinel MCP
  server (`engine/tools/`: `fetch_contract_source` + `run_simnet_poc`).
- **Node ≥ 22** (Agent SDK / bun). **zod v4** (`^4.4.3`) — keep.
- Models: `claude-opus-4-8` / `claude-sonnet-4-6` (Agent SDK aliases `opus`/`sonnet`).
- **Host (Phase 6, TODO):** the Agent SDK spawns a `claude` CLI subprocess → the audit
  worker wants a **container** (Fly/Railway/Render), NOT Vercel serverless.
- The `query()` subprocess inherits env; load `.env.local` (`ANTHROPIC_API_KEY`,
  `STACKS_NODE_URL`) before running. `AI_GATEWAY_API_KEY` is now UNUSED.

## Package manager
No `packageManager` field; npm-style `engines`. Scripts run via **bun**.
Before installing a package, check latest: `npm view <pkg> versions`.

## Sandbox / never-mainnet (guardrails)
- PoCs run ONLY in the sandbox. `engine/tools/run-simnet-poc.ts` shells
  `docker run --rm --network none` of the baked image (zero egress) and distinguishes
  sandbox-unavailable→`pocStatus pending` from PoC-fail→`failed`. Image by `simnet/Dockerfile`.
- **NEVER run exploits against mainnet.** Audits read-only; reproduction is sandboxed.
- Responsible/coordinated disclosure; no public PoC before a fix.
- Label findings honestly: real *bug* vs *centralization/trust* assumption
  (most vault findings were the latter).
- Every finding must be adversarially verified AND have a green simnet PoC before
  it ships. This is the false-positive control / credibility engine.

## Run it
```
. ./.env.local               # load ANTHROPIC_API_KEY + STACKS_NODE_URL first (set -a; . ./.env.local; set +a)
bun run audit <contractId> <tier>   # engine/run.ts — audit (tier=monitor|deep); prints metrics+findings
bun run poc:finding-1        # reproduce Finding 1 locally (15/15 assertions)
bun run sandbox:build        # docker build the airgapped runner image (for run_simnet_poc)
bun run sandbox:run          # docker run --network none → PoC, no egress
bun run webhook              # secondlayer→audit() HMAC bridge (PORT 3001); fires runTrigger async
bun run test                 # bun tests (monitoring/ webhooks/)
```

## Proven state
- Audited `SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc` (Zest sBTC).
  Finding 1: `socialize-debt` lets any one authorized contract force unbounded LP
  loss (no precondition/cap) → total-assets→0, redeem reverts `ERR-OUTPUT-ZERO`,
  sBTC locked. `simnet/poc/finding-1.ts` reproduces, 15/15, green airgapped.
- `vault.clar` copies vulnerable fns verbatim from mainnet; only token/DAO-auth
  plumbing reduced (documented in the file).

## Open questions (unresolved — don't silently decide)
- Monetization priority: retainer vs one-off audit vs salvage.
- Disclosure stance: pure whitehat vs competitive bounties. MVP repro depth.
- Phase 6: container host for the audit worker (Agent SDK subprocess) — Fly/Railway/Render.
- Re-add discovery (`find_value_contracts`, was an eve tool) as an engine MCP tool wired to a
  token-balances subgraph + USD price feed; same for the `check_clarity_drift` monthly check.
  **When re-added: never silently return a stub. Emit `mode:"seed-stub"` (or error) on any degraded
  path — a discovery tool that quietly returns a hard-coded contract is false-confidence, which the
  credibility rules forbid.**
- Feed KB/waiver context into `engine/audit` for bug-vs-centralization calibration.
