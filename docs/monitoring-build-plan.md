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
**secondlayer feedback (RESOLVED + new primitive idea):** contract source is a node RPC read, not
an Index/subgraph surface (`api.secondlayer.tools` 404s `/v2/contracts/source`). Our hosted
stacks-node serves it: `STACKS_NODE_URL=http://37.27.171.220:20443`. Proven live — closure on the
CCD002 treasury returns the real 8-contract graph (base-dao + 6 traits), a superset of the
hand-seeded KB closure. **Idea logged:** a hosted, TLS'd, **cached `source`/`ABI`-by-`contractId`
endpoint on the Index** is a clean generic DOWN primitive — fixes the raw-IP/no-TLS access and
serves any consumer. Source is immutable, so it's a read-through cache (not a subgraph). UP side:
eager KB derivation (ABI + sensitive-fn AST + closure) at client onboarding. See feedback log.

## M2 — Provisioning: config → live subscription (M) — **DONE (2026-06-29)**
**Goal:** one real secondlayer subscription, reconciled from config, delivering to the bridge.
**Outcome (proven live, then torn down):** `monitoring/provisioner.ts` reconciles
`deriveConfig` sensitive fns → secondlayer **chain** `contract_call` subs (one per fn, `ruleKey`
=`sentinel:<contractId>:<fn>` as the sub `name` AND webhook URL path); dry-run is the default,
`--apply`/`--only`/`--offboard`/`--test`. `monitoring/sub-store.ts` = durable KV
(`.sentinel/subscriptions.json`, ruleKey→{subId, signingSecret}). Bridge fixed: real envelope
(`action`/`event.*`), `rollback`→204 no-dispatch, `webhook-id` dedup, per-ruleKey secret lookup.
Proven on the real account: create `ccd002-treasury…:execute` → idempotent re-run (no-op) →
`test(id)` delivered a signed webhook through an ngrok tunnel, bridge verified+parsed → **200**;
bad-sig → **401**; `--offboard --apply` deleted it (account back to 0 sentinel subs, KV empty).
**Exit:** ✅ all met.
**NEW secondlayer-feedback (SDK shape drift):** the published `CreateSubscriptionRequest` has **NO
`kind` field** — chain vs subgraph is inferred from `triggers` vs `subgraphName`. Earlier
notes/memory said `kind:"chain"`; that field doesn't exist in `@secondlayer/sdk@6.25.1` (would be an
excess property). Chain mode = pass `triggers`, omit `subgraphName`. `test(id)` payload is generic
(`{test:true, message, subscription_id, sent_at}`, `event_type:"chain.test.apply"`) — NO
`event.contract_id`/`action`, so a correct bridge accepts it as a no-op 200 without firing an audit.
**N-sub pain (f043 dogfood):** one `deriveConfig` (CCD002 treasury) = 4 fns = 4 separate
`create` round-trips today; a watchlist primitive (N→1) would collapse these.

### M2 superseded surface notes (kept for context)
**Surface (re-investigated 2026-06-29 — supersedes the earlier subgraph-table plan):** the
published `@secondlayer/sdk@6.25.1` has CHAIN subscriptions (`SubscriptionKind = "subgraph" |
"chain"`). A **chain** subscription fires on raw decoded chain events with **NO subgraph deployed**:
`client.subscriptions.create({ name, url, kind:"chain", triggers:[trigger.contractCall({contractId,
functionName})], format:"standard-webhooks" })`. Full CRUD on the SDK client: `list/get/create/
update/pause/resume/delete/rotateSecret/test/recentDeliveries/replay/dead`. (Installed `sl` 8.12.0
LACKS chain-sub create; repo HEAD 8.13.0 unpublished — so use the **published SDK**, not the CLI.)
**Decided approach (chain subscription, no subgraph):** for each sensitive fn in `deriveConfig`,
one chain `contract_call` trigger (`contractId` + `functionName`) → bridge. The "shared
sentinel-calls subgraph" plan is **obsolete** — skip it.
**Work (next session):**
- `monitoring/provisioner.ts`: construct the SDK client (`SECONDLAYER_API_URL` + `_API_KEY`); diff
  desired (from `deriveConfig` sensitive fns, keyed by a deterministic `ruleKey` in the sub `name`)
  vs `subscriptions.list()` → create/update/delete. MVP: `contract_call(<DAO>,"propose")`.
- Durable KV for sub IDs + signing secrets + `ruleKey→config` (reuse the `.sentinel/` seam).
- **Offboarding** (config removal → `delete` + `rotateSecret` + purge KV); `subscriptions.test(id)` smoke.
- **Fix the bridge envelope** (M2/M3): real shape is `{action, trigger, event:{contract_id,
  function_name, function_args, sender,…}}` — current `ChainEvent` reads top-level fields (wrong);
  handle `action:"rollback"`; dedup on the `webhook-id` header.
- ⚠️ Creates REAL billable infra on the account — confirm before side-effecting calls; clean up test subs.
**Exit:** a config entry creates/reconciles a real chain subscription; `test(id)` delivers a signed
webhook the bridge verifies + parses; removing the entry tears it down; re-running is idempotent.
**Deps:** M0 (durable-state seam), M1 (`deriveConfig` sensitive fns).
**secondlayer feedback (banked, re-confirmed):** chain `contract_call` subs SHIPPED (server 06-04,
CLI 06-29). Filters **positive/wildcard only** — caller set-membership/negation (**f044**) is
PLANNED-not-shipped (`plans/feat-f044-…`), so the caller-allowlist pre-filter stays client-side
(caller = tx `sender`; immediate-caller is a node-receipt limit). **f043** watchlist (N creates → 1)
PLANNED-not-shipped (`plans/feat-f043-…`); our reconciler is its dogfood. Contract **ABI** is on the
prod Index (`client.contracts.get(id,{include:"abi"})`); **SOURCE** is NOT (deferred "on named pull"
— Sentinel is that pull) → node RPC stays for the closure walk.

