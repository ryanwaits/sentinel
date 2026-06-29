# Audit → KB → Monitoring plan: closing the manual glue

**Status:** plan only (no production code). **Owner gap:** today the KB records in
`sentinel/kb/*.json` are hand-distilled from `reports/*.md`. This wires that distillation
into the audit so a baseline audit emits a *candidate* `KBRecord` a human reviews → commits →
`deriveConfig` (monitoring/kb.ts) turns into a `MonitoringConfig`.

Grounded in the real schemas (`monitoring/kb.ts`, `monitoring/config.ts`,
`monitoring/adjudication.ts`, `monitoring/closure.ts`, `monitoring/prefilter.ts`) and the two
seeded examples (ccd002 treasury, dlmm pool) reverse-engineered from their reports.

---

## 1. Inputs at end-of-audit → target output

**Available when a baseline audit finishes (`agent/instructions.md` orchestrator):**
- Full target source + the **dependency closure** (orchestrator fetched it via
  `fetch_contract_source`; `monitoring/closure.ts#resolveClosure` is the same walk — deterministic).
- The auditor-* findings + the `[SENTINEL-FINDINGS]` block (`monitoring/adjudication.ts#Finding`):
  per-finding `title/severity/class/verifierVerdict/pocStatus/blastRadius/recommendedAction`.
- `auditor-access-control` / `auditor-governance` output: the **auth gates** per privileged fn
  (`is-eq contract-caller .x`, `is-dao-or-extension`, `admins` map) — the raw material for
  `callerAllowlist`.
- The report prose (archetype, value-movers, fund-flow).

**Target output = a validated `KBRecord` (monitoring/kb.ts):**
`contractId, client, archetype, closure[], baselineAudited, auditedAt?, sensitiveFns[], waivers[], source?`
— where `sensitiveFns[i]` = `{name, triggerClass, callerAllowlist[], outflowThreshold?}`
(config.ts `SensitiveFn`) and `waivers[i]` = `{finding, label, note?}` (kb.ts `CentralizationWaiver`).

The record is the *only* input to `deriveConfig` → `MonitoringConfig` (tier via
`tierForArchetype`). So the whole glue ends at "write a correct KBRecord JSON to `sentinel/kb/`."

---

## 2. Per-field derivation (deterministic / LLM / human-confirm)

How a human produced the two seeded records, made mechanical:

| KBRecord field | Source | Mode |
|---|---|---|
| `contractId` | trigger / audit target | **deterministic** |
| `client` | NOT on-chain (e.g. `citycoins-dao`, `dlmm`) | **human** (or per-audit input) |
| `archetype` | report ("DLMM bin-AMM"→`amm`, "treasury"→`treasury`) | **LLM hint → human-confirm** (drives tier) |
| `closure[]` | `resolveClosure(target, fetch)` | **deterministic** (override any LLM guess) |
| `baselineAudited` | true for a baseline/full audit | **deterministic** |
| `auditedAt` | run date | **deterministic** |
| `sensitiveFns[].name` | privileged `define-public` fns | **LLM extract + deterministic lint** |
| `sensitiveFns[].triggerClass` | fn semantics → enum | **LLM map** (rule-checked) |
| `sensitiveFns[].callerAllowlist` | auth-gate principals | **LLM extract → HUMAN-CONFIRM** (suppression risk) |
| `sensitiveFns[].outflowThreshold` | value scale judgment | **LLM suggest (advisory) → HUMAN sets** (default unset) |
| `waivers[]` | refuted/centralization findings | **deterministic from `[SENTINEL-FINDINGS]`** + human-confirm |
| `source` | report path | **deterministic** |

### triggerClass mapping (LLM, rule-checked against the `TriggerClass` enum)
- proposal/`execute`/`run` proposal-dispatch → `governance.proposal_submitted`
- `set-extension` / `set-implementation` / `set-core-migration-target` / proxy/impl swap → `governance.proxy_upgrade`
- value-out fn (`withdraw-*`, `remove-liquidity`, `transfer`) → `transfer.outflow`
- new-counterparty interaction (`swap`) → `counterparty.new`
(matches both seeds exactly: ccd002 `execute`→proposal, `set-extension`→proxy_upgrade,
`withdraw-stx/ft`→outflow; dlmm `set-core-migration-target`→proxy_upgrade, `swap`→counterparty,
`remove-liquidity`→outflow.)

### callerAllowlist inference (the load-bearing, risky one)
Read the fn's auth gate. ccd002 `execute`/`set-extension` gate on
`is-dao-or-extension`/`is-self-or-extension` → the DAO core principal is the authorized caller →
allowlist `[…base-dao]`. dlmm `swap`/`remove-liquidity` are public/permissionless → `[]`.
**Crucial fail-safe asymmetry (from `monitoring/prefilter.ts#classify`):**
- governance classes: allowlist only sets the `suspicious` flag — **can never suppress** an audit
  (governance is always notable). Safe to auto-populate.
