# Product model — Sentinel: audit-informed, context-aware, Stacks-native monitoring

Aligning the product shape (confirmed 2026-06-27). Sentinel is **ONE focused product —
continuous security monitoring for Stacks smart contracts.** The deep-**audit engine is a
tiered, triggerable *capability* inside it**, not a co-equal sibling product. Audit is how
Sentinel understands contracts well enough to watch them intelligently; monitoring is what
makes it a product. The wedge: **audit-informed, context-aware, Stacks-native monitoring**
— vs. one-off human auditors (hand you a PDF and leave) and generic chain-alerting (dumb;
doesn't know your contract). Below: Audit (the capability) then Monitor (the product).

## 1. Audit — point-in-time assurance ("is the code safe?")
Static analysis of contract code: the 8-dimension auditor fan-out → adversarial verify
→ reproduce-before-ship PoC. Honest bug-vs-centralization labeling.
- **When:** onboarding, pre-launch, on major upgrade, on-demand deep — AND **reactively,
  fired by monitoring triggers** (see "Audit-on-trigger" below). It's a capability, not a
  calendar event.
- **Output:** report + verified findings + green PoCs **+ the protocol's "safety model"**
  — privileged fns, trust assumptions, invariants, the dependency/extension graph. This
  artifact is the seed for Monitor.
- **Pricing:** depth is a dial within the subscription; standalone Deep/Launch audits for
  non-subscribers (see business-model.md service tiers). Cost ≈ **~$2/sweep** (tiered),
  which is what makes reactive auditing viable.

### Audit-on-trigger — the fusion (cheap audit as a reactive monitoring primitive)
Because a full sweep is ~$2, the monitoring layer can **fire audit-grade analysis
reactively**, not just at milestones. This is the killer feature that fuses the two halves:
- **Governance proposal submitted** → audit the proposal contract *during the timelock,
  before it executes* (directly defeats the Beanstalk/Charisma malicious-proposal class).
- **Upgrade / impl-swap detected** → auto-audit the new code; alert on new findings. (The
  legitimate, valuable version of "re-audit on change" — a triggered feature, not the core.)
- **New contract authorized or interacting** (incl. ninja contracts) → audit the
  counterparty; flag if hostile.
- **Behavioral alert raised** → audit-grade adjudication of the involved contracts: real
  threat vs noise.
Tier by stakes: routine/frequent triggers run Monitor-tier (Sonnet auditors); high-stakes
triggers (a live proposal over a $20M treasury) run Deep-tier (all-Opus).

## 2. Monitor — continuous behavioral surveillance ("is something dangerous happening NOW?")
**NOT re-auditing code on change** (that's the weak framing — code is static most of the
time). Watching the live **activity / flows / interactions / governance actions** of the
client's contracts, scoped to their KB/context from the audit, in real time. Powered
entirely by secondlayer.

### What it watches (via secondlayer)
Asset flows (depth-independent — value leaving a protected contract at any call depth),
contract interactions (who calls privileged fns, incl. unrecognized/"ninja" contracts),
governance actions (proposal submit/execute, new authorized extension, upgrades),
large/odd movements, and the **mempool** (pre-confirmation warning before a tx mines).

### Triggers — three layers
1. **Default / built-in** — generic dangerous patterns: unrecognized contract calls a
   privileged fn; large/anomalous outflow; new authorized extension or upgrade;
   governance proposal submitted/executed; mempool pre-confirmation of a risky call.
2. **Client-configured (advanced config)** — protocol-specific: custom thresholds,
   watchlists of sensitive fns/principals, invariants to watch ("alert if total-assets
   drops >X%", "warn on any `socialize-debt` call", "flag every new authorized-contract"),
   severity routing/escalation rules.
3. **Context-aware anomaly** — "abnormal *for this protocol*," using the audit's
   understanding of what normal looks like and where the danger concentrates.

### When a trigger fires
→ the audit/judgment engine (governance + access-control auditors, etc.) **adjudicates**
severity (is this hostile? expected? trust-model-by-design?) → alert / warn / escalate.
**Action is human-gated** (disclosure, pause recommendation, client notification).

- **Pricing:** the **retainer (recurring MRR)** — the primary motion. Tiered by config
  depth + coverage + monitor model tier (Monitor = Sonnet auditors / Opus verifier).

## The synergy (why one platform, not two)
**Audit produces the safety model → seeds smart, protocol-specific Monitor triggers →
Monitor watches via secondlayer → fires context-aware alerts → audit engine adjudicates →
real incidents refine the KB + triggers.**
- The audit makes monitoring **smart** — generic monitoring is dumb; ours knows the
  protocol's privileged paths, trust assumptions, and invariants.
- Monitoring makes the audit's value **continuous** — it delivers even when code is
  static (which is most of the time), which is exactly why it's a far stronger recurring
  product than "re-run the audit weekly."

## Why secondlayer (and why explorers/generic tools can't)
The behavioral signals — inner-call attribution by effect (asset events), mempool
pre-confirmation, real-time filtered subscriptions, watchlists — are exactly secondlayer's
decoded-data surface, and the gap explorers structurally can't fill (see
[backlog.md](./backlog.md) monitor wedge + secondlayer primitive survey). The audit
judgment stays in audit-sentinel; the data primitives live in secondlayer
(primitives-down / judgment-up, per business-model.md).

## Revenue shape
- **Audit** (one-off, Deep tier): pre-launch + on-upgrade + onboarding.
- **Monitor** (retainer, recurring): continuous behavioral surveillance — the primary MRR
  and the defensible moat, because it's value-per-month independent of code changes and
  smart in a way only an audited-context + secondlayer pairing can be.
