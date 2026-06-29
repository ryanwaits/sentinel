# Sentinel — Control-Plane UX (product surface scope)

> The user-facing app over the built backend (discovery → audit engine → KB/`deriveConfig` →
> provisioner → bridge → adjudication → notify). Backend is CLI/files/headless-server today; NO
> UI, NO multi-tenant, NO signup. This doc designs the control plane. Grounded in real shapes:
> `monitoring/config.ts` (MonitoringConfig/SensitiveFn/TriggerClass/Tier/Archetype),
> `monitoring/kb.ts` (KBRecord/CentralizationWaiver/`deriveConfig`), `monitoring/adjudication.ts`
> (Adjudication/Finding), `monitoring/notify.ts` (warn-once/promote), `monitoring/spend-ceiling.ts`.
> House style: terse, sacrifice grammar.

## North star
Make the **audit→monitoring handoff** visible + editable. The product IS: an audit produces a
`MonitoringConfig` (which fns to watch, trigger class, allowlist, threshold, tier, route); user
reviews/edits/approves it; toggles ON; gets human-gated alerts; re-audits fire reactively. The
control plane is a thin UP layer over existing primitives — it does not invent new fields.

## User journey (confirmed vs code)
1. **Sign up** → org/account. (NEW — no auth/tenant exists; closest built primitive is the eve
   `jwtHmac` channel auth, M0.)
2. **Create project** = a client + 3–5 contractIds (`KBRecord.client`, `contractId`).
3. **Triage + baseline audit** — discovery tiers targets (`find_value_contracts`, TVL×risk); Deep
   baseline audit per contract → writes a `KBRecord` (archetype, closure, sensitiveFns, waivers,
   `baselineAudited:true`).
4. **Audit → default monitoring plan** — `deriveConfig(contractId)` maps KB → `MonitoringConfig`.
   This is the screen that matters. Defaults: sensitiveFns + triggerClass from the audit, tier from
   `tierForArchetype`, allowlists/thresholds from KB, closure for trigger-time fetch.
5. **Review / edit / approve** the plan (per-field overrides, below).
6. **Toggle ON** → `provisioner.ts --apply` reconciles each sensitiveFn → one live secondlayer chain
   `contract_call` subscription. Toggle OFF → `--offboard`.
7. **Ongoing alerts** — bridge pre-filters → tiered audit → `adjudicate` → `notify` (warn-once,
   human-gated). Re-audits fire reactively (governance proposal in timelock, upgrade, new
   counterparty). Spend capped by daily ceiling.

---

## Information architecture / nav
```
Sentinel
├─ Projects                         (list; create)
│   └─ <Project>
│       ├─ Contracts                (tier · archetype · TVL · baselineAudited · monitoring on/off)
│       │   └─ <Contract>
│       │       ├─ Audit            (run baseline / report view / re-audit history)
│       │       ├─ Monitoring Plan  (the derived MonitoringConfig — review/edit/approve, toggle)
│       │       └─ Activity         (triggers fired → sessions → verdicts for this contract)
│       └─ Alerts (Inbox)           (project-wide adjudicated alerts; human-gated actions)
├─ Spend / Budget                   (daily ceiling, reserved vs actual, paused state, clear)
└─ Settings                         (routes/notify channels, org, API keys)
```
Top-level inbox + spend are global because both are cross-project safety surfaces (`notify`,
`spend-ceiling` are global today).

---

## Screens & states

### 1. Signup / org (NEW — MVP-lite)
Minimal: email → org → invite. Backend reality: single-tenant today; auth = eve `jwtHmac`. MVP can
ship internal-only (us operating it for design-partner clients), real self-serve signup = LATER.

### 2. Project + Contract list
Per contract row, fields available:
- `archetype` (Archetype enum) — badge.
- `tier` (`tierForArchetype`) — Monitor / Deep badge.
- **TVL** — from discovery (`find_value_contracts` token-balances subgraph). NOT in KBRecord; the
  list joins discovery TVL × the KB record. If un-discovered → "—".
- `baselineAudited` — gates monitoring (un-baselined degrades to absolute-outflow watch only).
- monitoring on/off (is the provisioner reconciled / subs live).
- last trigger / last verdict severity.

