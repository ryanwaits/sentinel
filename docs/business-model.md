# Business Model — audit-sentinel

Working hypotheses. **Estimates, not gospel — revisit as validation data lands**
(see [validation-sweep.md](./validation-sweep.md)). Stacks-only wedge for now.

## What it is (positioning)
Continuous, **reproduction-backed** asset-safety monitoring for Stacks. Not "an AI
auditor." Defensible because of the **credibility engine**: a finding doesn't
exist until it survives adversarial refutation AND exploits successfully in an
airgapped Clarity VM, labeled honestly bug-vs-centralization.

The moat is the *method + the accumulating corpus of verified PoCs*, not the model.

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

## Revenue streams (ranked by quality)

| Stream | Recurring? | Variance | Notes |
|---|---|---|---|
| **Continuous-monitoring retainer** | ✅ | low | the real business; predictable MRR. **Primary motion.** |
| One-off audit | ❌ | med | services; funds runway, undercuts slow human firms |
| Disclosure bounties | ❌ | high | opportunistic; bootstrap + marketing |
| Whitehat salvage | ❌ | very high | legally fraught; counsel sign-off; do NOT anchor the model here |

**Primary motion: retainer-first.** Documented now, build the monitoring/dashboard
product as we approach it — revisit after validation.

## Pricing hypotheses (validate, don't commit)
- **Retainer:** ~$2–8k/mo per protocol, tiered by TVL/complexity. Frame as
  insurance — for a protocol holding $10M+, $5k/mo is trivial.
- **One-off audit:** ~$15–40k/engagement — cheaper + faster than human firms
  ($30–100k+), continuous re-runs included.
- **Bounties:** industry norm ~5–10% of funds at risk (Immunefi-style caps).
- **Salvage:** ~10% whitehat fee (common norm).

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
