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

## M0 — Unblock + de-risk the unknowns (S–M) — **DONE (2026-06-27)**
**Goal:** remove the hard preconditions + retire the riskiest unbuilt mechanism before
building on top of it.
**Work + outcome:**
- **Durable-sink spike (premise was wrong, not risky):** the doc premise "eve SSE degrades
  to 0 bytes / doesn't replay a finished session" was a `timeout`-command misdiagnosis (see
  memory `eve-run-observability`). The event stream is **durable + replayable**:
  `GET …/stream?startIndex=0` re-serves a finished run's full report (`message.completed`) +
  usage (`step.completed`) from storage any time. Mechanism = a thin reader,
  **`monitoring/run-reader.ts`** (`readRun(sessionId)`). Proven fire-and-forget round-trip
  (report + token usage + Opus-4.8 `costUsd`). Opus ran with no 403 on existing credits
  (~$0.06/trivial run) — items 1–2 don't need the top-up.
- **eve session auth:** `agent/channels/eve.ts` `none()` → **`jwtHmac`** (HS256), fail-closed
  (anon only via explicit `EVE_ALLOW_ANON=1`). Bridge + reader mint short-lived tokens
  (**`monitoring/eve-jwt.ts`**). Proven: no/bad/wrong/expired token → 401 on POST *and* GET
  stream; valid → 202; reader auto-mints.
- **Global daily spend ceiling:** **`monitoring/spend-ceiling.ts`** — `reserve(tier)` at
  DISPATCH (cap before spend) against a daily budget using per-tier estimates ($1.11 Monitor /
  $2 Deep); on breach → pause (persists across day rollover until human `clear`) + page (loud
  log + `PAUSED` marker + optional `SENTINEL_PAGER_URL`). Wired into the bridge (breach → 429,
  no dispatch). Proven: allow→allow→breach-pages→deny, integrated through the bridge.
**Exit:** ✅ all met. (Paid AI-Gateway top-up still pending for a full ~$2 Deep sweep — human step.)
**Deps:** none.
**eve feedback (new):** channel `events` handlers AND `agent/hooks/` (`defineHook`) do **not**
fire in the headless built server (`node .output/server`) for the agent turn — both
discovered+compiled yet silent, with/without a stream consumer (re-validated against a
verified-binding server). Eager server-side persist-on-completion is unavailable there; read
the replayable stream instead. Likely the emit composer only runs under `eve dev`/TUI — worth
confirming upstream. See memory `eve-headless-run-readout`.

## M1 — Static foundation, no chain dependency (M) — **DONE (2026-06-27)**
**Goal:** the judgment artifacts that everything downstream reads, buildable offline.
**Work + outcome:**
- **MonitoringConfig** schema (zod-v4, **`monitoring/config.ts`**) + **KB store**
  (**`monitoring/kb.ts`**, git-checked JSON under `sentinel/kb/`), seeded from both reports
  (**`sentinel/kb/*.json`**). `deriveConfig(contractId)` maps KB → config (sensitive fns,
  allowlists, thresholds, archetype→tier via `tierForArchetype`, closure, route). Proven:
  CCD002 treasury → `deep`, DLMM → `monitor`; unknown id throws.
- **Static call-graph closure** (**`monitoring/closure.ts`**): `resolveClosure(rootId, fetchSource)`
  walks `(contract-call? …)` + `use-trait`/`impl-trait` + literal principals + `.name` local
  sugar, depth-bounded, comment-stripped. Proven on a synthetic **proposal-by-indirection** case
  (root + separate M-impl + transitive leaf + local helper captured; commented/trait-only refs
  excluded).
- **`fetch_contract_source`** repointed: silent Hiro default removed (requires `STACKS_NODE_URL` →
  secondlayer node, hard rule); added `closure=true` to fetch target + reachable closure.
**Exit:** ✅ `deriveConfig` valid from seed; closure returns proposal + reachable incl. indirection.
**Deps:** none (chain reads read-only).
**secondlayer feedback (open):** the live closure fetch needs `STACKS_NODE_URL` pointed at the
secondlayer node serving the standard `/v2/contracts/source` RPC — **confirm secondlayer exposes
it (or an equivalent source-by-`contractId` endpoint) with the API key**; if the Index source
surface has gaps for closure-walking, log against the source-read surface. Resolver itself is
chain-agnostic (injected fetcher), so only the wiring is gated on this.

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