- `counterparty.new`: a caller *in* the allowlist is **dropped as benign** → a wrong/over-broad
  allowlist = false benign-suppression. **Never auto-populate; leave `[]` (everything notable)
  until a human adds known counterparties.**
- `transfer.outflow`: allowlist unused; suppression is via `outflowThreshold` only.

### outflowThreshold (suggest, don't auto-apply)
`prefilter` drops an outflow **below** the threshold; unset/undecodable ⇒ notable (fail-safe).
So a too-high threshold = blind spot. **Candidate leaves it UNSET** (always audit). The agent may
emit an advisory suggestion (e.g. ccd002 `withdraw-stx` 1e12 µSTX) for the human to accept. The
seed's `withdraw-ft` correctly has none.

### waivers (derive deterministically — don't ask the LLM twice)
Re-use the `[SENTINEL-FINDINGS]` block already emitted. Candidate waiver = any finding with
`verifierVerdict:"refuted"` OR `class:"centralization"`:
- `finding` ← title, `note` ← `recommendedAction`/`blastRadius` + verdict reason,
- `label` ← `centralization`→`"centralization"`; refuted-bug/false-positive→`"info"`;
  downgraded→`"low"`; "DAO-trusted/by design"→`"by-design"`.
This reproduces both seeds: dlmm waivers = findings #1/#2/#3 (refuted/downgraded);
ccd002 waiver = finding #1 ("Any extension can register… → privilege escalation", by-design).
A real confirmed **bug never becomes a waiver** (mirror `adjudication.matchesWaiver` which refuses
to waive `class:"bug"`).

### Proposed agent step — `[SENTINEL-KB]` block (analogous to `[SENTINEL-FINDINGS]`)
Add to `agent/instructions.md`: at the end of a **baseline/full audit** (not a monitoring-trigger
run), emit ONE machine-readable block after the prose, alongside `[SENTINEL-FINDINGS]`:

```
[SENTINEL-KB]
{ "contractId": "...", "archetype": "vault|amm|treasury|governance-dao|token|other",
  "sensitiveFns": [
    { "name": "execute", "triggerClass": "governance.proposal_submitted",
      "callerAllowlist": ["SP….base-dao"],
      "evidence": "L120 (asserts! (is-eq contract-caller .base-dao))",   // advisory
      "confidence": 0.9,                                                  // advisory
      "outflowThresholdSuggested": null } ],
  "archetypeConfidence": 0.95 }
[/SENTINEL-KB]
```

A deterministic **distiller** (new `monitoring/kb-candidate.ts`, modeled on
`adjudication.extractFindings`) then:
1. parse `[SENTINEL-KB]`; strip advisory keys (`evidence`, `confidence`, `*Suggested`,
   `archetypeConfidence`) — they are NOT in the `KBRecord` schema (keep them in a sidecar for the
   reviewer);
2. **override `closure`** with `resolveClosure` output (fact > LLM);
3. **derive `waivers`** from the run's `[SENTINEL-FINDINGS]` (above);
4. apply fail-safe defaults: `counterparty.new` allowlist → `[]`; `outflowThreshold` → unset;
   `baselineAudited:true`, `auditedAt`, `source`;
5. `KBRecord.parse(...)` (zod) — a malformed block fails closed (no candidate, human-review WARN,
   same posture as `adjudicate` on a missing findings block).

---

## 3. Review / approve workflow

```
baseline audit → report w/ [SENTINEL-FINDINGS] + [SENTINEL-KB]
  → distiller → candidate KBRecord (+ advisory sidecar)
  → write to sentinel/kb/_candidates/<contractId>.json   (NOT live)
  → HUMAN reviews/edits (allowlists, thresholds, archetype, client, waivers)
  → commit moves it to sentinel/kb/<contractId>.json
  → deriveConfig(contractId) → MonitoringConfig (unchanged)
```

The candidate is git-tracked (the KB is "a git-checked JSON record" per kb.ts) so review = a diff.

**Auto-apply (safe, fail-safe-by-construction):**
- `closure` (deterministic resolver), `baselineAudited`, `auditedAt`, `source`.
- `sensitiveFns[].name` + `triggerClass` (rule-checked enum).
- `callerAllowlist` **only for governance classes** (cannot suppress, only flags `suspicious`).
- `waivers` (warn-once; can't waive a `bug`).
- Fail-safe defaults: counterparty allowlist `[]`, outflowThreshold unset.

**Must be human-confirmed before going live:**
- `callerAllowlist` for `counterparty.new` (suppression-capable → blind-spot risk).
- `outflowThreshold` values (suppression-capable).
- `archetype` when `archetypeConfidence` < threshold (drives tier; mis-tier underaudits).
- `client` (not derivable on-chain).
- Each `waiver` (accepting one permanently suppresses re-paging for that finding text).

---

## 4. Pre-launch vs ongoing; re-audit-on-upgrade merge

**Pre-launch / on-demand full audit (baseline):** produces the INITIAL candidate. Full closure,
full public-fn enumeration, `baselineAudited:true`. This is the path that generated the two seeds.

**Ongoing monitoring-trigger audits:** subject = the *proposal/new* code
(`directive.buildAuditTargets`), NOT the watched contract. These DO NOT regenerate the watched
contract's KBRecord. They may only **append waiver candidates** (newly refuted/centralization
findings on the watched contract) for human review — never rewrite fns/allowlists/archetype.

