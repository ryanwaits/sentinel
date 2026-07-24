<!-- House-voice rendering (finding-report skill). Client-facing summary; the full audit
     report with per-finding refutation mechanics is ccd002-treasury-mia-mining-v3.md. -->

**CityCoins MIA treasury: no exploitable bug. The whole risk is which extensions the DAO trusts — and one contract we couldn't see.**

`SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd002-treasury-mia-mining-v3` · ~$20M STX · clean (centralization only)

Governance, access-control, and invariants auditors — every candidate verified. Nothing survives as a bug an outsider can reach: the escalation stories all reduce to "you'd already have to be a DAO-authorized extension," which is the ExecutorDAO trust model, not a hole. The `is-dao-or-extension` gate is correct (an EOA can't forge the base-dao branch), the allow-list "lock" is reversible, and `construct` is one-shot.

The real risk is trust and scope:

- **Standing extensions.** A malicious authorized extension, a passed malicious proposal, or the deployer at genesis can move or lock the full ~$20M. Inherent to the model — minimize standing extensions and treat any enable-extension proposal as maximally sensitive.
- **The voting extension is unreviewed** (out of this closure). Highest-leverage unknown: confirm voting power is snapshotted at proposal creation (flash-loan-safe) and that a timelock + quorum gate `execute`. **Recommend extending scope to it.**

No bug, no PoC — reproducing anything here would just re-demonstrate the trust model, not a vulnerability.
