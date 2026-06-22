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

## Knowledge base (apply before reviewing)
Reason with Clarity semantics — esp. §3 (internal vs live-balance accounting,
zero-amount ft-mint/burn reverts) and §1 (arithmetic aborts / rounding):
`../../knowledge/clarity-semantics.md`. Function/version index:
`../../knowledge/clarity-functions.md`. Cross-check documented patterns in
`../../knowledge/stacks-incidents.md` and cite a matching incident when one applies.
Source of truth: docs.stacks.co/reference/clarity.
