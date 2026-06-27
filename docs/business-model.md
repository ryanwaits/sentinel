# Business Model — audit-sentinel

Working hypotheses. **Estimates, not gospel — revisit as validation data lands**
(see [validation-sweep.md](./validation-sweep.md)). Stacks-only wedge for now.

## What it is (positioning)
Continuous, **reproduction-backed** asset-safety monitoring for Stacks. Not "an AI
auditor." Defensible because of the **credibility engine**: a finding doesn't
exist until it survives adversarial refutation AND exploits successfully in an
airgapped Clarity VM, labeled honestly bug-vs-centralization.

The moat is the *method + the accumulating corpus of verified PoCs*, not the model.

## Product boundary — powered-by-secondlayer (the load-bearing rule)
audit-sentinel is a **separate product/business** that is a **client of secondlayer's
PUBLIC API**, not a feature inside secondlayer. We dogfood the same surface any
customer uses (enforced by the hard rule in [../CLAUDE.md](../CLAUDE.md): depend ONLY
on published `@secondlayer/*`). Why separate: different buyers (builders vs protocols),
different GTM/pricing (usage/devtool vs retainer/outcome), and reputation/liability
isolation (a security product makes adversarial, opinionated calls + carries disclosure
risk that must NOT attach to neutral infra). Being secondlayer's most demanding client
is the roadmap flywheel — our needs pull primitives into the platform.

**The boundary principle (use this to decide where any new capability lives):**

> **Generic detection primitives push DOWN into secondlayer; opinionated security
> judgment stays UP in audit-sentinel.**

- **Down (secondlayer, reusable by any security vendor):** decoded/queryable on-chain
  data, immediate-caller / call-stack attribution, mempool feeds, real-time
  subscriptions / watchlists, event indexing. Infra primitives every monitor wants.
- **Up (audit-sentinel, opinionated + proprietary):** "is this interaction hostile?",
  the auditor/verifier panel, reproduce-before-ship, bug-vs-centralization labeling,
  disclosure workflow, the verified-PoC corpus.

This keeps secondlayer broadly valuable (a platform security vendors build on, not a
narrow security tool) and audit-sentinel a thin, high-margin judgment layer. When a
capability is generic and every security vendor would want it (e.g. call-stack
decoding), scope it as a secondlayer primitive — don't bury it in the app.

### Communication
Anchor against two enemies:
- **One-off human audits** → stale the instant code/state changes; we're *continuous*.
- **AI-audit slop** → unverified false positives; we *only report what we can
  exploit in a sandbox*.

One-liners:
> "We don't report a vulnerability unless we can exploit it in a sandbox first."

> "Continuous asset-safety monitoring for Stacks — every finding ships with a
> runnable proof."

Tone: technical, skeptical, honest. Lead with the Zest sBTC Finding 1 artifact
(green PoC, 15/15, locked-sats number). Real reproduction > pitch deck.

## Market reality (needs validation)
Stacks is small: likely *low hundreds* of value-holding contracts, *tens* with
meaningful TVL; ecosystem DeFi TVL historically ~$100–200M-ish, expanding
post-sBTC. → On Stacks alone the TAM is thin.

**Strategic implication:** Stacks is the wedge/proof. The scalable asset is the
reproduce-first *methodology* (portable to other Clarity chains; pattern
generalizes). Don't over-invest assuming Stacks-only is a big business.

## One product: Sentinel (security monitoring); audit is a capability within it
Sentinel is a **single, focused product — continuous security monitoring for Stacks
smart contracts.** The deep-**audit engine is a tiered, *triggerable* capability inside
it**, not a sibling offering. Run it at onboarding / pre-launch / on-upgrade / on-demand
(Deep tier) — and, because a full sweep is only ~$2, fire it **reactively from monitoring
triggers**: a governance proposal submitted (audit it *during the timelock, before it
executes*), an upgrade/impl-swap detected (audit the new code), a new contract authorized
or interacting (audit the counterparty), or a behavioral alert raised (audit-grade
adjudication: real threat vs noise). Audit is how Sentinel *understands* contracts well
enough to watch them intelligently, and the highest-assurance pass on demand. The
recurring product is the monitoring subscription; audit depth + trigger frequency is a
dial within it. See [monitoring.md](./monitoring.md).

## Revenue streams (ranked by quality)

| Stream | Recurring? | Variance | Notes |
|---|---|---|---|
| **Continuous-monitoring retainer** | ✅ | low | the real business; predictable MRR. **Primary motion.** |
| One-off audit | ❌ | med | services; funds runway, undercuts slow human firms |
| Disclosure bounties | ❌ | high | opportunistic; bootstrap + marketing |
| Whitehat salvage | ❌ | very high | legally fraught; counsel sign-off; do NOT anchor the model here |

**Primary motion: retainer-first.** Documented now, build the monitoring/dashboard
product as we approach it — revisit after validation.

