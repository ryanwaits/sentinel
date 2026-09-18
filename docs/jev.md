# Jev overlays — Technical Walkthrough

## What it does

Sentinel still decides with code. Jev (TypeSafe's System One model) sits on four judgment points where we used to use a brittle heuristic or an expensive LLM, and returns a **typed choice + calibrated confidence**. High confidence → we take the answer. Low confidence / no key / failure → the old path runs unchanged. It does not generate prose, it does not disclose, it does not act on-chain.

## How it flows

```
.env.local  JEV_API_KEY (or TYPESAFE_API_KEY)
  → monitoring/jev.ts  (impure edge: systemOne)
    → null if SENTINEL_AUDIT_MOCK | SENTINEL_JEV=0 | no key | request fail

Type-2 webhook
  → classify()                deterministic
  → classifyMaybe()           Jev only on fail-safe notables (drop floor 0.85)
  → triageFindings()          deterministic (signatures untouched)
  → refineAnomaly()           Jev severity overlay (floor 0.6)
  → resolveWaivers()          Jev semantic waiver (waive floor 0.75)
  → adjudicateFindings()      still pure; takes waived[]
  → notify                    human-gated

Type-1 / on-demand audit
  → audit()                   Opus/Sonnet unchanged
  → resolveWaivers()          same overlay
  → adjudicateFindings()

KB distill
  → audit emits kbCandidate.archetype
  → classifyArchetype()       Jev overlay (floor 0.6); human still promotes the candidate

Discover
  → rankTargets()             USD desc, unchanged
  → annotateTargets()         Jev adds tier + attackSurface; does not reorder
```

## Why Jev, not another LLM call

Jev is a **decision model**, not a chat model. We send `state` + closed-set questions (`choice` / `noul`); we get back a label, a probability distribution, and a confidence. No JSON-recovery from prose. No extra Opus turn.

Live numbers from `bun run monitoring/jev-spike.ts` (2026-09-17):

| overlay | latency | input tokens | cost at $0.042/MTok |
|---|---|---|---|
| anomaly severity | 167–365ms | ~750 | ~$0.00003 |
| archetype | ~176ms | ~520 | ~$0.00002 |
| waiver match | ~151ms | (one batched call) | pennies |
| fail-safe | ~192ms | — | pennies |
| discover fan-out (2 targets, 4 questions) | 142ms | 918 | ~$0.00004 |

A Monitor-tier audit is ~$2 and minutes. Jev is four orders of magnitude cheaper and ~150ms, which is why it can sit on the webhook hot path without becoming a new spend class. Output tokens are free; we only pay for the state + questions.

This is important — Jev does **not** replace the auditor panel, the verifier, or the simnet PoC. Those are System 2. Jev is System 1: snap judgments our code already had to make.

## The four overlays

All four live as functions on `monitoring/jev.ts`. Domain modules own **when to trust** the answer. `jev.ts` owns **the question**.

### 1. Type-2 anomaly severity — `refineAnomaly`

**Before.** `monitoring/incident-triage.ts` scored outflows with magic numbers: amount > historical max → high/0.55; > 2× p99 → high/0.5; new recipient → high/0.5; else medium/0.4. Signature-match stayed (and stays) `uncertain`/0.6 — a correlation, never a confirmed exploit.

**After.** Heuristic still runs. Jev sees event + baseline + the heuristic prior, returns `severity` ∈ {critical, high, medium, low, info} and a `likely_exploit` noul. Conf ≥ 0.6 replaces severity/confidence; below that we keep the heuristic and annotate `recommendedAction`.

Live:

| case | heuristic | Jev | applied |
|---|---|---|---|
| 5e12 STX to unknown, ≫ max 2e9 | high / 0.55 | **critical** conf 0.79, exploit-p 0.78 | critical |
| within p99, known recipient | medium / 0.40 | medium conf **0.98**, exploit-p 0.15 | medium |
| new recipient, amount in p99 | high / 0.50 | high conf 0.86, exploit-p 0.35 | high |
| fail-safe, no amount | medium / 0.40 | medium conf 0.67, exploit-p 0.46 | medium |

Same labels on the quiet cases, **calibrated confidence** instead of 0.4/0.55, and the attacker-shaped drain upgrades to critical. Signature-match findings are never sent to Jev.

### 2. KB archetype — `classifyArchetype`

**Before.** Archetype came from the Opus audit's `kbCandidate`, or `"other"` if the audit forgot to emit one. `"other"` → Monitor tier via `tierForArchetype`. A missed DAO got a cheap panel.

**After.** `engine/kb-distill.ts` still prefers the LLM. Jev overlays when conf ≥ 0.6. The candidate still lands in `sentinel/kb/_candidates/` — a human promotes it. Jev does **not** invent `sensitiveFns` or `triggerClass` (wrong triggerClass silently reroutes type1 ↔ type2).

Live: `v0-vault-sbtc` with prior `"other"` → **vault conf 1.00** in 176ms. `pox-4` → `other` conf 0.45 (abstain, kept prior). Uncertain is a feature.

### 3. Waiver matching — `resolveWaivers`

**Before.** `matchesWaiver` was `hay.includes(needle) || needle.includes(hay)` after stripping punctuation. Semantic matches missed ("vault owner can pause deposits" vs "admin pause is an accepted trust assumption"). False substring hits dropped real findings.

**After.** `adjudicateFindings` stays **sync and pure**. Callers that can await (`audit-pipeline`, `incident-triage`, `invariant-pipeline`) pass `waived: await resolveWaivers(...)`.

Floors are asymmetric on purpose:

- **Waive** (drop an alert) requires conf ≥ 0.75. False suppression is the expensive mistake.
- **Un-waive** a substring false-positive requires conf ≥ 0.6. Keeping a finding is the safe direction.
- `class: "bug"` is never waived, Jev or not.

Live: substring missed the pause waiver; Jev set `waived=true` in 151ms.

### 4. Prefilter fail-safe — `classifyMaybe`

**Before.** No threshold, or an undecodable amount → always notable. Fail-safe is correct — we never silently drop a drain — but it also spends on garbage.

**After.** `classify()` is still the pure gate. `classifyMaybe` asks Jev **only** when the reason contains `"fail-safe"`. Jev may flip notable → benign at conf ≥ **0.85**. It cannot:

- make a below-threshold outflow notable
- make a governance call un-notable
- drop a fail-safe below 0.85 (abstain = spend)

Live: undecodable amount stayed notable. That's the conservative read we want until we have a real baseline of fail-safe events.

Webhook path (`webhooks/secondlayer-webhook.ts`) now awaits `classifyMaybe` instead of `classify`. Under `SENTINEL_AUDIT_MOCK` this is a no-op.

### 5. Discover annotation — `annotateTargets` (bonus, not a reorder)

**Before.** `rankTargets` sorted by curated USD. Honest, and it stays that way.

**After.** One Jev call fans out a `tier` + `attackSurface` question per target. USD order is unchanged. CLI prints `jev deep/high` next to the dollar figure so we know to Deep-audit a vault even when a larger but boring treasury sits above it.

Live: `$2.4M v0-vault-sbtc` → deep/high conf 0.86; `$1.2K SP.x.token` → monitor/low conf 0.86; 142ms for both.

## Why confidence floors scale with blast radius

TypeSafe's own guidance: the threshold is not one number. Dropping a fail-safe event skips an audit (~$2 and a possible drain). Waiving a finding suppresses an alert. Relabeling severity from medium → high only changes WARN vs INFO.

```
SENTINEL_JEV_CONFIDENCE=0.6          overlay (severity, archetype, discover)
SENTINEL_JEV_WAIVE_CONFIDENCE=0.75   suppress a finding
SENTINEL_JEV_DROP_CONFIDENCE=0.85    skip spend on a fail-safe
SENTINEL_JEV=0                       kill switch
SENTINEL_AUDIT_MOCK=1                tests, never spends
```

`jevEnabled()` is false under mock even if a key is present. Tests inject the classify fn; they never need the network.

## Integration shape

Follows the existing impure-edge pattern (`render-summary.ts`: LLM with template fallback).

- `monitoring/jev.ts` — `systemOne` + the four classifiers. Only place `@typesafe-ai/sdk` is imported.
- Domain modules keep post-processing pure and accept an injectable classify fn.
- `adjudicateFindings` / `classify` / `rankTargets` / `triageFindings` remain unit-testable without Jev.

Key is `JEV_API_KEY` or `TYPESAFE_API_KEY` in `.env.local`. SDK default model is `jev-latest`.

## What this does for the product

Sentinel's pitch is **audit-informed monitoring**, not another chatbot. Jev is the missing middle:

1. **Fewer dumb pages, fewer missed pages.** Calibrated confidence on Type-2 outflows. Semantic waiver match so a restated centralization finding doesn't re-page, and a substring collision doesn't hide a new one.
2. **Spend the $2 audit on the right contracts.** Archetype overlay stops `"other"` from silently selecting Monitor. Discover annotation tells us Deep vs Monitor without reordering the honest USD rank.
3. **Fail-safes get a brain without losing the fail-safe.** Garbage events can be dropped at 0.85; anything shakier still spends. The drain we can't decode still pages.
4. **A story we can tell clients.** "We don't generate an explanation of why we paged you. We return a typed severity with a confidence, and below the floor a human still sees the heuristic." That's the house voice applied to the decision layer.
5. **Headroom.** The same `systemOne` helper is how we later overlay intent routing (which auditor panel?), RAG-passage screening before the verifier, or skill suggestion inside the orchestrator — without another Opus turn.

What we will not do with it: generate finding prose (`render-summary.ts` stays Haiku/template), certify exploits (`gates.ts` stays structural), or raise the daily spend ceiling.

## How to test it

1. Unit tests (no network): `bun run test` sets `SENTINEL_AUDIT_MOCK=1`. 217 pass.
2. Live overlay check (spends pennies):

```
bun run monitoring/jev-spike.ts
```

Expect four anomaly rows, an archetype pair, a waiver, a fail-safe keep, and a two-target discover annotation. Kill with `SENTINEL_JEV=0`.

3. Webhook path: `SENTINEL_AUDIT_MOCK=1 bun run webhook` — `classifyMaybe` short-circuits to `classify`.
4. Distill path: `. ./.env.local && bun run distill <contractId>` — watch for `[jev] archetype …` on the candidate.

## What's deferred

- **triggerClass overlay on `sensitiveFns`** — a wrong class silently flips type1 (spend an audit) ↔ type2 (triage). Not worth it until we have a labelled set.
- **`mcp__sentinel__jev_decide` tool** — the agent doesn't need to ask Jev yet; the pipeline does.
- **Replacing Opus `kbCandidate`** — Jev overlays, it doesn't skip the audit's own classification.
- **Reordering `rankTargets` by Jev** — USD rank is a credibility invariant.
- **`gates.ts` / `spend-ceiling.ts` / `render-summary.ts`** — structural honesty, cost cap, and free-text generation. Not typed decisions.
