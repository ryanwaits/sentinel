# Sentinel — product surface (planning index)

Scope docs for turning the **proven monitoring backend** (M0–M5; see
[../monitoring-build-plan.md](../monitoring-build-plan.md)) into a **multi-tenant product** —
signup → project → audit → toggle monitoring → human-gated alerts. Planning only; no production
code yet. The backend primitives (audit engine, KB→`deriveConfig`→`MonitoringConfig`, provisioner→
chain subscriptions, bridge pre-filter→tiered audit, adjudication→warn-once notify) already exist
and are individually proven; what's missing is the **surface + two glue automations + multi-tenancy**.

## The three plans
| Doc | What it scopes | Key decision |
|---|---|---|
| [audit-to-monitoring-automation.md](./audit-to-monitoring-automation.md) | The missing glue: finished audit → `KBRecord` → default `MonitoringConfig` (today hand-seeded) | New `[SENTINEL-KB]` report block + deterministic distiller; class-aware auto-apply (governance allowlist safe; counterparty allowlist never auto-filled) |
| [backend-architecture.md](./backend-architecture.md) | Multi-tenant substrate: data model, persistence, API, tenancy, hosting | **Postgres (Neon on Vercel)** as system of record (atomic spend-reserve, relational alerts/spend/runs); `fs` backend behind `STORE_BACKEND` for local/tests |
| [control-plane-ux.md](./control-plane-ux.md) | User-facing flow + screens | The **monitoring-plan review/edit screen** (defaults from the audit) is the core surface; every field maps to a real `MonitoringConfig`/`SensitiveFn` field; disclosure stays human-gated |

Read together: **#1 fills the audit→config gap, #2 is the substrate, #1's output is what #3 renders.**

## Phased build order
- **Phase 0 — DONE:** monitoring backend M0–M5 (primitives proven; the M5 live run also surfaced the
  run-reader observability gap → drives the run-store in Phase 2).
- **Phase 1 — audit→config automation** ([#1](./audit-to-monitoring-automation.md)). Smallest, highest
  leverage, **no infra**: emit `[SENTINEL-KB]` at end-of-audit + a deterministic distiller →
  candidate `KBRecord` → human review → `deriveConfig`. Unblocks "defaults from the audit" — the
  thing the whole product sells. Ships on today's files (git-checked `sentinel/kb/`).
- **Phase 2 — persistence + multi-tenancy** ([#2](./backend-architecture.md)). Swap the `.sentinel/`
  file seam for Postgres behind `STORE_BACKEND`; per-tenant subscription provisioning + secret
  isolation, per-account spend budgets, tenant-scoped `ruleKey`/webhook routing. Includes the
  **durable run-store** that fixes the run-reader gap (persist-on-completion + a Cron reconciler off
  the replayable stream) — the concrete blocker we hit in the M5 live run.
- **Phase 3 — control-plane API + UI** ([#3](./control-plane-ux.md)). REST `/v1/*` + the screens:
  project/contract list, audit+report view, monitoring-plan review/edit, toggle, alerts inbox,
  spend view. MVP can be internal-operated (jwtHmac) before real self-serve signup.

Cross-cutting (decide early, touches all phases): **tenant model** (internal design-partners vs
self-serve signup) and **secondlayer tenancy** (one platform account, tenant-tagged subs vs
per-tenant keys).

## Consolidated open questions (dedup across the three docs)
1. **Tenant model / MVP auth** — internal-operated via `jwtHmac` for design partners, or build real
   self-serve multi-tenant signup now? (Gates how much of Phase 2/3 is MVP.)
2. **KB persistence vs editing** — keep `KBRecord` as git-checked JSON (+ thin write API / `gh` PR
   per audit) or promote to the DB so the UI can edit it? (Couples Phase 1 ↔ Phase 2.)
3. **secondlayer multi-tenancy** — one platform account with tenant-tagged subscriptions vs
   per-tenant API keys (isolation/billing vs key-management friction).
4. **eve tenancy + run-store ownership** — shared deployment pair with in-band tenant context vs
   per-account instances; push run persistence upstream to eve vs own a Cron reconciler.
5. **Re-audit merge** — may a *new* fail-safe sensitive fn auto-commit, or is every config change
   human-gated? (noise vs blind-spot.)
