# Sentinel — The three audit gates (auto vs client-interactive)

> The **decision architecture** behind the audit surface. Complements
> [control-plane-ux.md](./control-plane-ux.md) (which designs the screens/journey) — this doc is the
> model *underneath* it: where a human/client decides vs where the engine runs unattended. Grounded in
> real files: `engine/audit.ts`, `engine/discover.ts`, `engine/gates.ts`, `engine/tools/run-simnet-poc.ts`,
> `monitoring/{audit-pipeline,adjudication,notify,scheduler}.ts`, `web/src/routes/onboarding.tsx`.
> House style: terse, sacrifice grammar.

## The frame

An audit is not one action; it's **autonomous work punctuated by decision gates**. The multi-agent
engine runs *inside* a gate-to-gate span with zero human input (it fetches, follows dependencies,
audits, adversarially verifies, attempts PoCs, adjudicates). The **gates** are the handful of points
where "how deep / where next / is it worth proving / do we tell them" get decided.

Two modes handle those gates — **the same engine, different gate-handling**:

- **Fully-auto** — the engine passes every gate on heuristics and runs to a result, stopping only where
  a human is *mandatory*. → This is the **monitoring path**, and it is **shipped + proven live**.
- **Client-interactive** — each gate is surfaced to the client with cost + a recommended default; they
  steer spend/depth. → This is the **on-demand / onboarding audit path**, mostly **to build** (the web
  onboarding is the seedling).

We deliberately do **not** ship a third "analyst-run / managed-retainer" mode as product. Internally we
*operate* the interactive gates by hand today (this dogfooding session is exactly that) — but that's a
bootstrap, not the product surface.

Status legend: ✅ shipped · 🔵 partial · ⏭ next · 🔶 later

---

## Gate 1 — Scope

**The decision:** which contract(s) to audit, at what **tier** (`monitor`=Sonnet/triage vs `deep`=Opus/full),
and which **discovered dependencies** to pull in as new top-level targets.

**Subtlety (the auto/manual seam):** dependency-following *within* one target is automatic — an audit of
`vault-hbtc-v1` auto-fetches `state-hbtc-v1`/`reserve-hbtc-v1`/`hq-v1`. Choosing a dependency as a **new
focus** (e.g. reserve → then audit the vault) is a *scope* decision, currently human.

| | Fully-auto (monitoring) | Client-interactive (on-demand) |
|---|---|---|
| **What decides** | trigger class → tier route (`audit-pipeline` per-class pre-filter + `tierForArchetype`); discovery ranks candidates by $-at-risk (`engine/discover.ts`) | client picks targets + tier from a ranked list of their protocol + discovered deps |
| **Status** | ✅ trigger→tier routing; ✅ discovery ranking; ✅ in-run dep-follow | ⏭ ranked scope picker + tier/widen choices in onboarding (`StepAdd` connects ONE contract today; no dep surfacing, no tier choice) |

**To build (interactive):** after a first audit, surface *"found `vault-hbtc-v1` ($9.9M at risk) as a
dependency — audit it? [Deep ~$5 / Monitor ~$1 / Skip]"*. Feed it from `discover.ts` + the run's
dependency set.

---

## Gate 2 — Proof

**The decision:** reproduce a confirmed finding in the **airgapped simnet sandbox** (`run_simnet_poc`,
`docker run --network none`) before it counts as real.

**Load-bearing rule (already structural):** `engine/gates.ts` forces any self-labeled "confirmed"
without a verifier pass down to `uncertain`, and any **bug-tier high/crit** without a green/pending PoC
to `pending` — a finding structurally **cannot skip** verify, and a bug cannot ship "confirmed" without a
PoC attempt. This is the false-positive control / credibility moat.

| | Fully-auto (monitoring) | Client-interactive (on-demand) |
|---|---|---|
| **What decides** | panel auto-attempts a `pocSource` PoC in-run for tractable bugs; `gates.ts` enforces the PoC requirement; `adjudicate` consumes `pocStatus` | client sees confirmed findings → *"reproduce in sandbox? [~$Y]"*, gets green/failed back |
| **Status** | ✅ in-run auto-attempt; ✅ structural gate; ✅ adjudication consumes `pocStatus` | 🔶 client-triggered repro button; 🔶 **complex** PoCs still hand-built (`simnet/poc/finding-1.ts` pattern) until the auto-PoC engine |

**Reality check:** auto-PoC works for tractable bugs; complex privileged/multi-contract accounting bugs
still return `pocStatus:na` and get a **hand-built** PoC. The full **auto-PoC-generation engine** (Phase 4)
is a real eng bet — its go/no-go is *gated on the ROI of hand-built PoCs*, which is one of the things the
validation sweep measures.

---

## Gate 3 — Disclosure

**The decision:** send a coordinated whitehat report to the affected protocol.

**Permanent rule — never auto, by design.** Coordinated/responsible disclosure, no public PoC before a
fix, honest bug-vs-centralization labeling. The pipeline **drafts + alerts**; a **human sends**. This gate
does not get a "fully-auto" column — ever.

| | Both modes |
|---|---|
| **What decides** | `adjudicate` → `notify` raises a **human-gated** alert (warn-once, promote-on-escalation); it **never auto-discloses** |
| **Status** | ✅ alerting egress (HMAC-signed, warn-once); ⏭ draft-disclosure-from-findings → review → send/track flow (not built as a surface) |

**To build (interactive):** *"3 confirmed findings on `state-hbtc-v1` — draft coordinated disclosure →
[review & send]"*, with response tracking. The draft is generated; the send is always a person.

---

## Where we sit (one glance)

| Gate | Auto connective tissue | Client-interactive surface | Human-mandatory? |
|---|---|---|---|
| **Scope** | ✅ discovery rank + tier route + dep-follow | ⏭ ranked picker + tier/widen choices | no (client optional) |
| **Proof** | ✅ in-run PoC attempt + structural gate | 🔶 repro button + complex auto-PoC | no (client optional) |
| **Disclosure** | — (never auto) | ⏭ draft → review → send/track | **yes, always** |

**Read:** the *monitoring* path already runs Scope→Proof automatically and stops at the Disclosure gate
(human) — that's the shipped fully-auto mode. The *on-demand/onboarding* path needs the three interactive
surfaces built on top of the same engine + `discover.ts`. The engine is the autonomous work **between**
gates; the gates are the only places a person appears.

## How it maps onto the built onboarding

`web/src/routes/onboarding.tsx` today: `StepAdd` (connect/upload one contract) → `StepAudit` (run + poll
the worker) → `StepPlan` (watch-plan review/edit — the `MonitoringConfig` surface from control-plane-ux #4–5).
That covers a **single-contract Scope → audit → monitoring handoff**. Missing, in gate terms: the
**dependency-aware Scope picker** (Gate 1 widen/tier), the **Proof** repro button (Gate 2), and the
**Disclosure** draft/send flow (Gate 3).

## Open questions

- **Scope auto-widen policy:** in fully-auto (monitoring), may the engine escalate to audit a *newly
  discovered* dependency on its own (by $-at-risk threshold), or is cross-contract widening always a
  client/human choice? (Ties to README OQ#5 re-audit merge.)
- **Proof spend consent:** is a PoC attempt always inside the audit budget (auto), or a separate
  client-approved spend at Gate 2?
- **Auto-PoC go/no-go:** build the Phase-4 auto-PoC engine, or keep complex PoCs hand-built? Decide on the
  validation sweep's hand-built ROI (see [../roadmap.md](../roadmap.md) Phase 3).
