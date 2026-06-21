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
