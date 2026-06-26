# audit-sentinel — project instructions

Continuous Stacks asset-safety audit pipeline. **Separate project, powered by
secondlayer** (a dependency, not a parent). Own release cadence, license, business.

Pipeline: discover value-holding Clarity contracts → prioritize by TVL × risk →
audit (multi-agent) → adversarially verify → **reproduce exploit in sandbox** →
monitor (chain webhooks) → act (disclosure/bounty/salvage, human-gated).

Agent operating guide: see [AGENTS.md](./AGENTS.md). **Sequence + status:
[docs/roadmap.md](./docs/roadmap.md).** Strategy docs:
[docs/business-model.md](./docs/business-model.md),
[docs/validation-sweep.md](./docs/validation-sweep.md).

## Be terse
Concise responses, sacrifice grammar. Concise plans + unresolved-questions list.
Commit messages extremely concise. **No `Co-Authored-By` trailer.**

## Powered-by-secondlayer (hard rule)
- Depend ONLY on PUBLISHED `@secondlayer/*` — never workspace/internal.
  Pinned: `@secondlayer/sdk@^6.25.1`, `@secondlayer/stacks@^2.5.2`,
  `@secondlayer/subgraphs@^3.16.0`.
- Clarity values via `@secondlayer/stacks/clarity` (`Cl`), NOT `@stacks/transactions`.
- All on-chain data via secondlayer SDK / hosted Index / Subgraphs / Streams /
  Subscriptions. Do NOT swap in third-party APIs (raw Hiro, etc.) without being asked.
  (`STACKS_NODE_URL` defaults to Hiro only as a spike fallback — repoint at secondlayer.)
- Simnet uses `@stacks/clarinet-sdk` (new home; NOT `@hirosystems/clarinet-sdk`) —
  wire-compatible w/ `@secondlayer/stacks` `Cl`.

## Runtime constraints (don't break — they're load-bearing)
- **eve 0.12.x** (Vercel durable agent framework). Host: Vercel (schedules→Cron,
  sandbox→Vercel Sandbox in prod).
- **Node ≥ 24** (eve hard requirement).
- **`ai` pinned to `7.0.0-beta.178`** via `package.json` `overrides` (eve 0.12 pins it).
- **zod v4** (`^4.4.3`). zod v3 crashes eve's schema normalizer
  (`Cannot read properties of undefined (reading 'input')`). Do not downgrade.
- Model: `anthropic/claude-opus-4.8` via Vercel AI Gateway. Gateway FREE TIER 403s
  Opus → needs paid credits to run the agent path. `AI_GATEWAY_API_KEY` in
  `.env.local` (gitignored).

## Package manager
No `packageManager` field; npm-style `overrides`/`engines`. Scripts run via **bun**.
Before installing a package, check latest: `npm view <pkg> versions`.

## Sandbox / never-mainnet (guardrails)
- PoCs run ONLY in the sandbox. `agent/sandbox.ts` = eve `docker()` backend,
  `networkPolicy: "deny-all"` (zero egress). Image baked by `simnet/Dockerfile`.
- **NEVER run exploits against mainnet.** Audits read-only; reproduction is sandboxed.
- Responsible/coordinated disclosure; no public PoC before a fix.
- Label findings honestly: real *bug* vs *centralization/trust* assumption
  (most vault findings were the latter).
- Every finding must be adversarially verified AND have a green simnet PoC before
  it ships. This is the false-positive control / credibility engine.

## Run it
```
bun run poc:finding-1        # reproduce Finding 1 locally (15/15 assertions)
bun run sandbox:build        # docker build the airgapped runner image
bun run sandbox:run          # docker run --network none → PoC, no egress
eve build                    # compile agent (4 tools, 8 subagents, 2 schedules, channel)
node .output/server/index.mjs   # headless server → POST /eve/v1/session triggers agent
bun run dev                  # eve TUI (needs interactive terminal; --no-ui buggy in 0.12)
bun run webhook              # secondlayer→eve HMAC bridge (PORT 3001)
```
Headless: use the built server, NOT `eve dev --no-ui` (buggy in 0.12).

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
- Add paid AI-Gateway credits to unblock the agent-driven path.
- Wire `find_value_contracts` to a deployed token-balances subgraph + USD price
  feed; confirm Vercel concurrency/duration ceilings for ~1M-token sweeps.
