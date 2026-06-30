# Audit-informed monitoring — scope (FINAL)

## 1. Overview & positioning

Sentinel sells **ONE** story over the **same** audited contract, in two motions. The baseline audit **generates** the monitoring scope; the client reviews/tunes it; runtime then runs two differently-routed paths over it.

| Pillar | Motion | Trigger classes (Type) | Engine path | Output | Honest claim |
|---|---|---|---|---|---|
| **PREVENTION** | reactive audit of NEW code entering a timelock | `governance.proposal_submitted`, `governance.proxy_upgrade` (**Type-1**) | `audit(proposal_target)` — audits the incoming impl, NOT the live contract | **veto WARN** *iff* the audit can finish before the proposal executes | "we audited the code about to go live; you have N blocks to veto" |
| **DETECTION** | incident triage on UNCHANGED code | `transfer.outflow`, `counterparty.new` (**Type-2**) | NO audit — deterministic correlation vs KB signatures + the prefilter verdict | **detection WARN** | "the exploit already executed on-chain; here's fast detection + forensics + stop-further-loss" |

**The moat (the seam):** one baseline audit feeds both motions — `KBRecord → MonitoringConfig → Finding → adjudicateFindings → notify`. The audit GENERATES: sensitive fns + trigger class (exists), accepted waivers (exists in KB, dropped by `deriveConfig` — restored here), **suggested outflow thresholds** (GAP 1), and **confirmed bugs as Type-2 exploit signatures** (GAP 2). Client reviews/tunes before anything goes live.

**Today (ground truth, verified):** both classes flow the identical `webhook → classify → reserve → runTrigger → audit() → adjudicateFindings → notify` path. Type-2 re-audits unchanged bytecode (`target = directive.proposal_target ?? contractId`, `webhook:175`) — exactly what this forbids. This scope forks that path.

### LOCKED honesty lines (surface verbatim in product UI; do not overclaim)
- **Type-2 (existing):** "By the time an outflow webhook fires, the transaction is already on-chain. Type-2 does **not** prevent the first loss. Value = fast detection + human-gated incident response + stop-further-loss + forensics."
- **Type-2 signature match (NEW — issue B6):** "A watched function with a PROVEN vulnerability was *invoked*. This is a correlation that the bug we found *may* be being exploited — **not** confirmation that this call is malicious. A human must review whether THIS invocation is the exploit."
- **Type-1 latency (NEW — issue M8):** "Prevention holds ONLY when audit-latency < remaining timelock. If the proposal can execute before a verdict lands, the alert is **DETECTION (too-late)**, not a veto opportunity. We hide the veto affordance when the window is gone."
- **Stop-further-loss (NEW — issue M7):** "Sentinel never auto-acts and does not control your contract. If you have a pause/guard switch, we hand a human a pre-filled tx to sign — we never call it."

---

## 2. Product spec

### 2.1 Engineer lifecycle
```
PRE-LAUNCH                  DISTILL                  REVIEW/TUNE              DEPLOY           RUNTIME
deep audit ───────────────▶ KBRecord candidate ───▶ Monitoring Plan ──────▶ provisioner ──▶ Type-1 veto WARN (if window)
audit(id,{distillKB:true})  sentinel/kb/             screen: client edits   --apply          Type-2 detection WARN
→ findings + kbCandidate    _candidates/<id>.json    sensitiveFns, thresholds,  N chain subs  ──▶ human acts
                            HUMAN promotes →          signatures, waivers, tier
                            sentinel/kb/<id>.json
```
Maps to `control-plane-ux.md` steps 3–7. The **Monitoring Plan screen (§4)** is "audit suggests / client tunes."

### 2.2 What the client SEES and TUNES (audit-suggested scope)
Plan screen renders `deriveConfig(contractId)`. Every field = **audit default + client override**, persisted back to the `KBRecord`:

