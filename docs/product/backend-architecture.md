# Sentinel — Multi-Tenant Backend Architecture

> Design doc. Turns the single-tenant CLI/files/headless-server prototype into a
> multi-tenant product. No production code here — this scopes the data model,
> persistence, API, multi-tenancy, hosting, and migration.
> House constraints (load-bearing): published `@secondlayer/*` ONLY · eve 0.12 on
> Vercel · Node ≥ 24 · zod v4 · sandbox/never-mainnet · disclosure human-gated.

## 0. Where we are (single-tenant)
All durable state = JSON files under `.sentinel/` (gitignored, ephemeral on Vercel),
plus git-checked KB JSON under `sentinel/kb/`. Everything is keyed for ONE tenant:
- `sub-store.ts` → `.sentinel/subscriptions.json` (ruleKey → {subId, **signingSecret**}).
- `spend-ceiling.ts` → `.sentinel/spend.json` + `.sentinel/PAUSED` (ONE global daily budget).
- `trigger-state.ts` → `.sentinel/triggers.json` (dedup + debounce + trigger→session ledger).
- `notify.ts` → `.sentinel/notifications.json` (warn-once state).
- `kb.ts` → `sentinel/kb/*.json` (git-checked KBRecords).
- Auth = ONE HMAC bridge↔eve secret (`EVE_SESSION_SECRET`) + ONE webhook fallback secret.
- eve = ONE headless server; bridge = ONE process. No accounts/projects/users.

Each of these modules already comments "swap the `.sentinel/` seam for external KV in
prod" — this doc makes that swap and threads `tenant_id` (account/project) through.

---

## 1. DATA MODEL

Relational. Existing zod schemas become row shapes (validate at the API/ingest edge;
the DB is the system of record). Hierarchy: **Account → Project → Contract → {KB, Config,
Subscriptions, Runs, Adjudications, Alerts}**, with Account-scoped Budget + Audit log.

### Entities

| Table | Source / derives from | Key fields | Notes |
|---|---|---|---|
| `accounts` | NEW | id, name, plan, status, created_at | The tenant / billing boundary. |
| `users` | NEW | id, email, created_at | |
| `memberships` | NEW | account_id, user_id, role(`owner\|admin\|viewer`) | Account membership + RBAC. |
| `api_keys` | NEW | id, account_id, hash, label, last_used_at | Control-plane auth (hash only). |
| `projects` | NEW | id, account_id, name, route(notify channel id) | A monitored app = a set of contracts; the `route` replaces `MonitoringConfig.route`. |
| `contracts` | implicit (contractId) | id, project_id, contract_id(`addr.name`), archetype, baseline_audited | One watched Clarity contract. `archetype`/`baseline_audited` from `Archetype`/KBRecord. |
| `kb_records` | **`KBRecord`** (kb.ts) | contract_id(FK), client, archetype, closure[], sensitive_fns(jsonb), waivers(jsonb), audited_at, source | Was git-checked JSON. `sensitive_fns` = `SensitiveFn[]`, `waivers` = `CentralizationWaiver[]` as validated jsonb. |
| `monitoring_configs` | **`MonitoringConfig`** (config.ts) | id, contract_id(FK), tier, sensitive_fns(jsonb), closure[], baseline_audited, derived_from, **status**(`draft\|approved\|active`), approved_by, approved_at | Mostly DERIVED via `deriveConfig`; persisted so a human can EDIT + APPROVE before it goes live (edit+approve flow). `client`+`contractId`+`archetype`+`route` resolve from the contract/project rows. |
| `subscriptions` | **`SubRecord`** (sub-store.ts) | id, account_id, contract_id(FK), rule_key, sub_id(secondlayer), signing_secret(**encrypted**), fn, trigger_class, url, status | Per-tenant secondlayer sub registry. `signing_secret` was surfaced-once → encrypt at rest. |
| `trigger_runs` | **`TriggerRecord`** (trigger-state.ts) | session_id(PK), account_id, contract_id, fn, trigger_class, tier, tx_id, block_height, deadline_block, audit_targets[], suspicious, estimate_usd, dispatched_at, **status**(`running\|completed\|failed`) | The trigger→session ledger AS A TABLE. Adds run status for the durable run-store (§5). |
| `run_events` | NEW (run-store) | session_id(FK), idx, type, data(jsonb) | Durable copy of eve's stream events — fixes the run-reader gap (§5). Append-only. |
| `dedup_keys` | trigger-state `seen`/`debounce` | account_id, key, kind(`event\|debounce\|webhook`), seen_at, ttl | Dedup + debounce + handled-webhook-id, scoped per account. TTL-pruned. |
| `adjudications` | **`Adjudication`** (adjudication.ts) | id, session_id(FK), contract_id, severity, class, alert_level, poc_status, provisional, needs_human, findings(jsonb), suppressed[], recommended_action, token_cost_usd, created_at | `findings` = `AdjudicatedFinding[]`. One per (re-)adjudication of a run. |
| `alerts` | notify.ts `NotifiedRecord` | id, account_id, session_id(FK), level, severity, provisional, poc_status, promoted, notified_at | The warn-once / promotion state + the alerts feed. One row = one delivered alert. |
| `account_budgets` | **`SpendState`** (spend-ceiling.ts) | account_id(PK), date, spent_usd, dispatches, daily_ceiling_usd, paused, paused_reason, paused_at | PER-ACCOUNT daily budget (was one global). `daily_ceiling_usd` per plan. |
| `audit_logs` | NEW | id, account_id, actor(user/api_key/system), action, target, payload(jsonb), at | Control-plane mutations (config approve, monitoring toggle, pause clear, disclosure-gate ack). Compliance + the human-gated trail. |

