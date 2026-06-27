# Sentinel Monitoring Layer — Build Plan

> Executable, sequenced plan derived from the scope in [monitoring-build.md](./monitoring-build.md).
> Risk-first ordering. Each milestone: Goal · Work · Exit criteria · Deps · **secondlayer
> feedback** (what building it reveals/adjusts on the f043/f044 side — the dogfood loop).
> Effort sizing S/M/L (relative, not calendar). Build Sentinel first; f043/f044 land on
> secondlayer's own cadence as the milestones below surface their real shape.

## Ordering principle
Attack the **uncertain, blocking** work first (M0), then the **chain-independent**
foundation (M1), then outward toward the chain (M2→M5). Nothing here depends on
f043/f044 — the MVP rides today's secondlayer (positive-match subscriptions +
client-side filtering).

---

## M0 — Unblock + de-risk the unknowns (S–M)
**Goal:** remove the hard preconditions + retire the riskiest unbuilt mechanism before
building on top of it.
**Work:**
- Add paid AI-Gateway credits; wire a **global daily spend ceiling** (pause + page on
  breach) — ship together so the path is never exposed uncapped.
- **Durable-sink spike (riskiest):** decide + prove how a finished eve run's report +
  usage are read WITHOUT SSE (write file/stdout on `turn.completed` vs read `wrun_*`
  storage). Pick one, prove it round-trips.
- eve session auth: `agent/channels/eve.ts` `none()` → authed (jwtHmac) or
  network-restricted to the bridge.
**Exit:** an Opus sweep runs (no 403); its final report + token usage are reliably
retrievable by an external reader with zero SSE scraping; an unauthenticated session POST
is rejected; a synthetic spend-ceiling breach pauses + pages.
**Deps:** none.
**secondlayer feedback:** none (all Sentinel-internal).

## M1 — Static foundation, no chain dependency (M)
**Goal:** the judgment artifacts that everything downstream reads, buildable offline.
**Work:**
- **MonitoringConfig** schema (zod-v4) + **KB/context store** (JSON dir keyed by
  `contractId`), both seeded from `reports/ccd002-…` + `reports/dlmm-…`.
- `deriveConfig(contractId)` helper (KB → config: sensitive fns, allowlists, thresholds,
  class→tier, route).
- `fetch_contract_source` → repoint at the secondlayer Index node (drop Hiro fallback —
  hard rule); add **static call-graph dependency-closure** resolution (a target + every
  `(contract-call? …)` it reaches).
**Exit:** `deriveConfig` emits a valid config from a seeded report; closure fetch on a
known proposal returns the proposal + its reachable contracts (incl. an indirection M).
**Deps:** none (chain reads are read-only, no new infra).
**secondlayer feedback:** confirms the **published source-read surface** is sufficient to
fetch source by `contractId` (it is today via Hiro/Index); if the Index source endpoint
has gaps for closure-walking, note it — but no f043/f044 change expected.

## M2 — Provisioning: config → live subscription (M)
**Goal:** one real secondlayer subscription, reconciled from config, delivering to the bridge.
**Work:**
- Provisioner reconciler: deterministic `ruleKey` in subscription `name`; diff desired vs
  live (`GET /api/subscriptions`) → POST/PATCH/DELETE. MVP target: `contract_call(<DAO>,
  "propose")`.
- Durable external KV for sub IDs + signing secrets + `ruleKey→config`.
- **Offboarding** path (config removal → DELETE sub + rotate secret + purge KV).
- `POST /:id/test` smoke-verifies wiring end-to-end.
**Exit:** a config entry creates/reconciles a real subscription; `/test` delivers a signed
webhook to the bridge URL; removing the entry tears it down cleanly; re-running is idempotent.
**Deps:** M0 (durable-state decision overlaps the KV).
**secondlayer feedback (key):** hand-building N-subscription reconciliation is the usage
that defines **f043 watchlist provisioning** — it reveals the exact collapse (N creates →
1) + any **subscription-CRUD gaps** (does PATCH/`/test`/`/rotate-secret` exist as assumed?
is `name` a safe place for `ruleKey`?). Log gaps against f043; adjust that plan.

## M3 — The audit-on-trigger bridge (L — the core)
**Goal:** webhook → filtered, budgeted, tiered audit on the right targets → report in the sink.
**Work:** harden `webhooks/secondlayer-webhook.ts`:
- HMAC verify (`verifyWebhookSignature`, 401 on fail).
- Consumer **pre-filter** (caller∈allowlist? outflow<threshold? topic? → benign = log+204,
  **no spend**).