- **(a) Sensitive fns + trigger class** — BUILT. Client adds/removes, changes class via 4-enum dropdown.
- **(b) Caller allowlists** — BUILT, asymmetric by design (**LOCKED**): governance = provenance set (out-of-set caller ⇒ `suspicious`, never dropped, `prefilter.ts:91`); `counterparty.new` = suppression set, **force-emptied by distiller** (`kb-distill.ts:68`), client fills it.
- **(c) Outflow thresholds** — GAP 1. Greyed placeholder: *"audit suggests stx ≥ 1e12 (on-chain cap)"* or, when no cap exists, *"no on-chain cap found — fail-safe: every outflow surfaces for review until you set one."* **Accepting copies `suggestedOutflowThreshold → outflowThreshold`** (the live field `prefilter.classify` reads at `:103`). **Until accepted, the event is NOT silently dropped** — it routes to triage and surfaces fail-safe (§3, issue M9). Honesty corrected from "fail-safe-audited" to "fail-safe-triaged" (no audit on Type-2).
- **(d) Centralization waivers** — BUILT in KB, surfaced collapsed with "un-waive". `adjudicate` drops them; most vault findings land here — surface honestly.
- **(e) Known findings watched (detection signatures)** — GAP 2. Each row = title · severity · `signature.fn` · optional `signature.asset` · precondition note. Client toggles on/off. **The visible moat:** "the bug we proved is the thing we now watch for being exploited" — framed as correlation, not confirmation.

### 2.3 Type-1 veto WARN (prevention) — latency-aware (issue M8)
```
⚠ PREVENTION — incoming governance code audited inside timelock
contract: ccd002-treasury   proposal_target: SP….upgrade-v4
severity: CRITICAL  class: bug  pocStatus: pending (PROVISIONAL)
veto window: 6 blocks left (est. audit ~50 blocks) → ❌ MISSED — DETECTION ONLY   cost: $1.92
disclosure: human-gated — no automated action taken
[ Begin coordinated disclosure (gated) ]  [ Acknowledge ]      ← veto button HIDDEN, window gone
```
WARN UI computes `remaining_blocks − estimated_audit_blocks`. If positive: render `[ Veto / block proposal ]` + countdown (the prevention proof). If non-positive: flip to **"MISSED — detection only"** and HIDE the veto button. Fixed `SENTINEL_TIMELOCK_BLOCKS=144` today (`webhook:35`); real per-DAO read + `estimated_audit_blocks` calibration = FOLLOW-ON, but the *honesty gate* (hide veto when window gone) ships in MVP-consumer.

