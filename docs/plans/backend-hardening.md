# Plan — backend hardening (Postgres / job queue / multi-tenancy / secrets)

**Status:** premature. Detailed architecture already in
[backend-architecture.md](../product/backend-architecture.md) — this scopes the WORK + the trigger.

## Why premature
Zero clients, single tenant, nothing deployed long-term. The current file-state (`.sentinel/`) + detached-
async bridge is sufficient for one tenant / a design partner. Building multi-tenant Postgres + a job queue
before the system runs in production is scaffolding around an unstarted machine — and WHICH hardening
matters (concurrency? durability? isolation?) only becomes clear once it's deployed with real load.

## Scope, phased (do in order, only as the trigger for each fires)
1. **Storage seam** (the keystone, buildable anytime) — a `Store` interface + the current `fs` impl,
   wired behind `STORE_BACKEND` across `sub-store` / `spend-ceiling` / `trigger-state` / `notify`. No new
   capability yet; it's the prerequisite for everything below. Payoff deferred until a 2nd backend exists.
2. **Postgres adapter** — implement `Store` on Postgres/Neon (the 16-table schema in backend-architecture).
   Trigger: multi-instance, or state durability matters (laptop/VM can't be the source of truth).
3. **Job queue** — replace the bridge's `runTrigger().catch()` fire-and-forget with a durable jobs table +
   a worker pool (retry, visibility, back-pressure, concurrency cap). Trigger: triggers can BURST (one
   block → many events) or audits must survive a worker restart.
4. **Secrets manager** — move `SENTINEL_WEBHOOK_SECRET` + API keys + per-sub signing secrets out of
   `env_file`/KV into a real secrets store. Trigger: prod, or >1 sub with distinct secrets.
5. **Multi-tenancy** — per-tenant sub secrets, spend budgets, KB namespaces, and bridge routing
   (webhook → the right tenant). Trigger: the 2nd client.

## Trigger to start
**Deployed AND (≥1 real client OR trigger bursts overwhelm detached-async).** Until then, deploy single-
tenant per the [RUNBOOK](../../deploy/RUNBOOK.md) and watch where it actually strains.

## Note
Step 1 (storage seam) is the one piece safe to build early if we want to de-risk the Postgres move — pure
refactor, fully testable. Everything after it is client/scale-gated.