**Re-audit on upgrade (new impl deployed) — merge, never clobber.** New baseline audit of the
upgraded contract → new candidate → **3-way merge vs the committed (human-approved) record**, keyed
by stable keys, additive-only auto-merge + conflict surfacing:
- `closure`: regenerate + overwrite (pure fact).
- `sensitiveFns` keyed by `name`:
  - new name → add with fail-safe defaults (`[]` allowlist, no threshold);
  - existing name → **keep the human-edited `callerAllowlist`/`outflowThreshold`**; only surface a
    conflict if the new audit's `triggerClass` differs;
  - name gone in new source → **flag for human** (don't silently drop — could be a removed guard).
- `waivers` keyed by normalized `finding` text → keep all human-accepted; add new candidates;
  **never auto-delete** a human waiver.
- `archetype`/`client` → keep committed unless human changes.

Source of "human edits" = the committed record in git (no extra schema field needed). The merge
tool diffs candidate↔committed; auto-applies additive+closure, writes the rest to
`_candidates/` for review.

---

## 5. Risks & mitigations

| Risk | Mechanism | Mitigation |
|---|---|---|
| **Bad allowlist → false benign-suppression** | over-broad `counterparty.new` allowlist drops a real attacker as "known" | never auto-populate suppression-class allowlists (`[]` = all notable); human-confirm; carry per-fn `evidence` (source line) so review is fast; governance allowlists are safe (flag-only) |
| **Missed sensitive fn → blind spot** | LLM omits a value/auth mutator | **completeness lint**: deterministic scan of `define-public` for `ft-/stx-/nft-transfer`, `mint`/`burn`, `as-contract`, `with-all-assets-unsafe`, `set-*`/`withdraw*`/`migrate*`; every hit must appear in `sensitiveFns` or be explicitly marked benign-with-reason; **unknown → add as notable** (fail-safe) |
| **Too-high outflowThreshold → blind spot** | drain below threshold dropped | candidate leaves threshold **unset** (always audit); only a human sets a value |
| **Wrong archetype → under-tier** | e.g. treasury mislabeled `token` → `monitor` not `deep` | confidence gate; ambiguous → fail-safe to the higher tier (treat as `deep`) or human-confirm |
| **Over-broad waiver suppresses a future bug** | fuzzy `matchesWaiver` over-matches | waivers can't waive `class:"bug"` (existing); keep waiver text specific; human-confirm each; re-audit never auto-extends waivers |
| **LLM-hallucinated closure** | phantom dependency | use `resolveClosure`, ignore LLM closure entirely |
| **Malformed `[SENTINEL-KB]`** | bad JSON | `KBRecord.parse` fails closed → no candidate, human-review WARN (mirror `adjudicate` no-block path) |

Guiding rule (same as prefilter): **unknown → notable.** Automation only ever *narrows* scope with
explicit human sign-off; everything else defaults to "audit it."

---

## 6. MVP vs later; open questions

**MVP**
- `[SENTINEL-KB]` block in `agent/instructions.md` (baseline-audit mode only).
- `monitoring/kb-candidate.ts` distiller: parse block, override closure (resolver), derive waivers
  from `[SENTINEL-FINDINGS]`, strip advisory fields, fail-safe defaults, `KBRecord.parse`, write to
  `sentinel/kb/_candidates/`.
- Completeness lint (public-fn scan) as a hard gate on the candidate.
- Human edit + manual commit → existing `deriveConfig` (no change).

**Later**
- Re-audit merge tool (additive auto-merge + conflict surfacing).
- gh-PR-based review instead of `_candidates/` dir.
- Confidence-driven auto-population of governance allowlists; archetype classifier hardening.
- Data-driven `outflowThreshold` suggestions from secondlayer Streams/Subgraph flow baselines
  (ties into the stateful windowed-rate baselines kb.ts defers to "Full").
- Auto-tier router (TVL × stakes) replacing `tierForArchetype`.

**Open questions**
1. Candidate destination: `sentinel/kb/_candidates/` dir vs auto-opened `gh` PR? (house style
   favors `gh`; PR gives review threads but more ceremony per audit.)
2. `client` provenance: pass as a per-audit input up front, or have the human fill it at review?
3. Re-audit-on-upgrade: may the merge tool ever auto-commit a *new* fail-safe sensitive fn, or must
   every change be human-gated? (noise vs blind-spot trade.)
4. Archetype auto-apply confidence threshold + the fail-safe-to-`deep` policy — acceptable cost of
   over-auditing a mis-classified contract?
