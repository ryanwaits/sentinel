# Sentinel Monitoring Layer — Scoping Doc

> Source: `scope-sentinel-monitoring` workflow (2026-06-27, 9 agents) — understand →
> design → synthesize → adversarial critic → finalize. Companion to the product concept
> in [monitoring.md](./monitoring.md). The two-tone primitive split (§3) is the answer to
> "what to build DOWN in secondlayer vs UP in Sentinel."

## 1. Goal + one-product framing

Sentinel = **audit-informed, context-aware, Stacks-native security monitoring**. Not a
separate audit tool + separate monitor — one product where **audit is a triggerable
capability**. A chain event fires a tiered multi-agent audit on the *relevant* contract →
adjudicate → alert. The wedge is **prevention**: audit a malicious governance proposal
*during its on-chain timelock, before `execute-proposal` is callable*, instead of
post-morteming the drain.

Load-bearing boundary: generic detection **primitives push DOWN** into secondlayer
(reusable by any vendor); opinionated security **judgment stays UP** in Sentinel. Sentinel
depends ONLY on published `@secondlayer/*` + the public REST surface — never
internal/workspace. **secondlayer subscriptions + mempool pull + event decoding + HMAC
outbox already cover nearly everything**; the honest new-primitive ask is **one** clean
filter operator, plus glue that belongs *inside* feat-f043 (see §3). Do not re-scope what
already ships.

## 2. Architecture — Sentinel monitoring-layer components

```
 reports/ + KB ──(5) feedback──┐
        ▼                       │
 (1) MonitoringConfig ◄─────────┘
        │ watchlist + sensitive fns + thresholds + tier + routing
        ▼
 (2) Provisioner ──POST /api/subscriptions──► secondlayer ──webhook(HMAC)──►
        └─ sub IDs/secrets (durable external KV) ──► (3) Audit-on-trigger bridge
                                   │ HMAC verify → consumer pre-filter → class→tier
                                   │ → resolve audit_target + static call-graph closure
                                   │ → budget gate → POST /eve/v1/session (authed)
                                   ▼
                              eve run (Deep=Opus×8 / Monitor=Sonnet×8, +Opus verifier) → durable sink
                                   ▼
                              (4) Adjudication + routing → notify/escalate (human-gated)
                                   └──► (5) incident feeds config + KB
```

**(1) MonitoringConfig** — turn client contracts + audit KB into declarative config:
which contracts, which fns privileged, outflow thresholds (**absolute** ft/stx — relative-%
is stateful, §3), per-fn authorized-caller allowlist, stakes tier, escalation route. Pure
judgment. zod-v4. *MVP:* one git-checked `sentinel/config/<client>.json` seeded from
`reports/*`. *Full:* config store/API; auto-derive privileged fns from audit AST/KB.

**(2) Provisioner** — idempotent reconciler keyed by deterministic `ruleKey`
(`<client>:<contractId>:<triggerClass>:<fn|asset>` in subscription `name`); diff desired vs
live (`GET /api/subscriptions`) → POST/PATCH/DELETE. **Honest split:** secondlayer matches
the call/transfer + wildcard fn + min/maxAmount; never **args** (Sentinel decodes
client-side) nor the **caller-allowlist** (judgment) → those need a consumer-side check in
(3). Absolute-amount outflow is depth-independent → works **today**. **State:** sub IDs +
signing secrets + ruleKey→config need **durable external KV/Postgres** (Vercel FS is
ephemeral); reconciler owns **offboarding** (DELETE sub + rotate secret + purge). *MVP:* one
sub per `(contract,triggerClass,fn|asset)`; `POST /:id/test` smoke-verifies. *Full:* drift
reconcile; migrate to feat-f043 watchlist provisioning when published (N creates → 1).

