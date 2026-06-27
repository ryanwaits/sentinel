# Audit Report — DLMM Pool (STX/USDCx, 10bps)

**Target:** `SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-usdcx-v-1-bps-10`
**Protocol:** DLMM bin-AMM (discretized liquidity), STX/USDCx, ~$9.4M TVL.
**Date:** 2026-06-27 · **Pipeline:** Audit Sentinel (agent-driven).
**Models (tiered):** auditors = `claude-sonnet-4.6`; verifier + orchestrator = `claude-opus-4.8`.
Second Phase-2 validation target (AMM archetype).
**Closure audited:** pool template + `SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1`
(all swap/liquidity logic) + `dlmm-pool-trait-v-1-1`.
**N/A dimensions:** no flash-loan primitive and no external price oracle (bin prices are
internal factor tables) → flashloan-economics + oracle not applicable.
**Method:** 5 auditors (share-accounting, invariants-dos, interest-math, access-control,
reentrancy) full source inlined → Opus verifier on every candidate high/critical → PoC gate.

## Verdict: No exploitable smart-contract vulnerability. Residual risk = custodial admin trust.
Every high/critical **bug** claim was refuted on adversarial verification. No PoC built
(gate requires a confirmed exploitable bug).

## Findings

| # | Finding | Dim | Auditor sev | Verdict | Final |
|---|---------|-----|-------------|---------|-------|
| 1 | "Cross-bin fungible LP redemption drain" | share-acct | CRITICAL | **REFUTED** | None (false positive) |
| 2 | Empty-bin no-op active-bin walk → swap freeze | invariants | CRITICAL | **REFUTED** (mechanic real, impact wrong) | **LOW** |
| 3 | `bin-price` product overflow → DoS | interest-math | MEDIUM | **REFUTED** for this pool | Info |
| 4 | Zero-amount `ft-transfer` revert on single-sided withdraw | share-acct | MEDIUM | **REFUTED** | None |
| 5 | Protocol fee not withheld → slow insolvency | invariants | HIGH(cond) | **REFUTED** by source | None |
| 6 | Admin migrates pool to arbitrary core → drain TVL | access-ctrl | CRITICAL | **TRUST, not bug** | **HIGH (centralization)** |
| 7 | Reentrancy on swap/withdraw (CEI) | reentrancy | Info/cond | Not exploitable (passive tokens) | Info |
| 8 | `set-pool-status` griefing (swaps off, withdraw open) | access-ctrl | HIGH | TRUST | **MEDIUM (centralization)** |
| 9 | Fee-free dust swaps; floor rounding | interest/inv | LOW | benign (gas ≫ gain) | Info |
| 10 | `move-liquidity` re-burns 1000 shares | share-acct | LOW | UX/capital nit | LOW |

### Why the headline CRITICALs are not real (verifier mechanics)
- **#1 cross-bin drain:** per-bin ownership is enforced — `pool-burn(bin,amount,user)` and
  the SFT `transfer` both assert `amount <= balance-at-bin{id,user}` (the *per-bin* ledger).
  Deposit to bin A credits `{A}`; withdraw at bin B calls `pool-burn(B,…)` reading `{B}`=0
  for the attacker → aborts. The shared fungible token is never a redemption authority. The
  Sonnet auditor mis-modeled a single-share design the contract doesn't have.
- **#2 freeze:** the free pointer-shift on an *empty* active bin is real, but reaching empty
  territory needs draining the funded range via real fee-paying price-moving swaps, and the
  shift is symmetric + reversible by anyone for gas. No corruption → LOW griefing nit. Harden:
  assert `updated-x-amount > 0` before mutating `active-bin-id`.
- **#5 insolvency:** caller transfers `updated-x-amount` IN; bin credited `dx+provider+variable`;
  protocol fee booked to `unclaimed-protocol-fees`, paid later. Sum held = in. Solvent.
- **#3 overflow:** 10bps / fixed 1001 factors / 6-dec / $9.4M → products land 17–22 orders
  under uint128. Not reachable.

## Genuine risks (honest CENTRALIZATION / TRUST — not public exploits)
- **#6 HIGH (trust):** an **admin** can `set-core-migration-target(arbitrary core)`, wait the
  ≥1-week timelock, then `migrate-pool` to repoint the pool's `core-address` to attacker code
  with full `pool-transfer/mint/burn` → 100% TVL. Not reachable by non-admins (every step gated
  on `admins`); mitigated by the public timelock + `withdraw-liquidity` staying open (LP exit).
  **Crux:** the migration target is NOT constrained to a verified **core** code-hash allowlist
  (the existing hash registry covers only *pool* contracts). **Fix: add a core-hash allowlist
  and/or multisig.**
- **#8 MEDIUM (trust):** admin `set-pool-status(false)` freezes swap/add/move (withdraw open) —
  griefing/extortion surface. Gate behind multisig/DAO.
- Admin set: ≤5 admins, deployer unremovable, single-key powers (fee redirect, exemptions,
  variable fees). Standard custodial-admin concentration.

## Bottom line
No exploitable contract vulnerability in the deployed pool. Per-bin share accounting, swap-fee
conservation, rounding (uniformly pool-favorable), first-deposit inflation (internal accounting
+ `sqrti` floor + 10000 min + 1000 burn), and reentrancy (passive STX/USDCx, token principals
pinned) are sound. Dominant residual risk is **custodial admin trust** (#6/#8), bounded by an
admin key + timelock with a live LP exit — disclosure-as-hardening, not a bug. Recommended:
(1) core-code-hash allowlist for migration targets; (2) multisig on `set-pool-status`/migration;
(3) `updated-x-amount > 0` guard before active-bin mutation.

---
*Cost: agent self-reported `TOTAL_TOKENS: 48213 in / 9624 out` (orchestrator-only; excludes the
5 Sonnet auditors + 4 Opus verifiers). True tiered cost = gateway spend delta for this run.*