### Relationships (text ERD)
```
account 1─* project 1─* contract 1─1 kb_record
                              contract 1─1 monitoring_config (current/approved)
                              contract 1─* subscription
                              contract 1─* trigger_run 1─* run_event
                                                       1─* adjudication
                                                       1─* alert
account 1─1 account_budget
account 1─* {api_key, membership, audit_log, dedup_key}
```

### Schema reuse rule
Keep the zod schemas as the validation layer at every boundary (API ingress, webhook
ingest, jsonb read-back). `MonitoringConfig`, `KBRecord`, `SensitiveFn`,
`CentralizationWaiver`, `Finding`/`Adjudication`, `TriggerRecord`, `SubRecord` stay the
single source of truth for shape; tables add only the relational/tenancy/lifecycle
columns (ids, FKs, `account_id`, `status`, timestamps). zod v4 stays (eve normalizer
requires it). Store the rich nested bits (`sensitiveFns`, `waivers`, `findings`,
`audit_targets`) as validated **jsonb**, not over-normalized child tables — they're
read/written whole and schema-checked by zod.

---

## 2. PERSISTENCE — replace the `.sentinel/` seam

### Recommendation: **Postgres** (Neon, via the Vercel Marketplace) as system of record.
Rationale:
- The data model is **relational + multi-tenant** (account→project→contract→run→alert,
  every query scoped by `account_id`, FK integrity, joins for the alerts/spend/runs
  feeds). KV (Vercel KV/Upstash) models the *current* file seam (it's all `getByKey`/
  `putByKey`) but forces app-side joins, app-side tenant scoping, and gives no
  transactions for the read-modify-write hot spots.
- **Atomicity is load-bearing.** `spend-ceiling.reserve()` is a check-then-increment the
  current code flags as "single writer assumed; multi-instance needs an atomic KV
  increment." On Vercel the bridge is a (possibly concurrent) serverless function → the
  budget gate MUST be atomic or the cost cap leaks. Postgres `UPDATE … SET spent_usd =
  spent_usd + $est WHERE … AND spent_usd + $est <= ceiling RETURNING` is one atomic,
  correct statement. Same for `dedup_keys` (`INSERT … ON CONFLICT DO NOTHING` →
  exactly-once dispatch).