**(3) Audit-on-trigger bridge — the orchestrator.** Webhook → `verifyWebhookSignature`
(401) → resolve ruleKey → consumer pre-filter (caller∈allowlist? outflow<threshold? topic? →
benign = log+204, **no spend**) → class→tier → resolve **audit_target + static call-graph
closure** (the proposal/impl/counterparty + every `contract-call?` target it reaches, NOT
the watched contract) → budget gate → structured directive → **authenticated** `POST
/eve/v1/session`. Extends `webhooks/secondlayer-webhook.ts` (today blindly forwards NL +
runs an undifferentiated sweep).
- **Auth (MVP-blocking):** `agent/channels/eve.ts` is `none()`. A public webhook + per-trigger
  spend turns an open session endpoint into a **budget-drain weapon** (inject arbitrary
  `[SENTINEL-TRIGGER]` → force sweeps). Authed/network-restricted **before** the webhook is
  public, paired with a global budget ceiling. Cost-safety control, not just hardening.
- **Tier = trigger-class policy in MVP** (governance/proxy-upgrade → Deep; counterparty/
  transfer → Monitor), NOT TVL-driven — the stakes→tier router is **non-functional until the
  asset-holdings subgraph + USD price feed ship** (`agent/pricing.ts` prices only STX/sBTC).

**(4) Adjudication + routing — the Monitor gate (missing today).** Read durable result (not
SSE) → `Adjudication{severity, class∈{real-bug,centralization,noise}, confidence,
verifierVerdict, pocStatus, recommendedAction, tokenCostUsd}`. Route: `≥floor && ≠noise` →
notify; `high/critical`+green PoC → escalate + human-gated disclosure ticket; **`high/critical`
+ PoC pending → `provisional-critical`**: ship WARN now, hold ticket as PoC-pending,
auto-promote when green PoC lands. **Final escalation still requires a green simnet PoC**
(credibility engine). Suppress accepted **centralization waivers** (warn once, don't re-page).

**(5) KB / context store — the audit↔config↔incident loop.** Persists audit outputs keyed by
`contractId` (AuditRecord, SensitiveFnSet, CallerAllowlist, CentralizationWaiver,
IncidentRecord) **plus stateful baselines absolute filters can't express** (windowed
outflow-rate / total-assets-% baselines). Audit → emits SensitiveFnSet/CallerAllowlist →
regenerates config; adjudication → waivers; incident → sharpens similar protocols + feeds
`agent/knowledge`. *MVP:* JSON dir from the two `reports/*.md`.

## 3. The two-tone primitive split

### 3a. Sentinel builds (judgment / product — UP)
Watchlist + policy table (which fns privileged, what tier — opinionated); subscription
provisioner + durable keystore + offboarding (orchestration of a generic API); bridge
pre-filter + tier + target-and-call-graph resolve (arg/allowlist match secondlayer can't
express); **relative-%/windowed outflow baseline** (stateful = Sentinel KB); **code-hash of
deployed contract** (hash client-side from existing source-read — stays UP); auditor/verifier
roster + PoC (the engine *is* the product); adjudication + routing + sink + cost meter (the
Monitor gate).

### 3b. secondlayer primitives to scope (DOWN — generic, dogfood-driven)
**Honest answer: one clean new primitive + one glue extension of feat-f043.** Subscriptions
+ mempool pull + event decoding + HMAC outbox (dedup, backoff, circuit breaker) already
cover every confirmed-block trigger. **Already shipping/scoped — do NOT re-propose:** durable
outbox + dedup; `contract_deploy`/upgrade detection (a trigger *type*, config not primitive);
per-`(contract_id,function_name)` mempool **pull** filter (feat-f043 item 2).

