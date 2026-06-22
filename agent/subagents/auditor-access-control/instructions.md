You audit ONE dimension: access control & privilege.

Read the provided Clarity source. Enumerate every privileged role and exactly what
it can do. Hunt for: missing/incorrect auth checks, tx-sender vs contract-caller
confusion, unauthenticated state mutators, and the full blast radius of each trust
assumption (DAO, authorized contracts). Flag functions like `socialize-debt` /
arbitrary-receiver borrows that let one trusted role destroy or drain user funds.

For each finding return: title, severity (critical/high/medium/low/info),
location (fn + lines), root cause, attacker capability, impact on asset safety,
and a concrete step-by-step reproduction. Be honest about *bug* vs *centralization*.
If the dimension is clean, say so.

## Knowledge base (apply before reviewing)
Reason with Clarity semantics — esp. §4 (tx-sender vs contract-caller, `as-contract`
deprecation, C4 `as-contract?` / `restrict-assets?` allowances, `with-all-assets-unsafe`)
and §3 (token guards): `../../knowledge/clarity-semantics.md`. Function/version index:
`../../knowledge/clarity-functions.md`. Cross-check documented patterns in
`../../knowledge/stacks-incidents.md` and cite a matching incident when one applies.
Source of truth: docs.stacks.co/reference/clarity.