- **Audit log + alerts feed + run history** are inherently append-only relational tables
  with time-range queries — Postgres-native, awkward in KV.
- Driver: a Node≥24 / serverless-friendly Postgres client over HTTP/pooled connections
  (Neon serverless driver). A thin typed query layer (e.g. Drizzle) keeps zod the
  validation edge. No `@secondlayer/*` rule impact — this is our own store, not chain data.

Secrets (`subscriptions.signing_secret`) encrypted at rest (app-level envelope encryption
with a KMS/`SENTINEL_SECRET_KEY`), since they previously lived in a gitignored file.

**Optional KV companion (later):** Upstash/Vercel KV ONLY for hot ephemeral dedup/
debounce/rate-limit if Postgres write volume becomes the bottleneck. Not MVP — keep one
store.

### Seam points (each module: swap fs read/write for a tenant-scoped store call)
Every module below today does `STATE_DIR = SENTINEL_SINK_DIR ?? .sentinel` + `load()/
save()` on a JSON file. The refactor replaces `load/save` with repository calls keyed by
`account_id` (the file path was the implicit single-tenant key):

| Module | Today (file) | Becomes (Postgres repo) |
|---|---|---|
| `sub-store.ts` | `subscriptions.json` | `subscriptions` table; `getByRuleKey` → `WHERE account_id=$a AND rule_key=$k`. |
| `spend-ceiling.ts` | `spend.json` + `PAUSED` flag | `account_budgets` row; `reserve()` = atomic conditional UPDATE; pause = a column, not a flag file. |
| `trigger-state.ts` | `triggers.json` | `trigger_runs` + `dedup_keys`; dedup = `INSERT ON CONFLICT`. |
| `notify.ts` | `notifications.json` | `alerts` table; warn-once = unique `(session_id)` upsert. |
| `kb.ts` | `sentinel/kb/*.json` (git) | `kb_records` table; `deriveConfig` reads the row, writes a `monitoring_configs` draft. |
| `run-reader.ts` | (stream only) | also persist folded events → `run_events`/`trigger_runs.status` (§5). |
| webhook in-mem `handledWebhookIds` | process Set | `dedup_keys` kind=`webhook` (survives cold start). |

Keep `SENTINEL_SINK_DIR`/file backend as a `STORE_BACKEND=fs|pg` option for local dev +
the existing unit tests (tests already run with `SENTINEL_SINK_DIR=$(mktemp -d)`). Repo
interface is the abstraction; fs and pg are two implementations.

---

## 3. API SURFACE (control plane, REST)

Auth: account API key (Bearer) or session; every route scoped to the caller's
`account_id`; mutations write `audit_logs`. JSON, zod-validated with the existing schemas.

```
# Projects & contracts
POST   /v1/projects                       create project           {name, route}
GET    /v1/projects
GET    /v1/projects/:pid
POST   /v1/projects/:pid/contracts        add a contract           {contractId}
GET    /v1/projects/:pid/contracts
DELETE /v1/contracts/:cid                 offboard (→ tear down subs)

# Audit (the triggerable engine)
POST   /v1/contracts/:cid/audit           trigger an on-demand audit {tier?} → {sessionId}
GET    /v1/runs/:sessionId                run status + report (run-store, §5)
GET    /v1/runs/:sessionId/report         the rendered report
GET    /v1/contracts/:cid/runs            run history

# KB + MonitoringConfig (edit + approve)
GET    /v1/contracts/:cid/kb              KBRecord
GET    /v1/contracts/:cid/config          derived/current MonitoringConfig (deriveConfig)
PUT    /v1/contracts/:cid/config          edit draft (zod-validated MonitoringConfig)
POST   /v1/contracts/:cid/config/approve  approve → status=approved (audit-logged)

# Monitoring lifecycle (→ per-tenant provisioner)
POST   /v1/contracts/:cid/monitoring/enable   reconcile approved config → live subs
POST   /v1/contracts/:cid/monitoring/disable  offboard subs (provisioner --offboard)
GET    /v1/contracts/:cid/subscriptions       live sub registry + status

# Alerts & adjudication
GET    /v1/alerts                         account alerts feed (filter severity/level/since)
GET    /v1/alerts/:id
POST   /v1/alerts/:id/ack                 human ack (disclosure stays human-gated)
GET    /v1/adjudications/:sessionId

# Spend
GET    /v1/spend                          today's account_budget + ceiling + paused
POST   /v1/spend/clear-pause              human ack to clear a ceiling pause (audit-logged)
PUT    /v1/spend/ceiling                  set daily_ceiling_usd (plan-bounded)

# Webhook ingress (data plane, NOT control plane — separate auth)
POST   /hooks/:accountId/:ruleKey         secondlayer chain webhook (HMAC per-sub)
```