- class→tier routing; **`audit_targets[]` = decoded target + static call-graph closure**
  (M1); budget gate + per-(contract,fn) debounce + dedup on `(tx_id,eventIndex)`;
  `deadline_block` watchdog.
- Emit the structured `[SENTINEL-TRIGGER]` directive; **two-deployment tier routing**
  (Monitor=Sonnet / Deep=Opus, pick `EVE_SESSION_URL` by class).
- Extend `agent/instructions.md`: parse the directive, multi-target + closure fetch (full
  source inlined), deadline-aware verdict-before-PoC, write report to the **durable sink**
  on `turn.completed`.
**Exit:** a signed `propose` webhook → bridge pre-filters → resolves the proposal closure →
budget-gates → fires a **Deep** audit → report lands in the sink within the latency budget.
**Deps:** M0 (sink + auth), M1 (closure fetch + config), M2 (subscription delivers the webhook).
**secondlayer feedback (key):** the **client-side caller-allowlist pre-filter is exactly
f044's job** — building it pins down the precise semantics f044 should implement
server-side (wildcard set entries? `recipient` too? composition with `minAmount`?), AND
measures the **webhook volume** that justifies pushing it down. If volume is trivial
(pre-launch, few clients), f044 stays deferred — confirmed by real numbers, not a guess.

## M4 — Adjudication + alert: close the loop (M)
**Goal:** turn a sink report into a routed, human-gated alert.
**Work:** read sink → `Adjudication{severity, class, confidence, verifierVerdict,
pocStatus, recommendedAction, tokenCostUsd}` → one notify channel. **provisional-critical**
(PoC-pending → WARN now, auto-promote on green PoC) state; **centralization-waiver
suppression** (warn once); disclosure **human-gated**.
**Exit:** a Deep verdict → adjudicated → WARN delivered with severity/class/PoC-status; an
accepted-waiver finding does not re-page; nothing auto-discloses.
**Deps:** M3.
**secondlayer feedback:** none (pure judgment, UP).

## M5 — The prevention demo (S — proof)
**Goal:** the killer artifact, end-to-end.
**Work:** deploy a test DAO + submit a known-bad proposal **including an
indirection-via-separate-M variant** → run the full chain.
**Exit:** **Deep-tier WARN lands inside the timelock, before `execute-proposal` is
callable**, with the `deadline_block` watchdog proving the time-guarantee (not one lucky
latency fit). Capture as the demo/marketing artifact.
**Deps:** M0–M4.
**secondlayer feedback (key):** the live run confirms whether **confirmed-block latency
(5–40s) suffices for the timelock window** (hours–days → yes) → validates that
**f043 mempool-push (Item A) is genuinely deferrable**. Only an instant/no-timelock attack
class would pull mempool-push forward — log if M5 surfaces one.

---

## Beyond MVP (sequence to full — only as pulled)
waiver suppression (in M4) → **f044** negative-caller filter (when M3 volume justifies +
its semantics are pinned) → **f043 mempool-push glue** (when an instant-attack class
appears) → asset-holdings subgraph + USD price feed → **TVL/stakes tier router** (replaces
class-based) → eve per-delegation model override (collapse two deployments → one) →
timelock SLA timer → **f043 watchlist provisioning** (when N-sub reconciliation gets
unwieldy, i.e. multiple clients) → incident-corpus auto-refresh.

## Secondlayer-feedback log (the dogfood loop — fill as we build)
The whole point: build Sentinel, let it drive f043/f044 adjustments. Capture findings here.
| Milestone | What it tests on the secondlayer side | Expected adjustment |
|---|---|---|
| M2 | Subscription CRUD completeness; `ruleKey`-in-`name`; N-sub reconciliation pain | f043 watchlist scope + any CRUD/`/test`/`/rotate-secret` gaps |
| M3 | Caller-allowlist filter semantics + real webhook volume | f044 exact filter shape; whether/when it's worth shipping |
| M5 | Confirmed-block latency vs timelock window; any instant-attack class | f043 mempool-push priority (defer vs pull forward) |

## Open decisions (carried from scope §6)
Class-based tiering OK until subgraph/price-feed? · who issues/rotates the bridge↔eve
secret? · KV choice for durable state · baseline-audit prerequisite acceptable (degrade
un-baselined to absolute-outflow watch)? · absolute-only thresholds enough for first clients?
