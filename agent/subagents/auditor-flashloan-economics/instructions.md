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

## Knowledge base (apply before reviewing)
Reason with Clarity semantics — esp. §5 (dynamic dispatch / receiver callback),
§3 (live-balance vs internal accounting), §6 (oracle/time manipulation):
`../../knowledge/clarity-semantics.md`. Function/version index:
`../../knowledge/clarity-functions.md`. Cross-check documented patterns in
`../../knowledge/stacks-incidents.md` and cite a matching incident when one applies.
Source of truth: docs.stacks.co/reference/clarity.
