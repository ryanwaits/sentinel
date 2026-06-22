# Validation Sweep — 3–5 Stacks protocols

First real-world test of the pipeline. Stacks-only wedge. Validation-first:
hand-built PoCs (not auto-gen yet). See [business-model.md](./business-model.md)
for revenue/pricing context, [../AGENTS.md](../AGENTS.md) for the pipeline.

## Objective
Prove the pipeline produces credible, *reproduced* findings (or honest clean
bills) across real top-TVL Stacks protocols — and generate the demand signal that
decides whether retainers are real. Output = internal capability test AND
marketing/disclosure artifacts.

## Success criteria
- 3–5 protocols swept end-to-end (discover → audit → verify → reproduce).
- Every shipped high/critical has a **green airgapped simnet PoC** + honest
  bug-vs-centralization label.
- ≥1 reproduced, previously-undisclosed real finding (strongest signal). A
  rigorous *clean bill* on a $-heavy contract is also a sellable artifact.
- ≥3 coordinated disclosures sent; track responses (the demand metric).

## Why hand-built PoCs (not auto-gen yet)
Auto PoC generation is the next eng bet, but building the abstraction before
hand-building ~5 diverse PoCs = guessing. This sweep's repetitive motions become
the auto-gen spec. Validation pays for the eng bet's design.

- **Hand-built (now):** like `simnet/poc/finding-1.ts` — copy target fns into
  `simnet/contracts/`, write assertions, run airgapped. Proves finding quality +
  demand with zero new infra; human bottleneck per finding.
- **Auto-gen (later):** agent scaffolds the whole Clarinet project (dep closure,
  reduced plumbing, generated assertions) and self-repairs until green. Scalable
  but hard (codegen correctness, fidelity risk).

## Target selection — diversify by archetype
Pick for archetype diversity, not just raw TVL, so findings generalize and all 6
auditor dims get exercised. Use `find_value_contracts` to confirm live $-at-risk.
**Names are candidates — confirm deployer/contract IDs + live TVL before committing.**

| # | Archetype | Stresses dims | Candidate (verify) |
|---|---|---|---|
| 1 | Vault | access-control, share-accounting | ✅ Zest sBTC (done — anchor) |
| 2 | AMM/DEX | flashloan-economics, invariants | ALEX / Velar / Bitflow |
| 3 | Lending/CDP | interest-math, access-control | Granite / Zest lending / Arkadiko |
| 4 | Stableswap | share-accounting, interest-math | Bitflow stableswap |
| 5 | sBTC core or NFT/staking | invariants-dos, reentrancy | sBTC contracts / staking pool |

## Per-protocol workflow
1. `find_value_contracts` → confirm it holds value; record $-at-risk + asset mix
   (FT/NFT/STX).
2. `fetch_contract_source` for the contract + its dependency closure.
3. **Triage** (cheap pre-filter, before spending Opus): admin/authorized powers?
   unguarded mutators? external transfers? mint/burn? → scope which dims matter.
4. Fan out to the relevant `auditor-*` subagents.
5. `verifier` on every finding — adversarial, default-refute.
6. Confirmed high/critical → **hand-build** `simnet/poc/<protocol>-finding-N.ts`,
   run airgapped (`docker run --network none`).
7. Write per-protocol report.

## Report artifact (one per protocol)
- Summary: $-at-risk, asset mix, # findings by severity.
- Per finding: title, severity, **bug vs centralization label**, location
  (fn+lines), root cause, attacker capability, asset-safety impact, repro steps,
  **PoC status (green/red + assertion count)**.
- Clean dimensions stated explicitly.

## Disclosure — pure whitehat
- Coordinated only; **no public PoC before a fix**.
- Per protocol: find security contact → encrypted report → reasonable fix window
  → public writeup *after* fix (or after window, coordinated).
- Accept official bounties via coordinated disclosure (whitehat ≠ no money).
- Salvage off the table unless a finding reveals already-at-risk funds → escalate
  to counsel.

## Sequencing & effort
- **Phase 0 — infra unblock:** deploy `token-balances` subgraph; set
  `SECONDLAYER_API_URL`/`_API_KEY`; add USD price for ranking; resolve AI-Gateway
  paid credits (Opus still 403s on free tier → blocks agent-driven runs). Without
  credits the sweep is manual-Claude-driven, not agent-driven — decide if that's
  acceptable for validation.
- **Phase 1:** sweep protocols 2–3 (archetype diversity), hand-built PoCs.
- **Phase 2:** sweep 4–5; refine triage + report template.
- **Phase 3:** disclosures out; log responses → demand verdict; capture repetitive
  PoC motions as the auto-gen spec.

## Metrics that decide the next bet
- # reproduced real findings vs centralization-only.
- Disclosure response rate / engagement quality (→ retainer demand).
- Avg human-time per PoC (→ ROI case for auto-gen).
- Token cost per protocol sweep (→ pricing floor + the ~1M-token-ceiling question).

## Open questions
- AI-Gateway credits now (agent-driven sweep) vs manual-Claude validation first?
- Confirm real contract IDs + live TVL for targets 2–5.
- USD price source — does secondlayer expose one, or external feed (does external
  break the no-third-party rule for *pricing* specifically)?
- Disclosure logistics: named security contact / PGP identity on outbound reports?