### 3. Audit run + report view
- Trigger a Deep baseline (or re-audit). Shows run progress (8 auditors → verifier → PoC).
- Report = the markdown the agent returns (`readRun(sessionId)` replayable stream). Renders the
  `[SENTINEL-FINDINGS]` block as a findings table: title · severity · class (bug/centralization/info)
  · verifierVerdict · pocStatus · blastRadius. Honest bug-vs-centralization labeling is a first-class
  visual (the credibility engine — don't bury it).
- "Promote to monitoring plan" CTA → seeds/updates the KBRecord → step 4.

### 4. Monitoring Plan — review/edit/approve  ⭐ (the core screen)
Renders `deriveConfig(contractId)`: the `MonitoringConfig`. Every field is a default-from-audit with
an override. See "Defaults & overrides" below. Approve → persists edits back to the KBRecord (the
editable source `deriveConfig` reads). Toggle ON → provisioner apply.

### 5. Alerts / Inbox
One row per `notify` event (warn-once). Columns map to `Adjudication`:
- `severity` (critical…info), `class` (bug / centralization / info), `pocStatus`
  (green / pending / failed / na), `provisional` flag, `needsHuman` flag.
- `recommendedAction` text, `tokenCostUsd`, kept findings, `suppressed[]` titles.
- **Human-gated disclosure action** — the ONLY outward action; explicit button ("Begin coordinated
  disclosure"), never automatic (`notify` emits internal alert only). Gated, logged, with a
  confirm-step. This is the "Act" step — human-gated by hard rule.

### 6. Spend / Budget
From `spend-ceiling.getState()`: `DAILY_CEILING_USD` (default $20), `spentUsd` (reserved), actual
(reconciled), `dispatches`, `paused` + `pausedReason`. Per-tier estimates ($1.11 Monitor / $2 Deep).
**Clear-pause** button = `clearPause()` (human ack). Show reserved-vs-actual drift (reconcile).

---

## Defaults from the audit → how the user overrides (maps to real fields)
The plan screen is field-by-field. Each MonitoringConfig/SensitiveFn field = audit default + edit:

| Field (real) | Default (from audit/KB) | User override |
|---|---|---|
| `sensitiveFns[].name` | privileged fns the auditor flagged | add/remove a fn to watch |
| `sensitiveFns[].triggerClass` | classifier set per fn (`governance.proposal_submitted` / `.proxy_upgrade` / `counterparty.new` / `transfer.outflow`) | dropdown (the 4 MVP classes) |
| `sensitiveFns[].callerAllowlist` | KB allowlist (e.g. `[base-dao]` for `execute`); `[]` = any call notable | edit principal set. NOTE class-aware: governance = provenance (out-of-set ⇒ escalate, never drop); transfer/counterparty = drop if in-set |
| `sensitiveFns[].outflowThreshold` | KB threshold for transfer-class (e.g. `{stx, 1e12}`); below = benign | set asset + base-units amount |
| `tier` | `tierForArchetype(archetype)` (governance-dao/treasury⇒deep, else monitor) | override Monitor↔Deep (upsell: pay for Deep on a vault) |
| `archetype` | from audit | rarely edited; drives tier policy |
| `closure` | static call-graph closure (resolveClosure) | read-only (auto); shown as "also fetched on trigger" |
| `route` | `"default"` | pick notify channel/escalation route |
| `baselineAudited` | true once audited | read-only; false ⇒ banner "degraded to outflow-only watch" |

Edits persist to the **KBRecord** (the editable seed); `deriveConfig` re-derives; provisioner
reconciles the diff (add fn ⇒ +sub, remove ⇒ −sub, change url/route ⇒ update). The provisioner is
already a reconciler — UI just edits desired state.

---

## Key states & affordances
- **provisional-critical** — `Adjudication.provisional` (confirmed high/crit, PoC pending in a
  deadline race). Inbox shows amber "PROVISIONAL — verdict ahead of PoC"; auto-promotes to green
  (one extra `notify` "PROMOTED") when PoC turns green. UI: a pending→green badge transition, not a
  new alert row.
- **accepted-waiver suppression** — `CentralizationWaiver` (label centralization/by-design/info/low).
  Surfaced ONCE then suppressed; `adjudicate` drops them, `notify` won't re-page. UI: a "Suppressed
  (accepted waivers)" collapsed section on the contract + on the alert (`suppressed[]`), with an
  "un-waive" affordance (re-page if conditions change). Honesty: most vault findings are these.
- **paused-on-spend-ceiling** — `spend.paused` (persists across day rollover). Global red banner:
  "Audit-on-trigger PAUSED — daily ceiling reached. Triggers queued/dropped." Clear-pause button
  (human ack). Show on every screen (load-bearing safety).
- **deadline / timelock countdown** — for `governance.proposal_submitted` the value is "WARN lands
  inside the timelock, before execute is callable" (M5). Inbox + activity show a `deadline_block`
  countdown ("audit verdict 6 blocks before executable") — the prevention proof, visualized.
- **needsHuman** — uncertain kept finding ⇒ flag for manual look.

---

## MVP vs later
**MVP (over what's built):**
- Project + contract list (join KB record + discovery TVL).
- Audit report viewer (render `readRun` markdown + findings table).
- Monitoring-plan review/edit/approve screen (edit KBRecord → `deriveConfig` preview).
- Toggle ON/OFF = wrap `provisioner --apply/--offboard`.
- Alerts inbox (read `notify` state / adjudications) with severity/class/pocStatus/provisional and
  the human-gated disclosure button.
- Spend view + clear-pause.
- Internal-tenant only (operate it for design partners); auth = jwtHmac.

**Later:**
- Real self-serve signup + multi-tenant isolation.
- In-app audit triggering w/ live progress (today headless server; channel events DON'T fire
  headless — read replayable stream).
- TVL/stakes tier router (replaces `tierForArchetype`), USD price feed.
- Per-fn relative/windowed thresholds (stateful baselines — not expressible in absolute
  OutflowThreshold today; Full KB).
- f044 negative-caller filter, f043 watchlist (collapse N subs → 1), mempool pre-confirm UI.
- Disclosure workflow tooling (coordinated-disclosure tracker) beyond the gate button.
- Billing / retainer tiers surfaced as plans.

---

## Wireframes

### Monitoring Plan (the core screen)
```
┌ ccd002-treasury-mia-mining-v3 ───────────────────────  [archetype: treasury] ┐
│ Tier: ( ) Monitor  (•) Deep      ← default tierForArchetype(treasury)=deep    │
│ Baseline: ✓ audited 2026-06-27   Route: [ default ▾ ]                         │
│                                                                              │
│ Sensitive functions (watched)                              [+ add function]  │
│ ┌──────────────┬───────────────────────────┬───────────────┬────────────┐  │
│ │ fn           │ trigger class             │ callerAllowlist│ threshold  │  │
│ ├──────────────┼───────────────────────────┼───────────────┼────────────┤  │
│ │ execute      │ governance.proposal_subm. │ [base-dao]     │ —          │  │
│ │              │   out-of-set ⇒ ESCALATE   │  (provenance)  │            │  │
│ │ set-extension│ governance.proxy_upgrade  │ [base-dao]     │ —          │  │
│ │ withdraw-stx │ transfer.outflow          │ [] (any)       │ stx ≥ 1e12 │  │
│ │ withdraw-ft  │ transfer.outflow          │ [] (any)       │ [set…]     │  │
│ └──────────────┴───────────────────────────┴───────────────┴────────────┘  │
│ Also fetched on trigger (closure, auto): base-dao, extension-trait, +3      │
│                                                                              │
│ Accepted waivers (suppressed, warn-once):                                   │
│   • "Any extension can register new extensions" [by-design]  [un-waive]     │
│                                                                              │
│             [ Preview derived config ]   [ Approve & save ]                  │
│ Monitoring:  ( OFF )──●  → on approve, provision N=4 chain subscriptions     │
└──────────────────────────────────────────────────────────────────────────┘
```

### Alerts inbox
```
┌ Alerts — citycoins-dao ──────────────── ⚠ spend PAUSED ($20/$20)  [clear] ┐
│ sev    contract              class          poc       flags      action     │
│ ───────────────────────────────────────────────────────────────────────── │
│ CRIT  ccd002-treasury…      bug            ⏳pending  PROVISIONAL [review]   │
│        ↳ proposal audited inside timelock — exec in 6 blocks (countdown)    │
│        ↳ recommendedAction: …  cost $1.92   [ Begin disclosure (gated) ]    │
│ HIGH  dlmm-pool…            centralization green     —           [review]   │
│ INFO  ccd002-treasury…      info           na        SUPPRESSED  (waiver)   │
│       disclosure: human-gated — no automated action taken                   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Contract list
```
┌ Project: citycoins-dao ──────────────────────────────────────────────────┐
│ contract                       archetype   tier    TVL     base?  monitor   │
│ ──────────────────────────────────────────────────────────────────────── │
│ ccd002-treasury-mia-mining-v3  treasury    Deep    $4.2M   ✓      ● ON      │
│ dlmm-pool-stx-usdcx…           amm         Monitor $1.1M   ✓      ○ OFF     │
│ (+ add contract)                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Open questions (for the human)
1. **Tenant model first cut** — internal-operated (we run it for design partners, jwtHmac) vs build
   real self-serve signup now? Affects whether the whole auth/tenant layer is MVP.
2. **Where do plan edits persist?** — KBRecord is git-checked JSON today (`sentinel/kb/`). UI editing
   wants a DB. Promote KB to the durable KV/DB seam now, or keep git-JSON + a thin write API for MVP?
3. **Live audit triggering in-app** — channel events/hooks DON'T fire in the headless server (read
   replayable `stream` instead). Is poll-the-stream good enough for an in-app "running…" UX, or do we
   need eve TUI/dev parity / an upstream fix first?
</content>
</invoke>