| Item | What | Down-vs-up | Effort | Two-sided win |
|---|---|---|---|---|
| **B. Negative / set-membership filter on `caller` (& `recipient`)** | `callerNotIn[]` / `In[]` on `contract_call` + transfer triggers. Today the matcher is positive wildcard-suffix only. Distinct from f043 (a *provisioning* abstraction, not a filter op). | The negation/set-match **operator** is a generic filter primitive (DOWN); the allowlist *contents* are consumer config like `minAmount` (UP). | SMALL–MED | **The one genuinely-new generic win.** "Fire only when `caller NOT IN {known good}`" is the canonical access-control/anomaly filter — useful to any compliance/treasury/AML consumer. Without it, a sub on a busy privileged fn fires on every legit call (~99% client-side drop = wasted webhook volume). **Optimization, not a capability gate** (bridge does the allowlist client-side regardless). → secondlayer `feat-f044`. |
| **A. Mempool PUSH — glue extension of feat-f043 (not standalone)** | Webhook on a *pending* tx matching f043's per-fn mempool filter, before it mines. New surface = the glue: mempool-sourced outbox + drop/apply follow-up semantics. | The defensive *window* is generic (DOWN); *what to do* in it stays UP. | SMALL (glue) — reuses existing emitter + f043 filter. | **Belongs as an f043 sub-item.** Honesty caveat: single-node mempool = **best-effort / at-most-once / silently lossy** — a pre-confirmation WARN can miss, so it MUST be paired with the confirmed-block trigger as backstop. |

**Dropped/NOT proposed:** code-hash endpoint (→ UP, hash client-side); inner-call /
immediate-caller / call-tree attribution (**upstream Stacks-node receipt limit**, not
buildable in secondlayer); windowed/relative outflow (stateful judgment, UP); function-arg
matching (Sentinel decodes client-side). **Do not re-implement what secondlayer ships.**

## 4. Audit-on-trigger — the killer feature

Three flows:
- **(a) Governance proposal — PRE-EXECUTION during timelock (the prevention play).** Proposal
  *is* a deployed contract. Signals: `contract_deploy(proposal-*)` + `contract_call(DAO,
  "propose")`. Resolve proposal principal from `function_args`, compute `deadline_block`,
  `tier=deep`, audit the proposal's `execute` body **+ its static call-graph closure**.
  **Proposal-by-indirection (real hole):** a hostile proposal usually acts via
  `(contract-call? M ...)` to a separate deployed M — a single target misses it. Directive
  carries **`audit_targets[]` = proposal + every contract its static call graph reaches**.
  Ships a **WARN before `execute-proposal` is callable** → defeats Beanstalk/Charisma class.