### 2.4 Type-2 detection WARN — correlational, no pause button (issues B6, M7)
```
⚠ DETECTION — runtime event correlated to a known finding (already executed on-chain)
contract: vault-sbtc   fn: socialize-debt   tx: 0x…   block: N (CONFIRMED on-chain)
severity: CRITICAL  class: bug  verdict: UNCERTAIN  pocStatus: na  confidence: 0.6 (correlation)
matched: a fn with a PROVEN vuln ("socialize-debt unbounded LP loss", Finding 1) was INVOKED
  precondition to verify: loss is unbounded / no cap — confirm THIS call hit it
amount: 8.4e12   caller: SP…(new)
stop-further-loss: if you control a pause/guard, prepare a tx — Sentinel will not call it
disclosure: human-gated — no automated action taken
[ Notify project ]  [ Begin incident response ]  [ Acknowledge ]
```
- **NO `verifierVerdict:"confirmed"`** at the event level. A sensitive fn firing is NOT proof of exploitation (Finding 1's `socialize-debt` is an *authorized* op). Match emits `class:"bug"` (it concerns a real, proven bug — and `class:"bug"` is hard-excluded from waiver suppression, `adjudication.ts:114`) but `verifierVerdict:"uncertain"` + `needsHuman:true` + `confidence ≈ 0.6` (correlation strength, NOT 0.9). Headline is correlational; the signature's **precondition** text is surfaced so a routine authorized call isn't read as an exploit.
- **NO veto** (too late) and **NO `[Pause/guard]` action button** — `stop-further-loss` is GUIDANCE TEXT. A pause affordance appears only if the KB explicitly records a client-controlled pause fn (optional `KBRecord.pauseFn`, see Open-Q1), and only as "hand the human a pre-filled tx," never an automated call.

---

## 3. Implementation plan — file by file

### Canonical decisions (resolving the three sub-scopes + the 10 review issues)
1. **GAP 1 — separate advisory field; prefilter UNCHANGED.** `SensitiveFn.suggestedOutflowThreshold` (NOT a `reviewed` flag). The live gate can never auto-arm because `prefilter.classify` literally cannot see the suggestion. Zero migration. **(B2)** The model emits a *plain-string-amount* `outflowThreshold` **only when an explicit on-chain single-tx cap exists, else OMITS it entirely — never `null`** (a `null` into the `z.string()` field fails the single `KBCandidate.safeParse` and silently drops the *entire* candidate). No nullable amount, no `basis` enum — "no cap" = absent suggestion = fail-safe (§2.2c).
2. **GAP 2 — one `FindingSignature` type in `config.ts`**, joined to a finding by explicit `targetFn` (NOT title-match). Missing `targetFn` ⇒ context-only finding, never a fabricated signature.
3. **Import direction (B1).** `CentralizationWaiver` MOVES into `config.ts`; `kb.ts` imports it FROM config (the existing safe `kb→config` value edge). `config.ts` must NOT value-import from `kb.ts` (would crash at load: `kb` top-level evaluates `KBRecord` while `SensitiveFn` is in the TDZ). `FindingSignature.severity` imports `Severity` from `adjudication.ts` — safe, because `adjudication`'s only edges (`kb`, `trigger-state`) are `import type` (erased), so `config→adjudication` is a clean one-way value edge with no cycle.
4. **Routing — fork in the webhook BEFORE `reserve`**, into a dedicated `triageTrigger`; `runTrigger` stays Type-1-only and pristine. Type-2 triage is ~$0 and must not consume the audit-cost gate.
5. **Discriminator — `origin` on `Finding` and `Adjudication`; REQUIRED on the notify payload (M10).** Not optional — it is the single most important client distinction (veto-able vs too-late). Additive to `buildPayload`, no warn-once logic change.
6. **Triage altitude (M4+M9).** The prefilter is the single gate; triage does NOT re-run threshold/allowlist comparison. Triage = (a) signature-match (the one genuinely-new signal) + (b) wrap the existing `PrefilterVerdict` into one info-class Finding (its `reason`/`amount`/`suspicious` already encode threshold-exceeded, new-counterparty, AND the no-threshold fail-safe — all reach triage only because `notable:true`).
7. **Sequencing (M5).** Split MVP at the seam: **PRODUCER half ships now** (scope generation, unit-testable with zero chain); **CONSUMER half is gated** to the first real engagement / the Type-2 subscription variant. Any consumer code that lands early stays pure + unit-tested + explicitly dormant until a Type-2 sub can fire it.

---

### MVP-PRODUCER (ship now — the moat; unit-testable, no chain, no Type-2 traffic needed)

**`monitoring/config.ts`**
- ADD shared routing primitive (kills the `GOVERNANCE_CLASSES` drift between `webhook:32` raw `string[]` and `directive.ts` `TriggerClass[]`):
  ```ts
  export const GOVERNANCE_CLASSES = [
    "governance.proposal_submitted", "governance.proxy_upgrade",
  ] as const satisfies readonly TriggerClass[];
  export const TriggerRoute = z.enum(["type1", "type2"]);
  export type TriggerRoute = z.infer<typeof TriggerRoute>;
  export function routeForTriggerClass(cls: TriggerClass): TriggerRoute {
    return (GOVERNANCE_CLASSES as readonly TriggerClass[]).includes(cls) ? "type1" : "type2";
  }
  ```
- ADD `SensitiveFn.suggestedOutflowThreshold: OutflowThreshold.optional()` (advisory; **prefilter never reads it**). `outflowThreshold` keeps its current meaning = the LIVE human-promoted gate. `OutflowThreshold` stays `{asset, amount: z.string()}` UNCHANGED.
- **MOVE** `CentralizationWaiver` here from `kb.ts` (B1). ADD `FindingSignature` + the two `MonitoringConfig` fields `deriveConfig` currently drops (`signatures`, `waivers`). See §4 for exact diffs.

**`engine/findings.ts`**
- `KB_DISTILL_SCHEMA` `sensitiveFns` item props: ADD OPTIONAL `outflowThreshold: { type:"object", additionalProperties:false, properties:{ asset:{type:"string"}, amount:{type:"string"} }, required:["asset","amount"] }` (NOT in `sensitiveFns.required`). **Plain string amount — no nullable, no `basis`** (B2).
- `FINDINGS_SCHEMA` items props: ADD OPTIONAL `targetFn:{type:"string"}`, `targetAsset:{type:"string"}` (NOT in `required`).

**`engine/audit.ts`** — `orchestratorSystem` `kbStep` (`:92`), append honest-by-construction:
> "For each `transfer.outflow` fn, set `outflowThreshold` (asset + amount) ONLY if the source defines an explicit single-tx withdrawal/transfer cap — use that exact base-units value. If no on-chain cap exists, OMIT `outflowThreshold` entirely (do NOT invent a number, do NOT emit null). Also name `targetFn` (and `targetAsset` if asset-scoped) for any exploitable bug, plus a one-line `precondition` describing the condition that distinguishes the exploit from a normal authorized call (e.g. 'unbounded loss / no cap', 'caller outside provenance set')."

**`engine/kb-distill.ts`**
- Replace the unconditional `delete sf.outflowThreshold` (`:67`) with suggest-not-enforce:
  ```ts
  const sensitiveFns = (kbCandidate?.sensitiveFns ?? []).map((fn) => {
    const sf = { ...fn };
    if (sf.outflowThreshold) sf.suggestedOutflowThreshold = sf.outflowThreshold; // advisory
    delete sf.outflowThreshold;                                  // never auto-arm the live gate
    if (sf.triggerClass === "counterparty.new") sf.callerAllowlist = []; // unchanged: suppression-set safety
    return sf;
  });
  ```
- `priorFindings` map (`:54-61`) — anchor a signature from the finding's `targetFn`. **NO `pocFile` line** (M3): the engine `Finding` has no `pocFile`; reading `f.pocFile` is a TS error and `Finding` is NOT gaining `pocFile` in MVP. `pocFile` anchoring is FOLLOW-ON (Open-Q6).
  ```ts
  .map((f) => ({
    title: f.title, severity: f.severity, class: "bug" as const,
    note: f.blastRadius ?? f.recommendedAction,
    signature: f.targetFn
      ? { title: f.title, fn: f.targetFn, asset: f.targetAsset, severity: f.severity,
          precondition: f.precondition,                              // surfaced as the human's discriminator
          triggerClass: f.targetAsset ? ("transfer.outflow" as const) : undefined }
      : undefined,                                                   // no targetFn ⇒ context-only, never fabricated
  }));
  ```
  Validate `targetFn ∈ sensitiveFns[].name`; if not, drop the signature → context-only (fail-open, never false-positive — Open-Q5).
- Extend the `KBCandidate` zod so `SensitiveFn` carries `suggestedOutflowThreshold` (it already references `SensitiveFn` from config — gains the field automatically). Add OPTIONAL `targetFn`/`targetAsset`/`precondition` to the engine `Finding` zod (`adjudication.ts`, below) so the map type-checks. Update the file-header comment (thresholds now *suggested*, not dropped).

**`monitoring/kb.ts`**
- Import `CentralizationWaiver`, `FindingSignature` FROM `config.ts` (B1).
- `PriorFinding`: ADD `signature: FindingSignature.optional()`.
- `deriveConfig` (`:94-104`): project what it drops — `waivers: rec.waivers` and `signatures: rec.priorFindings.flatMap(f => f.signature ? [f.signature] : [])`.

**`monitoring/adjudication.ts`** (producer-side type additions only)
- `Finding`: ADD `origin: z.enum(["audit","incident"]).default("audit")`, `targetFn: z.string().optional()`, `targetAsset: z.string().optional()`, `precondition: z.string().optional()`.
- `Adjudication` type: ADD `origin?: "audit"|"incident"|"mixed"`.

> PRODUCER half is fully unit-testable via the distill path with zero chain — this is the moat and ships first.

---

### MVP-CONSUMER (gated to the first real engagement / Type-2 subscription variant — M5)

> Lands WITH a contract whose flow profile can tune thresholds and a Type-2 sub that can actually fire it. If any of it lands earlier, it stays **pure + unit-tested + dormant** (driven only by a hand-crafted POST) and is NOT elaborated with confidence tuning before a real flow profile exists.

**`webhooks/secondlayer-webhook.ts`** — import shared `GOVERNANCE_CLASSES`/`routeForTriggerClass` (delete local `:32`). Fork AFTER prefilter+debounce (steps 6–7), BEFORE `reserve` (step 8):
```ts
if (routeForTriggerClass(fn.triggerClass) === "type2") {
  markDispatched(key, contractId, fnName);                       // dedup, no audit-cost gate
  triageTrigger({ config, fn, event: event as ChainEventBody, verdict,   // PASS the prefilter verdict (M4)
    contractId, txId: payload.tx_id, blockHeight: payload.block_height,
    caller: event.sender, dedupKey: key })
    .catch((err) => console.error(`[bridge] triage failed: ${(err as Error).message}`));
  markHandled(webhookId);
  return new Response("triage queued", { status: 202 });
}
// else Type-1: existing reserve → buildDirective → runTrigger (UNCHANGED)
```
`reserve` stays the **Type-1-only** gate; `deadlineBlock` calc + `runTrigger` unchanged.

**`monitoring/incident-triage.ts`** (NEW) — pure + deterministic, no `audit()`, no model. **Two producers only (M4+M9):**
1. **signature-match** (the one new signal): for each `sig` in `config.signatures`, `event.function_name === sig.fn && (!sig.asset || sig.asset === event.asset_identifier)`. Emits a **correlational** Finding (B6): `class:"bug"`, `verifierVerdict:"uncertain"`, `severity: sig.severity`, `confidence: 0.6`, `pocStatus:"na"`, `origin:"incident"`, `precondition` surfaced in `recommendedAction`. (Not `confirmed`, not `0.9`.)
2. **verdict-passthrough**: wrap the already-computed `PrefilterVerdict` into ONE `class:"info"`, `verifierVerdict:"uncertain"` (→ `needsHuman`), `origin:"incident"` Finding, `confidence ≈ 0.4`. This single producer covers threshold-exceeded, new-counterparty, AND the **no-live-threshold fail-safe** — all already encoded in `verdict.reason`/`verdict.amount`/`verdict.suspicious` (every event reaching triage is `notable:true`). **Does NOT re-run BigInt threshold compare or allowlist membership** — the prefilter is the single gate.
- `triageTrigger(ctx): Promise<void>` — `[...sigFindings, verdictFinding] → adjudicateFindings({ sessionId:`incident:${txId}:${contractId}:${fn}`, contractId, findings, tokenCostUsd:0, waivers: config.waivers }) → notify → recordSession({ route:"type2", tier:"monitor", auditTargets:[], signals, … })`.

Deterministic producer table:

| producer | check | `class` | `verifierVerdict` | `severity` | `confidence` | honesty |
|---|---|---|---|---|---|---|
| **signature-match** | `event.function_name === sig.fn` && (`!sig.asset` ∥ `sig.asset === event.asset_identifier`) | `bug` | **`uncertain`** | `sig.severity` (≥high → WARN) | `0.6` (correlation) | "proven-vuln fn INVOKED — verify precondition; not confirmed exploit" (B6) |
| **verdict-passthrough** | always (event is `notable:true`); reads `verdict.reason`/`amount`/`suspicious` | `info` | `uncertain` (→ `needsHuman`) | `medium`; `high` if `verdict.suspicious` | `0.4` | covers threshold / new-counterparty / **no-threshold fail-safe** (M9) — never a silent drain |

`class:"info"` on the passthrough keeps a generic "large/unscoped outflow" from ever implying a proven vuln or matching a centralization waiver. `class:"bug" + uncertain` on the signature match is honest (the bug is proven; *this invocation* is unverified) and is waiver-immune.

**`monitoring/adjudication.ts`** — reuse the pipe; in `adjudicateFindings` derive `origin` from kept findings (`all "incident"`→`"incident"`, `all "audit"`→`"audit"`, else `"mixed"`) and branch `recommendedAction` wording for `incident` (DETECTION). **Everything else unchanged:** `provisional` keys on `pocStatus==="pending"` (Type-2 is `"na"` ⇒ WARNs immediately, never enters PoC-promotion); `needsHuman` keys on `uncertain` (correct for unproven correlations); `alertLevel` keys on high/crit; `matchesWaiver` hard-excludes `class:"bug"`.

**`monitoring/notify.ts`** — logic UNCHANGED (warn-once keys on `sessionId/alertLevel/provisional/pocStatus`). ONE additive change (M10): `buildPayload` carries `origin` as a **REQUIRED** payload field (already on the `Adjudication`), so the inbox can hard-split the **PREVENTION lane** (veto/countdown) from the **DETECTION lane** (incident/forensics, no veto). Optionally also passes `confidence`. No warn-once logic changes.

**`monitoring/trigger-state.ts`** — `TriggerRecord`: ADD `route?: TriggerRoute` (forensics: incident vs proposal-audit) and `signals?: string[]` (which Type-2 producers fired). The synthetic `incident:*` sessionId keeps `notify` warn-once working. (`recordSession` already exists.)

**`docs/product/control-plane-ux.md` §4** — add the thresholds column (suggested→accept→arm, with the fail-safe wording), the "Known findings watched (detection signatures)" section, the latency-aware Type-1 veto/MISSED state, and the Type-2 action set (`[Notify project]`/`[Begin incident response]`/`[Acknowledge]` — no pause button unless `KBRecord.pauseFn` is set).

---

## 4. Data-model changes (concrete diffs)

**`monitoring/config.ts`**
```ts
import { Severity } from "./adjudication"; // SAFE: adjudication→{kb,trigger-state} are import type (erased); no cycle

// MOVED here from kb.ts (B1 — kb.ts must import this FROM config, never the reverse):
export const CentralizationWaiver = z.object({
  finding: z.string(),
  label: z.enum(["centralization", "by-design", "info", "low"]),
  note: z.string().optional(),
});
export type CentralizationWaiver = z.infer<typeof CentralizationWaiver>;

// SensitiveFn — ADD one advisory field (live gate unchanged; prefilter reads ONLY outflowThreshold):
export const SensitiveFn = z.object({
  name: z.string()/*…*/, triggerClass: TriggerClass,
  callerAllowlist: z.array(z.string()).default([]),
  outflowThreshold: OutflowThreshold.optional(),          // LIVE, human-promoted; prefilter reads this
  suggestedOutflowThreshold: OutflowThreshold.optional(), // GAP 1: audit suggestion; advisory, prefilter NEVER reads it
});

// NEW — Type-2 correlation key:
export const FindingSignature = z.object({
  title: z.string(),                  // the prior finding this concerns
  fn: z.string(),                     // event.function_name must equal this
  triggerClass: TriggerClass.optional(),
  severity: Severity.optional(),      // carried from the prior finding; drives WARN
  asset: z.string().optional(),       // ft id / 'stx' — narrows match if set (see Open-Q7)
  precondition: z.string().optional(),// the discriminator surfaced to the human (B6)
});
export type FindingSignature = z.infer<typeof FindingSignature>;

// MonitoringConfig — ADD two fields deriveConfig currently drops:
  signatures: z.array(FindingSignature).default([]),
  waivers:    z.array(CentralizationWaiver).default([]),
```
> `OutflowThreshold` stays `{asset, amount: z.string()}` — NO nullable amount / basis / reviewed (B2 — those would crash the candidate parse or touch the prefilter). "No on-chain cap" = the model omits the suggestion = client fills it; fail-safe in the meantime.

**`monitoring/kb.ts`** — DELETE the local `CentralizationWaiver`; `import { CentralizationWaiver, FindingSignature } from "./config"`. `PriorFinding`: `+ signature: FindingSignature.optional()`. `deriveConfig`: `+ waivers: rec.waivers, + signatures: rec.priorFindings.flatMap(f => f.signature ? [f.signature] : [])`.

**`monitoring/adjudication.ts`** — `Finding`: `+ origin: z.enum(["audit","incident"]).default("audit"), + targetFn: z.string().optional(), + targetAsset: z.string().optional(), + precondition: z.string().optional()`. `Adjudication` type: `+ origin?: "audit"|"incident"|"mixed"`. (`Severity` STAYS defined here; config imports it.)

**`engine/findings.ts`** — `FINDINGS_SCHEMA` items props: `+ targetFn:{type:"string"}, targetAsset:{type:"string"}, precondition:{type:"string"}` (NOT required). `KB_DISTILL_SCHEMA` `sensitiveFns` item props: `+ outflowThreshold:{ type:"object", additionalProperties:false, properties:{ asset:{type:"string"}, amount:{type:"string"} }, required:["asset","amount"] }` (NOT in `sensitiveFns.required`; **string amount, no null** — B2).

**`monitoring/trigger-state.ts`** — `TriggerRecord`: `+ route?: TriggerRoute, + signals?: string[]`.

**Optional (Open-Q1, M7)** `monitoring/kb.ts` `KBRecord` + `config.ts` `MonitoringConfig`: `+ pauseFn?: { contract: string; fn: string }` — populated only by an explicit human edit; gates whether the Type-2 WARN renders a "prepare pause tx" affordance.

**Net footprint:** 3 new fields on existing types + `precondition`; 1 new type (`FindingSignature`); 1 moved type (`CentralizationWaiver`); 1 routing enum + helper + shared const; `Finding.origin`/`targetFn`/`targetAsset`/`precondition` + `Adjudication.origin` (all optional/defaulted); 1 new dormant module (`incident-triage.ts`). **`notify.ts` logic, `audit.ts` audit flow, `runTrigger`, prefilter, and all PoC/provisional logic untouched** (notify gains a required `origin` passthrough only).

---

## 5. Sequencing & open questions

### MVP-PRODUCER (ship now)
- Shared `GOVERNANCE_CLASSES`/`TriggerRoute`/`routeForTriggerClass` (drift fix).
- GAP 1: `suggestedOutflowThreshold` (advisory) + distill schema/prompt (on-chain-cap-or-OMIT, never null); prefilter unchanged.
- GAP 2: `FindingSignature` (+`precondition`) + `PriorFinding.signature` + `MonitoringConfig.signatures`/`waivers` + `deriveConfig` projection + `targetFn`/`targetAsset`/`precondition` on `Finding`/schema; `targetFn∈sensitiveFns` validation.
- `CentralizationWaiver` move (B1); `Finding.origin`/`Adjudication.origin` types.
- Unit-tested via distill, zero chain.

### MVP-CONSUMER (gated to first engagement / Type-2 sub variant — dormant if early)
- Webhook Type-2 fork before `reserve` → `incident-triage.ts` (2 deterministic producers: signature-match + verdict-passthrough).
- DETECTION messaging + required `origin` payload split (M10); latency-aware Type-1 veto/MISSED gate (M8); Type-2 action set without pause button (M7); plan-screen thresholds + signatures sections.

### FOLLOW-ON (explicitly NOT MVP)
- Agent correlation pass (token-spend triage tier; near-zero `triage` entry in `TIER_ESTIMATE_USD`).
- LEARNED behavioral baseline (windowed rate / relative %) — replaces the flat 0.6/0.4 confidence table; needs a real flow profile.
- Confidence-gated `alertLevel` (low-confidence → INFO not WARN).
- Quantitative threshold from observed flow distribution (p99 / windowed) — needs token-balances subgraph + live flow.
- **Deterministic precondition matching** (amount-unbounded detection, caller-not-in-provenance, normally-dormant-fn flag) to auto-narrow signature matches — MVP surfaces precondition as text for the human.
- Real per-DAO timelock read + `estimated_audit_blocks` calibration (replace fixed 144 / hide-veto heuristic).
- Asset-aware / multi-arg amount decode (`firstUint` is asset-blind).
- **Type-2-shaped chain subs** — `provisioner`/`TriggerSource.create` emits ONLY `contract_call`; outflow/counterparty predicates + immediate-caller attribution (secondlayer f044) need a new `CreateSubParams` variant. **This is the gating dependency for MVP-CONSUMER.**
- `signature.pattern` matchers beyond `fn`+`asset`; distiller auto-anchoring `pocFile` (+ `Finding.pocFile`, Open-Q6); audit-generated positive `counterparty.new` baseline (stays human suppression-set).
- `KBRecord.pauseFn` + pre-filled-tx affordance (Open-Q1).

### Open questions (for the human — don't silently decide)
1. **Type-2 stop-further-loss:** does the client control an on-chain pause/guard? Determines whether `KBRecord.pauseFn` + a "prepare tx" affordance is worth building (default: guidance text only, no button).
2. **`confidence`→`alertLevel`:** is `uncertain`→WARN+needsHuman right for the verdict-passthrough, or should low-confidence (`<0.5`) go INFO-not-WARN (a FOLLOW-ON knob pulled into MVP)?
3. **Signature strictness:** `fn`-only (noisier) vs require `asset` (narrower). Proposed default: `fn` + `asset` when `signature.asset` is set, plus the `precondition` text as the human's final discriminator.
4. **Plan-edit persistence:** git-JSON `sentinel/kb/` vs DB (`control-plane-ux.md` Q2) — the new `suggestedOutflowThreshold`/`signature`/`pauseFn` fields raise the same question.
5. **`targetFn` reliability:** validated `∈ sensitiveFns[].name` in the distiller; unmatched ⇒ drop the signature (context-only, fail-open). Confirm acceptable.
6. **`pocFile` provenance:** `Finding` has no `pocFile`; the green-PoC path is known to `run_simnet_poc`/the engine, not the finding object. FOLLOW-ON: add `Finding.pocFile` or side-channel from the sandbox runner. Signature works without it.
7. **`asset_identifier` population (HARD PRECONDITION for asset-scoped signatures):** the field exists on `ChainEventBody` (`prefilter.ts:37`) but it is UNVERIFIED that the webhook payload populates it for `transfer.outflow` events. If unavailable, asset-scoped signatures **degrade to fn-only** and the false-positive risk rises — documented explicitly, and the `precondition` text becomes the primary discriminator.

**Relevant files:** `/Users/ryan/projects/audit-sentinel/monitoring/{config,kb,prefilter,adjudication,notify,trigger-state,audit-pipeline,directive}.ts`, `/Users/ryan/projects/audit-sentinel/engine/{findings,kb-distill,audit}.ts`, `/Users/ryan/projects/audit-sentinel/webhooks/secondlayer-webhook.ts`, NEW `/Users/ryan/projects/audit-sentinel/monitoring/incident-triage.ts`, `/Users/ryan/projects/audit-sentinel/docs/product/control-plane-ux.md`.

---

## Review notes

- **B1 (config↔kb import cycle):** RESOLVED. `CentralizationWaiver` MOVED into `config.ts`; `kb.ts` imports it (and `FindingSignature`) FROM config — the existing safe `kb→config` direction. `config.ts` never value-imports `kb.ts`. `FindingSignature.severity` imports `Severity` from `adjudication.ts`, which is cycle-free because `adjudication`'s `kb`/`trigger-state` imports are `import type` (erased) — verified at `adjudication.ts:18-19`.
- **B2 (nullable amount drops whole candidate):** RESOLVED via reviewer's option (b). The distill JSON schema's per-fn `outflowThreshold.amount` stays a plain `string`; the model is instructed to OMIT the threshold entirely when no on-chain cap exists (never emit `null`). `OutflowThreshold`/`SensitiveFn` are unchanged, so the single `KBCandidate.safeParse` cannot fail on a `null`. No `basis` enum; "no cap" = absent suggestion + fail-safe.
- **B6 (fn-match emitted as confirmed CRITICAL):** RESOLVED. Signature match now emits `verifierVerdict:"uncertain"` + `needsHuman:true` + `confidence:0.6` (correlation), with a correlational headline and the audit-recorded `precondition` surfaced as the human's discriminator. `class:"bug"` is retained (the bug is proven, and it is waiver-immune) but never asserts THIS call is the exploit. Open-Q7 documented as a hard precondition (asset-scoped → fn-only degradation raises FP).
- **M3 (`f.pocFile` TS error):** RESOLVED. The `pocFile` line is DROPPED from the `kb-distill` map for MVP; `Finding` does NOT gain `pocFile`. Signature works without it; `pocFile` anchoring deferred to FOLLOW-ON (Open-Q6).
- **M4 (triage redundancy / wrong altitude):** RESOLVED. The `PrefilterVerdict` is passed into `triage`; triage runs only signature-match (new work) + one verdict-passthrough mapping. No re-running of BigInt threshold compare or allowlist membership — the prefilter stays the single gate. Three producers collapsed to two.
- **M5 (consumer built ahead of its source):** RESOLVED. MVP split at the seam — PRODUCER half (scope generation, unit-testable, zero chain) ships now; CONSUMER half (webhook fork + `incident-triage.ts` + UI) is gated to the first engagement / the Type-2 subscription variant, kept pure/dormant if it lands early.
- **M7 (pause button Sentinel can't action):** RESOLVED. Type-2 actions = `[Notify project]`/`[Begin incident response]`/`[Acknowledge]` only; stop-further-loss is guidance text. A pause affordance appears only if `KBRecord.pauseFn` is explicitly set, framed as a pre-filled tx for a human to sign. New locked honesty line added; gated by Open-Q1.
- **M8 (Type-1 latency overclaim):** RESOLVED. New locked honesty line; the WARN UI computes `remaining_blocks − estimated_audit_blocks` and either shows the veto window or flips to "MISSED — detection only" and HIDES the veto button. The honesty gate ships in MVP-CONSUMER; real per-DAO timelock + audit-block calibration deferred.
- **M9 (lost fail-safe on untuned outflow):** RESOLVED. The verdict-passthrough producer fires for every notable event, so a no-live-threshold outflow (which reaches triage as `notable:true`, reason "no outflow threshold configured — fail-safe") always surfaces as a `needsHuman` INFO — no silent drain. §2.2(c) wording corrected to "fail-safe-triaged" (Type-2 does not audit).
- **M10 (PREVENTION vs DETECTION legibility):** RESOLVED. `origin` is REQUIRED on the notify payload (additive, already on the `Adjudication`, no warn-once logic change), and the inbox hard-splits a PREVENTION lane (veto/countdown) from a DETECTION lane (incident/forensics, no veto).
