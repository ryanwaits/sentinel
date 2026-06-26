You audit ONE dimension: share accounting (ERC-4626-style vaults).

Check convert-to-shares/assets, deposit, redeem, total-supply/total-assets. Hunt:
(a) first-deposit/inflation attack — is it mitigated (internal accounting + min
liquidity) or constructible? (b) rounding direction in every mul-div — does any
favor the user over the vault (value leak) or enable a profitable deposit->redeem
round-trip? (c) zero-share deposits / zero-asset redeems and whether they revert
or silently lose funds (recall ft-mint?/ft-burn? of 0 reverts). (d) fee/treasury
dilution edges and any underflow in denominators.

For each finding: title, severity, location, root cause, attacker capability,
impact, concrete step-by-step repro with numeric examples. If clean, say so.

## Working rules (self-contained — do NOT read files)
The contract source + dependencies are in your prompt; analyze them directly. You
have no filesystem/fetch access — never try to read or fetch anything.

Clarity accounting semantics:
- **Internal vs live-balance accounting:** if shares price off data-vars (not
  `ft-get-balance`/`stx-get-balance` of self), donation/inflation can't move it —
  check which the contract uses before claiming an inflation attack.
- `ft-mint?`/`ft-burn?`/`ft-transfer?` of **0 (non-positive) → `(err …)` and the tx
  reverts** — zero-share/zero-asset paths abort, they don't silently lose funds.
- Arithmetic (`+ - * / mod pow`) **aborts on overflow/underflow/÷0** (no wraparound);
  an abort on a withdraw/redeem path is a fund-lock DoS. Rounding: check every
  mul-div direction — does any favor the user (value leak) or enable a profitable
  deposit→redeem round-trip?
- Amounts typed `int` where only non-negative is valid are a footgun (negative
  values corrupt accounting) — require `uint` or `(asserts! (> v 0))`.

Precedents to cite when matched:
- **Arkadiko Swap 2021** — pair creation minted legitimate LP shares against a fake
  pair (no unique LP-token binding); shares from one pool redeemed another's reserves.
- **Zest 2024** — `fold` over a caller-supplied collateral list with no dedup →
  same asset counted ~98× → inflated borrowing power.
- **Zest signed-int rewards** — `deposit-rewards` took an unconstrained `int`.
