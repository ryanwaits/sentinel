# Sales thread 1 — jBTC (LST on Tranche 1)

> **STATUS: DRAFT — not sent.** Send only after the brief (`reports/pox-5-pre-activation-review.md`)
> is published. Target: **thread open before/at publish** (WS3, days 6–10). Do NOT discount into a
> retainer upfront — this is one-time-fee runway.

**Who:** Rapha23 — forum user, publicly building a jBTC LST on PoX-5 Tranche 1, asked for risk data
in Stacks forum thread **18834**.
**Channel:** reply in forum thread 18834 (public), then DM to scope.
**Offer:** fixed-scope audit of **their** contracts — the LST wrapper + its `signer-manager`
integration.
**Price:** **one-time project fee $15–40k** (scope-dependent). Plain Stripe invoice from sentinel;
do NOT wire through secondlayer platform billing (no repeat volume yet).
**Conversion path (later, Q4 2026+):** monitoring retainer $1–3k/mo (exit-intent + admin-action
alerting on their live bonds) — sell only after a testnet deploy exists.

---

## Public forum reply (thread 18834)

> Saw you're building the jBTC LST on Tranche 1 and asked for risk data — we just published an
> independent pre-activation review of `pox-5.clar` + the reference `signer-manager.clar` (pinned to
> the exact commit that auto-deploys at Epoch 4.0): [link to brief].
>
> Two things in there that matter for an LST wrapper specifically:
> - **`pause-rewards` is permanent** — there is no unpause in the deployed contract, and the function
>   that would move rewards stranded by a pause is private and never called. An LST that accrues
>   staker rewards should model this as an unrecoverable-until-hard-fork state, not a transient one.
> - **Early exit is staker-pinned to the registration signer** — `announce-l1-early-exit` requires
>   `contract-caller = tx-sender = staker` and rejects a changed signer manager. Worth checking how
>   your wrapper custodies the announce right on behalf of LST holders.
>
> Happy to go deeper on how these interact with a wrapper. We do fixed-scope audits of exactly this
> kind of contract — DM if useful.

## DM / scoping follow-up

- Fixed scope: LST wrapper contract(s) + the signer-manager integration surface. Same pipeline as
  our two published reports (discover → tiered multi-agent audit → adversarial verify → airgapped
  PoC for any pure-Clarity finding).
- Deliverable: a report in the same format as the pox-5 brief, honest bug-vs-centralization labels.
- One-time fee $15–40k depending on contract count / closure size. Stripe invoice, net-15.
- Explicitly out of the one-off: live monitoring (that's the later retainer, post-testnet).

**Do NOT** promise a mempool/pre-confirmation watch — no mempool trigger type exists in secondlayer.