## M3 — The audit-on-trigger bridge (L — the core) — **DONE (2026-06-29); live Opus run gated on credits**
**Outcome (bridge path proven end-to-end, no Opus spend):** built in two commits — M3a (bridge:
`monitoring/prefilter.ts` + `directive.ts` + `trigger-state.ts` + `contract-source.ts` + the rewired
`webhooks/secondlayer-webhook.ts`, 20 unit tests) and M3b (`agent/instructions.md` directive mode).
Verified with a mock-eve smoke driving the REAL bridge: a governance `execute` →
decoded the proposal principal from `function_args` → live node-walked its closure →
`audit_targets[]` = proposal-first + live closure ∪ watched + KB closure (6, deduped) → `deep` tier →
spend reserved → session captured → trigger→session ledger written → 202. **Per-class pre-filter
decided** (a single caller-allowlist rule fails: `execute` is always called by base-dao, so
"caller∈allowlist⇒drop" would drop every proposal): governance.*=always-notable (caller outside
allowlist ⇒ `suspicious`); transfer.outflow=benign below threshold (fail-safe audit if undecodable/
no threshold); counterparty.new=benign if caller known. Governance is **debounce-exempt** (every
distinct proposal audited; dedup blocks exact refire). Tier = stricter of class-tier and contract
archetype-tier. **Remaining for full exit = the actual Deep Opus run completing + report read via
`readRun(sessionId)`** — billable + needs the AI-Gateway top-up (free tier 403s Opus); this is the
M5 prevention-demo run. The sink IS the replayable stream (M0), so M4 reads the report by the
captured session id.
**Exit:** ✅ bridge path (verify→dedup→pre-filter→targets→budget→tier-route→dispatch→ledger);
⏳ live Deep report (M5, credit-gated).
**secondlayer feedback (NEW, key):** the per-class pre-filter PROVES f044's caller filter can't be a
flat set-membership rule — for governance the allowlist is provenance (out-of-set ⇒ escalate), not a
drop; the drop-signal is class-specific (threshold for transfers, known-set for counterparties). So
f044 should be **class-aware or stay a Sentinel-side concern**; a generic `callerNotIn` only helps
the transfer/counterparty classes. **Webhook volume not yet measured** (no live flood) — the "is it
worth pushing the filter server-side" call still needs real numbers (M5/first client).

### M3 original spec (for reference)
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

## M4 — Adjudication + alert: close the loop (M) — **DONE (2026-06-29)**
**Outcome:** `monitoring/adjudication.ts` + `notify.ts` + `adjudicate-run.ts` (10 unit tests,
35 total green). The agent now ends a monitoring report with a machine-readable
`[SENTINEL-FINDINGS]{…}` block (`agent/instructions.md`); adjudication parses it
DETERMINISTICALLY (no extra model call, no spend) → drops refuted, suppresses accepted
centralization waivers (matched against the contract's KB waivers), flags provisional-critical
(confirmed high/crit + pending PoC), rolls up overall severity/class/alertLevel/recommendedAction +
the real `tokenCostUsd`. `notify.ts` routes ONE internal alert, warn-once (no re-page), with a
provisional→green auto-promotion; **disclosure stays human-gated — never auto-discloses**.
`adjudicate-run.ts` is the entrypoint: `readRun(sessionId)` + trigger ledger + KB waivers →
adjudicate → notify → `reconcile(estimate, actual)` spend true-up (`--report-file` for offline).
Proven via the CLI on a synthetic Deep report: confirmed-critical kept → WARN; refuted dropped;
cost reconciled; and unit-tested waiver-suppression-no-re-page + promotion + no-auto-disclose.
**Exit:** ✅ a Deep verdict → adjudicated → WARN with severity/class/PoC-status; accepted waiver
does not re-page; nothing auto-discloses. (Live end-to-end with a real Opus run = M5, credit-gated.)
**Deps:** M3. **secondlayer feedback:** none (pure judgment, UP).

### M4 original spec (for reference)
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
| M1 | Source-read surface for closure-walking (RESOLVED: node RPC `:20443`) | **New DOWN primitive:** hosted, TLS'd, cached `source`/`ABI`-by-`contractId` endpoint on the Index (read-through cache, not a subgraph) — fixes raw-IP access, generic to any consumer |
| M2 | Subscription CRUD completeness; `ruleKey`-in-`name`; N-sub reconciliation pain | f043 watchlist scope + any CRUD/`/test`/`/rotate-secret` gaps |
| M3 | Caller-allowlist filter semantics + real webhook volume | f044 exact filter shape; whether/when it's worth shipping |
| M5 | Confirmed-block latency vs timelock window; any instant-attack class | f043 mempool-push priority (defer vs pull forward) |

## Open decisions (carried from scope §6)
Class-based tiering OK until subgraph/price-feed? · who issues/rotates the bridge↔eve
secret? · KV choice for durable state · baseline-audit prerequisite acceptable (degrade
un-baselined to absolute-outflow watch)? · absolute-only thresholds enough for first clients?