`monitoring/enable` runs the existing `provisioner.ts` reconcile path (now per tenant,
§4); `audit` and `disable` map to the existing dispatch / `--offboard` paths.

---

## 4. MULTI-TENANCY (the moving parts)

1. **Subscription provisioning + secret isolation.** `provisioner.ts` keeps its
   reconcile diff, but: (a) the secondlayer client uses the **tenant's** API
   credentials (per-account `secondlayer_api_key`, encrypted) OR our platform account
   with tenant tags — decision below; (b) `ruleKeyFor` is extended to embed tenant:
   `sentinel:<accountId>:<contractId>:<fn>` so `NAME_PREFIX`/list-filtering scopes to the
   tenant and one account can't see/delete another's subs; (c) `signing_secret` stored
   encrypted in the `subscriptions` table, never a shared file.

2. **Per-tenant spend budgets.** `account_budgets` keyed by `account_id` (was one global
   `spend.json`). `reserve(tier)` becomes `reserve(accountId, tier)` — atomic conditional
   UPDATE on that account's row. Pause is per-account (one tenant's flood can't pause
   another). Plan sets `daily_ceiling_usd`.

3. **Bridge routing webhook → right tenant + config.** Today the URL path = `ruleKey`
   which encodes `contractId`. Extend the path to `/hooks/:accountId/:ruleKey` (provisioner
   already builds `url = BRIDGE_BASE_URL/<ruleKey>` — prepend `accountId`). The bridge:
   resolves `account_id` + per-sub `signing_secret` from the path → verifies HMAC →
   `deriveConfig` scoped to that account's contract → `reserve(accountId, tier)` →
   dispatch to that account's eve route. `dedupKey` and debounce keys gain `account_id`.

