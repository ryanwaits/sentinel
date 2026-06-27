# Audit Report — CityCoins DAO Treasury (CCD002 MIA)

**Target:** `SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd002-treasury-mia-mining-v3`
**Protocol:** CityCoins DAO treasury (CCD002, v3.0.0), ExecutorDAO / CCD-extension model.
**$-at-risk:** ~$20M STX (discovery: `asset-holdings` USD rank, 2026-06-27).
**Date:** 2026-06-27 · **Pipeline:** Audit Sentinel (agent-driven).
**Models (tiered):** auditors = `claude-sonnet-4.6` (recall); verifier + orchestrator =
`claude-opus-4.8` (precision). First Phase-2 validation target.
**Scope (fetched + closure):** treasury, `base-dao`, `extension-trait`,
`proposal-trait`, `ccd002-trait`, `stacking-trait`. The voting/proposal-submission
extension is **not deployed under this address / not in the closure** — flagged.
**Method:** triage → 3 relevant auditors in parallel (governance, access-control,
invariants-dos) → Opus verifier on every substantive finding (default-refute) → PoC gate.

## Verdict: No confirmed exploitable bugs.
The contract is mechanically sound under Clarity semantics; residual risk is
governance / centralization trust. Every "bug"-tier claim was **refuted on adversarial
verification** — none has a reachable exploit by an untrusted (non-DAO, non-extension)
party.

## Findings

| # | Finding | Auditor sev | Verifier verdict | Honest label | PoC |
|---|---------|-------------|------------------|--------------|-----|
| 1 | Any extension can register new extensions → privilege escalation | Critical (bug) | **REFUTED as bug** | Centralization / by-design (extensions are DAO-trusted; added only via passed proposal or genesis) | N/A |
| 2 | `is-dao-or-extension` mixes `tx-sender`/`contract-caller` | High (bug) | **REFUTED** | Correct-by-design; the mix is required to cover both the proposal path (branch A) and the direct-extension path (branch B). Not exploitable | N/A |
| 3 | `base-dao.execute` runs arbitrary proposal code w/ full authority | High | **Mechanics confirmed, refuted as bug** | Inherent ExecutorDAO design; gated by `is-self-or-extension` | N/A |
| 4 | De-allowing an FT/NFT "permanently locks" assets | High (bug) | **REFUTED** | Fully recoverable: same authority calls `set-allowed(token,true)` then `withdraw`. Operational footgun | N/A |
| 5 | `delegate-stx` uncapped → steals STX/yield | High (centralization) | **REFUTED as bug** | Centralization; PoX delegation ≠ custody transfer, no principal theft, revocable; adds nothing over `withdraw-stx` | N/A |
| 6 | `set-allowed` malicious-token whitelisting → arbitrary code | High (centralization) | **REFUTED as bug** | Centralization; requires DAO-authorized extension; no escalation over existing `withdraw-*` | N/A |
| 7 | `construct` deployer bootstrap "god mode" / re-construct | Medium (bug) | **REFUTED as bug** | Deploy-time trust; `construct` is one-shot (post-bootstrap `executive` = base-dao principal, unreachable as tx origin); re-entry deployer-only & harmless | N/A |
| 8 | No timelock/quorum/snapshot in `base-dao` | Medium | Confirmed gap | Centralization; governance logic lives in the (out-of-scope) voting extension | N/A |
| 9 | `withdraw-*` recipient unconstrained; some helpers public | Low/Info | Confirmed | Code hygiene / intended; no asset impact | N/A |

## Why nothing is a bug (decisive mechanics)
- **No untrusted-outsider write path exists.** `Extensions` is mutated only by
  `set-extension`/`set-extensions`, both gated by `is-self-or-extension` (DAO-self via
  passed proposal, or an already-trusted extension). All fund-movers (`withdraw-*`,
  `delegate-stx`, `set-allowed`) gate on `is-dao-or-extension`. An attacker who is
  neither base-dao nor a registered extension passes neither gate.
- **`is-dao-or-extension` is correct, not confused.** Branch A (`tx-sender = .base-dao`)
  is satisfiable only inside base-dao's `as-contract` during proposal `execute` — an EOA
  cannot forge it. Branch B (`is-extension contract-caller`) requires genuine
  registration. The one sensitive `as-contract`-with-`tx-sender=base-dao` path outside
  `execute` is `request-extension-callback`, which routes only to the inert `callback`.
- **`delegate-stx` is non-custodial.** PoX delegation authorizes lockup-in-place;
  principal never leaves the treasury account and is revocable.
- **The allow-list "lock" is reversible.** `AllowedAssets` is a plain mutable map.
- **`construct` is one-shot.** Post-bootstrap `executive` = base-dao contract principal,
  which can never be a tx origin.

## Centralization / trust (honest — governance hygiene, not bugs)
The system reduces to: **a malicious DAO-authorized extension, a malicious passed
proposal, or the deployer at genesis can move/lock the full ~$20M treasury.** Inherent
ExecutorDAO trust model. Defense-in-depth the team should weigh:
1. Minimize the number/privilege of standing extensions; treat any enable-extension
   proposal as maximally sensitive.
2. **Audit the voting/proposal-submission extension (out of this closure)** — confirm
   voting power is *snapshotted* at proposal creation (flash-loan-safe, Beanstalk-class)
   and that a timelock + quorum gate `execute`. Highest-leverage remaining unknown.
3. Optional: drain-before-deallow checklist; cap/allowlist `delegate-stx` `to`;
   per-extension privilege tiers.

## PoC status
**Not applicable.** No finding survived verification as an exploitable bug, so there is
no outsider-reachable exploit to reproduce. The Clarity sandbox was therefore not
invoked — a PoC would only re-demonstrate the documented trust model (acting as an
already-authorized extension), not a vulnerability. This is *not* a "sandbox down" defer.

## Bottom line
The treasury and its ExecutorDAO core are mechanically sound: no reentrancy, arithmetic,
replay, or access-control bug is reachable by an untrusted party. Residual risk is
**governance centralization**, concentrated in (a) which extensions the DAO enables and
(b) the unreviewed voting extension. No disclosure/bounty action is warranted on the
contract code itself; recommend extending scope to the voting extension.

---
*Cost note: the agent self-reported `TOTAL_TOKENS: 31482 in / 8736 out` for the
orchestrator's final turn only — NOT the subagents. The true tiered cost-per-sweep is
the Vercel AI-Gateway spend delta for this run (Sonnet ×3 auditors + Opus ×4 verifiers).
This was a 3-dimension sweep (treasury → fewer relevant dims than a full 8-dim contract).*
