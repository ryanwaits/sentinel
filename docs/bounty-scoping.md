# Bounty scoping — Clarity / Stacks

**Snapshot 2026-07-28.** Market sizing for using Sentinel as a bounty-hunting engine.
Companion to [business-model.md](./business-model.md). All figures verified against
primary sources (Immunefi program index, DefiLlama, protocol docs) — see
"Provenance" for what is inference.

---

## 1. The whole market, in one table

Six live programs cover Clarity. That is the entire addressable surface.

| Program | Critical | High | Med | Low | KYC | PoC | Notes |
|---|---|---|---|---|---|---|---|
| **Stacks** (Foundation) | $250k | $25k | $5k | $1k | Yes | Yes | 3 Clarity boot contracts (`pox-4`, `costs`, `lockup`) + Rust incl. Clarity VM. $1.8M paid to date, ~3d median resolution |
| **sBTC** | $25k–$250k | $5k–$25k | $1k–$5k | $1k | Yes | Yes | Launched 2026-07-02. sBTC Clarity + signer/Emily/WSTS |
| **Granite** | $25k–$100k | $5k–$25k | $2.5k | $1k | Yes | Yes | 29 mainnet Clarity contracts. POI on SCs. **$1M total program cap** |
| **Zest V2** | $20k–$100k | $1k–$20k | — | — | No | Yes | 17 Clarity assets incl. `v0-vault-sbtc`. POI |
| **Hermetica** | $20k–$100k | $1k–$20k | — | — | **No** | Yes | 12 Clarity contracts (hBTC vault, USDh). POI |
| **Arkadiko** | $20k–$100k | $1k–$20k | — | — | No | Yes | 12 Clarity contracts + frontend |

Two ceilings only: **$250k** (Stacks core, sBTC) and **$100k** (everything else).
Medium/Low exist on just four programs; on Zest, Hermetica, and Arkadiko it is
**Critical or High or nothing**.

### Advertised maxima are not escrow

