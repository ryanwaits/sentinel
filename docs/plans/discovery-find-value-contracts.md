# Plan — find_value_contracts (proactive discovery)

**Status:** ✅ v1 SHIPPED (Index-based) — `engine/discover.ts` (`discoverTargets` + `bun run discover`),
live-proven (ranks the real top sBTC contracts; Zest vault #1 at ~$73M). Was an eve tool
(`agent/tools/find_value_contracts.ts`, removed in the gut); see also [discovery-widening](../discovery-widening.md).

**Architecture decision (2026-07-21):** NOT the hosted subgraph. The subgraph is secondlayer running your
indexing on THEIR infra — a managed dependency, ill-fit for a self-hosted worker. Two honest steps instead:
- **v1 (shipped):** Index-based candidate discovery — recent sBTC transfer recipients (free-tier recent-24h
  window, no history/credits) + KB contracts as candidates; each candidate's REAL balance read live off the
  node (`get-balance` FT + `/v2/accounts` STX, reusing the invariant lane's read-only-uint); priced by the
  curated `agent/pricing.ts`; ranked by USD. Honest `mode` (index | seed-stub), never a silent stub.
- **v2 (deferred, self-hosted):** `sl.index.events.consume()` → own Postgres balance table (the subgraph's
  handlers on OUR box, ~50 lines w/ built-in checkpoint + reorg). For exhaustive whole-chain coverage when
  the recent-window candidate set isn't enough. Deploy the hosted subgraph only if we ever want zero-ops.

Remaining Tier-4 sub-items: `check_clarity_drift` (monthly source-drift check → scheduler slot already
stubbed in `scheduler.ts`); the `find_value_contracts` MCP-tool wrapper (deferred — YAGNI until a discovery
AGENT exists; the CLI + `discoverTargets()` are the real interface).

## Problem
Monitoring is REACTIVE — the bridge audits a contract because a webhook fired on it. There's no way to
find NEW value-holding contracts worth onboarding. Discovery = rank Stacks contracts by real $-at-risk so
we know what to baseline-audit + watch.

## Why blocked
The real value is TVL-ranking of UNAUDITED contracts, which needs an `asset-holdings` subgraph (FT + STX
balances per holder) + a USD price feed. The subgraph isn't deployed. Without it, a "discovery" tool is
just `listRecords()` over contracts we already know — not discovery.

## Scope (when unblocked)
1. **Deploy the `asset-holdings` subgraph** (secondlayer Subgraphs) — index FT-transfer + STX balances,
   expose top-holders-per-asset. NFTs out of scope (illiquid, floor ≠ realizable).
2. **USD price feed** — curated map to start (the old `agent/pricing.ts` approach), a live oracle later.
3. **`discoverTargets({limit})`** — query the subgraph, keep CONTRACT-principal holders, merge per holder,
   price FT+STX, rank by summed USD. Fall back to KB records + the audited seed when the subgraph/env is
   unset (and `log()` the degraded mode — never silently return a stub).
4. **CLI** `bun run discover` + optional wiring into a scheduled sweep (→ baseline-audit + distill the top N).

## Trigger to start
When we want to GROW the watched set proactively (a sales/coverage motion), not just monitor known
clients. Until then, onboarding is manual (`bun run distill <id> <client>` → review → `sentinel/kb/`).

## Dependencies
secondlayer Subgraphs (`@secondlayer/subgraphs`), a price source. No new model spend (deterministic).
