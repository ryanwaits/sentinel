# AGENTS.md — Audit Sentinel operating guide

Agent-facing guide. Project rules + constraints: see [CLAUDE.md](./CLAUDE.md).
Orchestrator persona: `agent/instructions.md`. Orchestrator = Opus 4.8 (`agent/agent.ts`).

## Pipeline (the product shape)
1. **Discover** — `find_value_contracts` (token-balances subgraph; seed fallback).
2. **Prioritize** — TVL × attack-surface risk; highest asset-at-risk first.
3. **Audit** — fan out to the 8 `auditor-*` subagents in parallel.
4. **Verify** — every finding through `verifier`, adversarially (default skeptic).
5. **Reproduce** — every CONFIRMED high/critical via `run_simnet_poc` (sandbox).
6. **Monitor** — continuous BEHAVIORAL surveillance (not re-audit-on-change): watch
   live activity/flows/interactions/governance against the client's contracts, scoped
   to the audit's KB/context, via secondlayer subscriptions + mempool. Default +
   client-configured + context-aware triggers fire alerts. See
   [docs/monitoring.md](./docs/monitoring.md).
7. **Act** — disclosure / bounty / salvage / alert-escalation. **Human-gated. Never automatic.**

## Reproduce-before-ship (the credibility rule)
A finding ships ONLY if it (a) survives adversarial verification AND (b) has a
green, runnable simnet PoC. No green PoC for a high/critical → it does not ship.
Adversarial-verify + sandbox-repro are the false-positive control.

## Bug vs centralization (honesty rule)
Label every finding: real *bug* vs *centralization/trust* assumption. Most vault
findings are the latter — say so plainly. Don't inflate trust assumptions into bugs.

## Subagent roster (delegate by dimension)
Audit by fanning out to all auditors in parallel, then verify each finding:
- `auditor-access-control` — auth gates (tx-sender vs contract-caller), unguarded
  mutators, admin/DAO blast radius, authorized-contract powers (e.g. socialize-debt),
  init/front-run.
- `auditor-reentrancy`
- `auditor-share-accounting`
- `auditor-interest-math`
- `auditor-flashloan-economics`
- `auditor-invariants-dos`
- `auditor-governance` — DAO/ExecutorDAO proposal lifecycle, arbitrary-code proposal
  execution, `with-all-assets-unsafe` around dynamic proposal calls, flash-loanable
  voting, missing timelock/snapshot, upgrade/impl-swap authority. The proposal-exec
  path is where most DAO drains live — and the class the monitor gate surfaces.
- `auditor-oracle` — external price/exchange-rate consumption: staleness/timestamp
  checks, deviation/bounds circuit-breakers, spot-vs-TWAP manipulation, single-source
  fallback, decimals/scaling, price-push authority. Delegate when a price values
  collateral, mint, liquidate, or settle.
- `verifier` — adversarial. Re-reads source, tries to REFUTE under Clarity
  semantics (underflow/overflow ABORTS, no wraparound; reverts roll back state;
  ft-mint/burn of 0 errs+reverts). Confirms only with a concrete working exploit;
  corrects severity; proposes exact PoC steps for `run_simnet_poc`.

Each auditor returns structured findings (title, severity, location, root cause,
attacker capability, asset-safety impact, step-by-step repro). Clean dimension → say so.

## Tools
- `fetch_contract_source` — raw Clarity source via Stacks node RPC
  (`/v2/contracts/source`). Repoint `STACKS_NODE_URL` at secondlayer in prod.
- `find_value_contracts` — TVL-ranked audit targets from the `token-balances`
  subgraph; falls back to audited seed when `SECONDLAYER_API_URL`/`_API_KEY` unset.
- `run_simnet_poc` — exec a PoC (`poc/*.ts`) in the deny-all docker sandbox; returns
  `{reproduced, exitCode, summary}`. Safe/unattended; NEVER touches mainnet.

Maintenance tools (drive the monthly-knowledge-refresh schedule, report-only):
- `check_clarity_drift` — fetch live Clarity docs (functions/keywords/types) + return
  the baked baseline (`agent/knowledge/clarity-baseline.ts`) to diff for NEW/CHANGED/
  deprecated built-ins.

Incident-sweep automation is deferred (see docs/backlog.md). Refresh the incident
corpus on demand with the Claude Code `stacks-hacks-research` workflow.

## Schedule & ingress
- `agent/schedules/weekly-sweep.ts` — cron `0 9 * * 1` (Mon 09:00 UTC) → Vercel Cron.
  Runs the full pipeline over top TVL targets.
- `agent/channels/eve.ts` — default `/eve/v1` HTTP channel, anonymous (`none()`).
  Tighten auth before prod.
- `webhooks/secondlayer-webhook.ts` — verifies secondlayer HMAC, forwards to
  `/eve/v1/session`. Lives OUTSIDE `agent/` so eve doesn't treat it as a channel.

## Hard guardrails
- NEVER run exploits against mainnet. Reproduction is sandbox-only (deny-all egress).
- Responsible/coordinated disclosure; no public PoC before a fix.
- Disclosure/bounty/salvage actions require human approval.
- Use secondlayer data sources only; no third-party APIs without being asked.