**Immunefi is non-custodial** — "at no point will the Company or its affiliates ever take
custody of any digital assets" (ToS). **The project pays you directly** from its own
multisig, and Immunefi mediation is explicitly **non-binding** ("a nonbinding
recommendation by Immunefi personnel"). Binding disputes go to SIAC arbitration in
Singapore, individual basis, 1-year limitation.

Where a program funds an on-chain Vault, the balance is public and is the best
pre-submission signal available:

| Program | Max bounty | Vault actually holds |
|---|---|---|
| Ethena | $3,000,000 | **$12,488** |
| **Zest V2** | $100,000 | **~$150** |
| The Graph | $50,000 | $35,991 |
| **Hermetica** | $100,000 | *no vault published* |

**Check the vault before investing sweep effort.** Our real leverage against a
non-paying project is the **90-day publication right**: reports unresolved 90 days after
escalation become publishable at will under every disclosure category.

### Outside Immunefi: effectively zero

- **Clarity audit contests ever run: 0. Ever paid: $0.** Verified by full enumeration —
  Sherlock (all 301 contests), Cantina (all 143), Code4rena, CodeHawks, Hats. Nothing scheduled.
- HackerOne: Hiro and Leather both **paused**; Leather is wallet code, not Clarity. Xverse gone.
- HackenProof has a Zest program; status uncertain, likely superseded by Zest V2 on Immunefi.
- Fallback channel for the chain itself: `security@stackslabs.com`.

---

## 2. Why the payout formula caps our upside

Stacks chain TVL is **$75.4M**. Immunefi's norm is 10% of funds at risk; no Stacks
program comes close, because all flat-cap at $100k regardless of exposure.

| Protocol | TVL | Max bounty | Bounty ÷ TVL |
|---|---|---|---|
| Zest V2 | $62.5M | $100k | **0.16%** |
| StackingDAO | $11.2M | **none** | — |
| Granite | $7.4M | $100k | 1.35% |
| Hermetica hBTC | $3.3M | $100k | 3.1% |
| Bitflow | $2.6M | **none** | — |
| Arkadiko | $333k | $100k | **30%** |

Payout is **anti-correlated with money at risk**. Finding a $62M-solvency bug in Zest
pays the same $100k as a $333k bug in Arkadiko. The implication for targeting: rank by
*probability of a qualifying find*, not by TVL — TVL buys us nothing above the cap.

---

## 3. Expected value

### Unit economics per sweep
A full deep sweep costs **~$2** in engine spend. Against a $20k floor that is a ~10,000×
ratio *on a hit* — the cost side is irrelevant to the model. **The binding constraint is
qualifying-find rate and program capacity, not compute.**

### Anchor on the median, not the mean
Across 593 Immunefi programs, $107.3M in critical payouts: **median $20,000, mean
$114,355** — the mean is **5.7× the median**. Any model built on the mean is modeling
someone else's jackpot. Stacks criticals floor at $20–25k and cap at $100–250k, so the
median *is* our modal outcome.

Supporting the bull case: **93.9% of programs running 5+ years surface a critical**, and
~50% of active programs surface one annually. Critical bugs are near-universal given time
on target. The constraint is capacity and validity, not existence.

### Capacity ceiling
Six programs. Assume one qualifying find per program per year at best, severities skewing
High rather than Critical (see below):

| Scenario | Assumption | Annual |
|---|---|---|
| Pessimistic | 1–2 High across all six | **$20k–$40k** |
| Base | 3–4 High, 0–1 Critical | **$60k–$120k** |
| Optimistic | 4–6 High, 1–2 Critical incl. one Stacks-core | **$150k–$400k** |

Even the optimistic case is **capacity-limited**. This is not a business on its own; it
is a credibility engine and a lead generator for monitoring retainers.

### The one strong structural argument for Clarity
**Stacks Attackathon I** (Dec 2024–Jan 2025, $250k pool, 25,492 LoC, Clarity in scope)
produced 27 valid bugs across **8 paid researchers**:

| Rank | Payout | Rank | Payout |
|---|---|---|---|
| 1 | **$101,043** | 5 | $3,631 |
| 2 | $84,837 | 6 | $1,961 |
| 3 | $45,403 | 7 | $1,210 |
| 4 | $10,892 | 8 | $1,023 |

Median $7,262; top earner **99× the eighth**. **Eight participants** — versus hundreds of
wardens per Solidity contest. Thin competition on Clarity is the single strongest datapoint
in favour of specializing here. It is also the reason the payout curve is so top-heavy:
placing first matters far more than participating.

### Severity skews High, not Critical
The severity math: on a single-position freeze, Critical pays 10% of funds affected with a
$20k floor, but the lock hits one position at a time so the percentage never binds —
Critical and High both land at ~$20k. **Filing High costs nothing in EV and buys
credibility.** Expect this pattern to repeat on any freeze-class finding.

> The Hermetica hBTC #V2 filing was our intended worked example here, but it was
> **retracted** (`docs/findings/hermetica-v2-RETRACTED.md`): the "no user-side exit" claim
> was false (`fund-claim` is permissionless post-cooldown) and Immunefi closed it as
> irrelevant. The severity *logic* above stands; the filing does not. Lesson folded into
> the PoC-completeness gate (`engine/gates.ts` Gate 3).

---

## 4. Risk register

| Risk | Detail |
|---|---|
| **Known-issue carve-outs** | Zest Finding 1 maps cleanly to VSCS v2.3 **Critical — "permanent freezing of funds"** and arguably **"protocol insolvency."** But VSCS is impact-driven *except* that "attacks requiring elevated privileges may be downgraded," and Zest V2 separately excludes "issues requiring DAO compromise" and "full control of the asset and egroup registry by the DAO is intended design." Triggered by an *authorized* contract, the finding sits exactly in that crossfire. **That classification fight is worth $0 vs $100,000.** Adjudicate before filing. Also note Zest's vault holds ~$150. |
| **Bug-vs-centralization** | Most vault findings to date were centralization, not bugs. Programs reject these. `engine/gates.ts` is the control; it must stay strict. |
| **⚠️ Audit/bounty conflict may be structural** | Immunefi excludes "security auditors that **directly or indirectly** participated in the audit review." "Indirectly" is undefined. **A retainer client's bounty may be permanently off-limits to us — the two revenue streams may not stack per-client.** Not currently reflected in `business-model.md`. Needs a direct answer from Immunefi. |
| **AI-generated report backlash** | The rule everywhere is **not "no AI" — it is "no unverified output."** Immunefi bans AI reports "that lack the required information regarding the vulnerability's impact"; Cantina bans AI findings "without validating them" (disqualification or permanent ban); C4 calls automated output "strongly discouraged." A 2023 Immunefi blog uses a flatly harder line that a hostile triager could still cite. In 2023, **ChatGPT-related accounts were 21% of all Immunefi permanent bans**, with zero genuine vulns found. |
| **Reputation cold-start** | Immunefi rate-limits **1 report/24h until your first paid report** (then 5/48h). Sherlock zeroes you entirely below 20% validity. C4 caps you at 1–2 submissions below 0.4 signal. Volume hunting is structurally impossible; low-volume/high-precision is the only viable posture — which is what we already are. |
| **Honest false-positive economics** | Dedaub's own published figure: a high-value analysis flags <1% of programs at a **~95% false-positive rate** — **20 human reviews per exploitable bug**. That review labour, not compute, is the real cost line. |
| **Duplicates** | Clarity Alliance (32 published audits across Zest, Granite, Bitflow, StackingDAO, Hermetica, ALEX, Velar, sBTC) is the incumbent and has covered our target list. Duplicate risk is real and concentrated. |
| **Program churn** | Four programs delisted inside ~18 months (ALEX, Bitflow, StackingDAO, Zest V1). StackingDAO's vanished within the last two weeks. A target can stop paying mid-sweep. |
| **KYC** | Stacks, sBTC, and Granite require it. Unverified on Zest and Hermetica. |

---

## 5. The stronger play: dead-channel protocols

Four top-10 protocols hold **~$14.7M** with no working way to receive a vulnerability report:

| Protocol | TVL | State |
|---|---|---|
| StackingDAO | $11.2M | No channel of any kind |
| Bitflow | $2.6M | Docs link to a 404 Immunefi page |
| ALEX | $723k | Docs link to a 404 Immunefi page |
| Velar | $255k | Never had one |

Three publish **dead links**, which is worse than publishing nothing — a researcher
follows the link, 404s, and drops the finding.

This is the monitoring pitch as observed fact rather than projection. Every live program
requires a PoC; Sentinel already forces a green simnet PoC through `engine/gates.ts`.
That artifact is exactly what these four have no way to receive.

**Caveat:** StackingDAO already runs Hypernative — a direct competitor deployed at the
#2 protocol by TVL.

---

## 6. Has automated bounty hunting ever worked?

**No firm has ever built a business on it.** Every winner sells consulting, retainers, or
SaaS and uses bounties as marketing.

- **Certora** takes **$1.5M/year in retainer from Aave alone** (governance proposal 410).
  Zero bounty income disclosed. That single retainer is ~10× the entire documented AI
  bounty haul across the industry.
- **XBOW** hit **#1 on HackerOne's US leaderboard** with 1,000+ reports — and its CEO
  said on the record the earnings were *"less than the cost it takes to run the tool."*
  **Negative unit economics at #1 in the world.** It pivoted to selling software and
  raised at >$1B.
- **Dedaub** is the sole partial exception: ~$3M lifetime from 9–10 bounties, mostly one
  2022 event, and **one additional bounty in the 3.25 years since** despite continuously
  scanning all of Ethereum. The pipeline flatlined.
- **Anthropic's SCONE-bench agents found two novel zero-days in real deployed contracts,
  emailed the developers, got no response, and were paid nothing.**

The pattern behind every AI-found bug that *did* get paid: **AI surfaces → a human
confirms exploitability → a human builds the PoC → a human discloses under their name.**
Octane's $50k Ethereum Foundation payout is explicit about this — the AI flagged it, but
a human "confirmed exploitability, built the PoC, and submitted it."

**Capability is no longer the bottleneck; credible, PoC-backed, human-signed disclosure
is.** That is exactly what `engine/gates.ts` produces. The gates are the licence to
operate, not overhead — say so explicitly in outbound reports.

## 6b. Open parameters

- [ ] Whether a *company* (vs individual) can be the reporting entity on Immunefi —
      **entirely undocumented**; no team primitive, no reward-split, no entity flow. The
      only affirmative signal is 0x's KYC field accepting an EIN. Confirm before modeling
      firm revenue.
- [ ] Immunefi's per-severity SLA figures — help center is login-gated. Only the
      per-program "median resolution time" is public (Stacks: 3 days).
- [ ] Tax treatment — no 1099/W-9/W-8BEN language anywhere. Since the *project* pays,
      tax treatment is set per-program by an unknown counterparty.
- [ ] Whether the audit/bounty conflict bar (§4) applies to retainer clients.

## 7. Recommended sequence

1. Land the Hermetica report (~$20k). One paid finding converts the whole thesis from claim to reference.
2. Adjudicate Zest Finding 1 against the DAO carve-out before filing. Do not burn it on a likely-invalid submission.
3. Re-target the sweep at bounty-covered contracts. Of four contracts swept so far, two sit on live programs and two are unmonetizable — the sweep was never bounty-targeted.
4. Approach the four dead-channel protocols with monitoring, using a PoC-backed finding as the opener.

---

## Provenance

**Verified:** all six live programs and their tiers (Immunefi program index + program
pages); the delisted four (404 + absent from index, while ended competitions still
return 200); zero Clarity contests (full enumeration of Sherlock/Cantina, GitHub org
search for C4/CodeHawks/Hats); all TVL figures (DefiLlama); dead-channel findings
(org-wide SECURITY.md scans + docs indexes).

Also verified: VSCS v2.3 severity definitions; median-vs-mean critical payout (593
programs); Attackathon I leaderboard; Immunefi non-custodial ToS + vault balances;
platform AI-submission rules (quoted verbatim from each platform's own rules page);
rate limits; Hermetica KYC + tier table (fetched directly 2026-07-28).

**Inferred / unverified:** Zest per-tier breakdown; HackenProof Zest live status
(Cloudflare-blocked); Hiro/Leather payout amounts; Immunefi's 10% project fee (rests on
indexed help-center text, not a live fetch); tax and entity treatment (see §6b).
Immunefi's ToS was last modified **2023-04-11** — 3+ years stale and demonstrably behind
current KYC practice; treat it as a floor, not a description.

Scenario numbers in §3 are modelled, not observed — no Clarity bounty-hunting operation
has published results to calibrate against. Sources judged unreliable and deliberately
excluded: sqmagazine, coinlaw, earnifyhub, penligent, and smartcontractshacking's salary
calculator — all produced plausible figures untraceable to primary sources and
contradicted by computed data (e.g. "top-10 auditors earn $200–500k/yr" vs a real 2025
Code4rena top-10 of **$44,967**).