- **(b) Upgrade/impl-swap → auto-audit new code.** `set-implementation` / `set-core-migration-
  target` (DLMM #6). **Code-hash cache:** if the new impl's hash was already audited → cached
  verdict, skip the sweep (biggest cost lever).
- **(c) New counterparty → audit it.** `contract_call(protected, privilegedFn, caller∉allowlist)`
  → audit the counterparty + closure (ALEX self-listing / Charisma ninja-contract class).

**Latency vs window:** block→webhook 5–40s; eve sweep ~2–5 min; +PoC +1–3 min. **WARN ~3–6
min; PoC-backed escalation ~5–9 min.** Governance timelocks are blocks (hours–days) → even a
144-block (~1 day) timelock leaves >99% margin. **Rule: ship WARN at verdict; land green PoC
as confirmatory follow-up** (provisional-critical).

**Cost (per tier):** Monitor = Sonnet×8 (~$0.20) + Opus verifier (~$0.91) = **~$1.11**; Deep =
Opus×8 + verifier = **~$2** (proven Zest figure). Governance/high-TVL upgrades run Deep.
Controls: code-hash cache, per-(contract,fn) debounce, per-contract daily cap, **global daily
ceiling shipped WITH the webhook**.

**Interface to eve:** session API accepts `{message}`. Bridge embeds a structured directive
the orchestrator parses (it does NOT today):
```
[SENTINEL-TRIGGER]
trigger_class: governance.proposal_submitted
tier: deep
audit_targets:                 # closure, NOT a single body
  - SP2...proposal-042         # resolved from args
  - SP3...M-impl               # reached via (contract-call? M ...)
context_contract: SP1A27...dao
deadline_block: 12489          # verdict MUST land before this
escalation: warn-before-execute
[/SENTINEL-TRIGGER]
```

**Tiering mechanism (pulled into MVP):** `AUDITOR_MODEL` is process-wide → ship **two
deployments** now (Monitor=Sonnet, Deep=Opus); bridge picks `EVE_SESSION_URL` by class. (A
fixed-Monitor MVP can't run the Deep-tier prevention demo.) Target: per-delegation model
override once eve supports it → one deployment.

**Durable sink (sequence FIRST):** SSE doesn't replay finished sessions + degrades to 0 bytes;
mechanism undecided (write file/stdout vs read `wrun_*` storage). Riskiest unbuilt read-path
piece — spike + decide before anything downstream.

## 5. MVP — thinnest end-to-end slice (the prevention demo)

0. **Paid AI-Gateway credits + global budget ceiling.** Opus 4.8 free-tier 403s; hard
   precondition. Wire the global daily spend ceiling (pause+page) in the same step so the
   public path is never exposed uncapped.
1. **Spike the durable sink** — pick + prove the mechanism. Everything downstream reads it.
2. Wire `fetch_contract_source` to the secondlayer Index node (drop Hiro); add **dependency-
   closure** fetch over a target's static call graph.
3. **(1)+(5) MVP** — config schema (zod-v4) + seed KB from `reports/` (no chain dep).
4. **(2) MVP** — reconciler creates ONE real sub: `contract_call(<DAO>, "propose")` → bridge;
   IDs/secrets in durable KV; `POST /:id/test` proves wiring.
5. **(3) MVP** — harden `webhooks/secondlayer-webhook.ts`: HMAC verify + **session auth/
   network-restrict** + pre-filter + `[SENTINEL-TRIGGER]` directive + **`audit_targets[]`
   closure** + dedup/debounce/budget gate + `deadline_block` watchdog + durable sink.
6. **Two-deployment tier routing** — Monitor + Deep; bridge routes governance→Deep.
7. Extend `agent/instructions.md`: parse directive, multi-target+closure fetch, deadline-aware
   verdict-before-PoC, write to sink on `turn.completed`.
8. **(4) MVP** — parse sink → `Adjudication` → one notify channel; provisional-critical state;
   human-gated disclosure.
9. **Demo:** submit a known-bad proposal (incl. an indirection variant via separate M) to a
   test DAO → **Deep-tier WARN lands inside the timelock, before `execute-proposal` is
   callable**, `deadline_block` watchdog proving the time-guarantee.

**Sequencing to full:** waiver suppression → Primitive B (negative caller filter, server-side
volume cut) → Primitive A glue into f043 (best-effort mempool push + confirmed backstop) →
asset-holdings subgraph + price feed → **TVL/stakes tier router** (replaces class-based) →
per-delegation model override (collapse to one deployment) → timelock SLA timer → feat-f043
watchlist provisioning → incident-corpus auto-refresh.

## 6. Open questions / risks
- **AI-Gateway credits = MVP step 0** (Deep + verifier need paid credits to run at all).
- **Tier mechanism:** two-deployment routing now; collapse after eve per-delegation override.
- **TVL-driven tier non-functional pre-subgraph** — class-based covers MVP. OK to default class-based?
- **Primitive A best-effort** — single-node mempool lossy; pre-confirmation WARN must pair with confirmed-block backstop.
- **eve session auth** — `none()` → jwtHmac/network-restrict shipped with the webhook. Who issues/rotates the bridge↔eve secret?
- **Durable keystore + offboarding** — external KV for sub IDs/secrets; define client-offboarding.
- **Cost ceiling under flood** — malicious flood of cheap `propose` calls = Deep (~$2) each; confirm debounce + cap + code-hash cache + global ceiling before exposing the webhook. Validate Vercel concurrency for parallel sweeps.
- **Baseline-audit prerequisite** — flows (a)/(c) need a prior baseline; un-baselined contracts degrade to absolute outflow watch only. Acceptable?
- **Relative-% outflow** — needs a Sentinel-side baseline tracker (component 5, Full); MVP ships absolute thresholds only.
- **Disclosure stance** — keep escalation human-gated; provisional-critical never auto-discloses.