4. **eve session auth per tenant.** Two layers: the eve channel JWT (`jwtHmac`,
   `eve-jwt.ts`) authenticates *the bridge/reader to eve* — keep ONE platform
   bridge↔eve secret (it's a system-internal trust boundary, not a tenant boundary).
   Tenant identity rides INSIDE the dispatched session: add `accountId`/`projectId`/
   `contractId` to the session message + the `[SENTINEL-TRIGGER]` directive, and stamp it
   on the `trigger_runs` row at `commitDispatch`. The control-plane API (the tenant-facing
   boundary) is where per-tenant API-key auth lives. So: eve auth = system secret (with
   tenant context in-band); tenant auth = control-plane API keys. Mint short-lived JWTs
   with the `accountId` as `sub` for traceability.

---

## 5. HOSTING / RUNTIME (eve 0.12 on Vercel)

- **Control-plane API** + **webhook bridge**: Vercel Functions (Node ≥ 24). Bridge stays
  OUTSIDE `agent/` (so eve doesn't compile it as a channel) — deploy as a route under
  `/hooks/*`; control plane under `/v1/*`. Both talk to Postgres + mint eve JWTs.
- **Agent**: eve built server (`eve build` → `.output/server`) is the audit runtime;
  schedules (`weekly-sweep`, `monthly-knowledge-refresh`) → **Vercel Cron**; PoC sandbox →
  **Vercel Sandbox** in prod (the `deny-all` docker backend locally). Tier routing keeps
  two deployments (Deep=Opus / Monitor=Sonnet) via `EVE_DEEP/MONITOR_SESSION_URL` until the
  per-delegation model override collapses them (roadmap).
- **Run-store fix (the observability gap).** `run-reader.ts` reads the durable replayable
  stream, but on long runs it returns 0 steps / empty (in-process `events` + `agent/hooks/`
  don't fire in the headless server — memory `eve-headless-run-readout`; and a held
  read can time out / park). Fix: a **durable run-store**. A small worker (or the bridge
  post-dispatch, fire-and-forget) calls `readRun(sessionId)` and **persists folded events
  to `run_events` + status/usage/cost to `trigger_runs`**; a Vercel Cron **reconciler**
  sweeps `status=running` rows past a grace window and re-reads `stream?startIndex=<lastIdx>`
  to append new events incrementally (startIndex makes it resumable — no single long-held
  connection). Adjudication then reads the run-store row, not a live stream. This makes
  reports/usage durable, queryable, and tenant-scoped, and removes the "0 steps on long
  runs" failure. (Upstream ask logged: server-side persist-on-completion would remove the
  poller.)

---

## 6. MVP vs LATER · MIGRATION · OPEN QUESTIONS

### MVP
- Postgres store + repo abstraction; `STORE_BACKEND=fs|pg`.
- Tables: accounts, users, memberships, api_keys, projects, contracts, kb_records,
  monitoring_configs, subscriptions, trigger_runs, run_events, adjudications, alerts,
  account_budgets, audit_logs, dedup_keys.
- Thread `account_id` through sub-store / spend-ceiling / trigger-state / notify; tenant
  in `ruleKey` + webhook path; atomic `reserve`.
- Control-plane API (projects/contracts/config approve/monitoring toggle/alerts/spend).
- Durable run-store poller + Cron reconciler.
- Single platform secondlayer account (tenant-tagged subs) + ONE bridge↔eve secret.

### Later
- Per-tenant secondlayer credentials/billing passthrough.
- f043 watchlist provisioning (collapse N subs/tenant → 1) when N-sub pain bites at
  multi-client scale.
- KV companion for hot dedup if Postgres write volume warrants.
- TVL/stakes tier router (asset-holdings subgraph + USD feed) replacing class-based tiers.
- Collapse two eve deployments → one via per-delegation model override.
- RBAC beyond owner/admin/viewer; SSO; usage-based billing meter off `token_cost_usd`.

### Migration from single-tenant files
1. Create a bootstrap `account` + `project`; assign the existing contracts to it.
2. Import `sentinel/kb/*.json` → `kb_records`; `deriveConfig` → seed `monitoring_configs`
   (status=approved, since they're already live).
3. Import `.sentinel/subscriptions.json` → `subscriptions` (encrypt secrets); reconcile
   `ruleKey` → tenant-scoped key (rename live subs or rotate-secret + recreate).
4. Import `.sentinel/{spend,triggers,notifications}.json` → respective tables under the
   bootstrap account.
5. Cut `STORE_BACKEND=pg`; keep `fs` for local dev + tests (tests already mktemp the dir).
6. Repoint provisioner/bridge URLs to `/hooks/:accountId/:ruleKey`; re-run reconcile.

### Open questions
1. **secondlayer tenancy model** — one platform account with tenant-tagged subs (simpler,
   we hold all secrets/billing) vs per-tenant API keys (clean isolation, tenant-billed,
   but key management + onboarding friction). Affects provisioner client construction +
   subscription scoping.
2. **eve multi-tenancy granularity** — is one shared pair of eve deployments (tenant
   context in-band on the session) acceptable, or does isolation/SLA demand per-account
   eve instances or queues? Drives the §4.4 auth model + Vercel concurrency/duration
   ceilings for concurrent ~$2 Deep sweeps across tenants.
3. **Run-store ownership** — should eve persist-on-completion upstream (removes our
   poller) or do we own the Cron reconciler indefinitely? (Logged as eve feedback;
   blocks how much of §5 we build vs wait for.)