## Service tiers = model tiers (packaging — validated by COGS)
The model-tiering (see COGS below) doubles as a **service-level ladder**: same pipeline,
swap the *auditor* model by depth. **Load-bearing principle — the credibility floor is
constant across tiers:** the **Opus verifier + green simnet PoC** run at EVERY tier, so
no tier ever ships an unverified or worse-quality finding. Higher tiers buy wider
**recall** (subtler-candidate coverage), not better precision — exactly what a high-stakes
moment (a launch) pays for.

| Tier | Auditors / Verifier | When | Maps to | Rough $ |
|---|---|---|---|---|
| **Monitor** (default) | Sonnet / **Opus** | continuous, on-change retainer monitoring | retainer MRR | ~$2–5/sweep COGS |
| **Deep / Launch** | **Opus** / **Opus** | pre-launch, major upgrade, post-incident, onboarding | one-off audit (premium) | ~$3–8/sweep COGS |
| **Max / Adversarial+** | Opus, N-pass per dim + multi-vote verify + deep PoC | top-TVL, pre-mainnet, bounty-grade | premium / enterprise | higher; scope-priced |

Why it sells: it's a natural **upsell on the same product** — "your retainer runs
continuous Monitor-tier; upgrade to a Deep all-Opus pass for your v2 launch." Honest,
because every tier is reproduce-backed; the premium buys assurance-of-completeness, not a
different credibility bar. (Implementation is trivial — parameterize the auditor model by
a run-time `depth`/tier; verifier stays Opus. See backlog.)

## Pricing hypotheses (validate, don't commit)
- **Retainer:** ~$2–8k/mo per protocol, tiered by TVL/complexity. Frame as
  insurance — for a protocol holding $10M+, $5k/mo is trivial.
- **One-off audit:** ~$15–40k/engagement — cheaper + faster than human firms
  ($30–100k+), continuous re-runs included.
- **Bounties:** industry norm ~5–10% of funds at risk (Immunefi-style caps).
- **Salvage:** ~10% whitehat fee (common norm).

### Unit economics — COGS (measured, gateway dashboard)
- **All-Opus, ~7-dim sweep (track-A, Zest 1046-line vault, 2026-06-26):** ~$18.27 /
  3.2M tokens across ~4–5 full-ish runs → ≈ **$3–4/sweep** (approx; mixed w/ probes).
- **Tiered, 3-dim sweep (CCD002 MIA treasury, 2026-06-27): $1.84 total** / 313K tokens
  / 17 requests. Model split: **Opus (verifier + orchestrator) ~$0.91+, Sonnet (3
  auditors) ~$0.20.** → the Opus verify/orchestrate path is now ~80% of spend; the
  cheap Sonnet auditors are ~$0.20. A full 8-dim tiered sweep extrapolates to ~$3–5
  (more auditors stay cheap; more Opus verifier calls drive cost).

**Takeaway:** ~$2–5 to adversarially audit a $10–20M contract vs. a $15–40k human
audit. COGS is the cost center for *quality* (Opus verify), not breadth (Sonnet
auditors). Trivial vs retainer at any sane cadence; the moat stays method + PoC corpus.

**Implication:** COGS is trivial vs the retainer. Weekly re-audits ≈ ~$12–16/mo
compute; daily ≈ ~$90–120/mo — **sub-1% of a ~$2–8k/mo retainer even at daily
cadence.** Confirms the model is neither the constraint nor the moat; we can run
aggressive continuous re-audit cadence (the core value prop) without denting margin.
The moat stays the method + verified-PoC corpus.

### Rough bootstrap scenario (illustrative)
3–5 retainers @ ~$4k = ~$12–20k MRR + 1–2 opportunistic bounties/yr. Lean-team
sustainable wedge, not a venture outcome — the honest read for Stacks-only. Upside
lever = multi-chain / self-serve scanner productization.

## Disclosure stance — PURE WHITEHAT
Decided. Coordinated disclosure only; no public PoC before a fix.

Rationale:
- It's the *same trust we're selling* — can't sell monitoring to a protocol while
  racing strangers to exploit it. Every clean disclosure is a warm retainer lead.
- Legal posture: avoids CFAA-style / "was this authorized?" exposure.
- whitehat ≠ no money: still accept bounties offered via official programs through
  coordinated disclosure.
- Salvage stays optional, case-by-case, behind counsel.

## Market validation moves (cheap, do first)
1. Run the pipeline against 3–5 real top-TVL protocols (see validation-sweep.md).
2. Responsibly disclose. Their *reaction* (engage / pay / ignore) is the signal.
3. "We found + reproduced X in protocol Y" writeup = marketing + demand-test.

## Open questions (revisit with validation data)
- Retainer pricing tiers — TVL-based vs contract-count vs flat?
- Does the small Stacks TAM justify building the dashboard, or stay services-led
  until multi-chain?
- When to make the auto-PoC-gen eng bet (gated on hand-built PoC ROI data)?
- Multi-chain / self-serve scanner as the real scale story — when to test it?
