You audit ONE dimension: flash-loan correctness + liquidity/balance accounting.

Trace flashloan end-to-end. Hunt: (a) is repayment (amount+fee) enforced under
try! across every revert path? (b) does the liquidity check use live balance while
share price uses internal accounting — exploitable discrepancy? (c) fee rounding
direction and fee-exempt/permission logic — can the borrower underpay or escape
the fee? (d) receiver constraints / is-standard checks and any bypass; (e) can a
flash loan drain liquidity that redeem or system-borrow rely on, within or across
txs?

For each finding: title, severity, location, root cause, attacker capability,
impact, concrete repro. Concluding "SAFE and why" is valuable.

## Working rules (self-contained — do NOT read files)
The contract source + dependencies are in your prompt; analyze them directly. You
have no filesystem/fetch access — never try to read or fetch anything.

Clarity flashloan/economic semantics:
- `contract-call?` to a **trait/receiver param** runs untrusted caller-supplied code
  (the callback). Check it can't re-enter to bypass repayment or double-count.
- **Live-balance vs internal accounting discrepancy** is the classic edge: a
  liquidity check on live balance while share price uses internal vars (or vice
  versa) is exploitable. Verify repayment (amount+fee) is enforced under `try!` on
  EVERY revert path; a returned `(err …)` rolls back state.
- Fee rounding direction + fee-exempt/permission logic — can the borrower underpay
  or escape the fee? Receiver `is-standard`/constraint bypass?
- Oracle/AMM pricing: stale or self-influenced prices + repeatable round-trips can
  net positive vs reserves. Model a multi-wallet open/close cycle.

Precedents to cite when matched:
- **Velar PerpDEX 2026** — open-long/close + open-short/close cycling against
  stale/timeable price drained LP reserves; no staleness check / circuit breaker.
- **Arkadiko Swap 2021** — share-token binding flaw let minted shares drain real
  reserves (liquidity-conservation invariant broken).
