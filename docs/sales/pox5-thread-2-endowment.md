# Sales thread 2 — Stacks Endowment (bootstrap-phase ops risk)

> **STATUS: DRAFT — not sent.** Send only after the brief is published (the brief is the proof of
> work). Target: **thread open before/at publish** (WS3). **Hard rule: stay entirely out of the
> SIP-031 unlock allegations** — adjudicating them poisons this thread. We review code; we take no
> side in the vote or on monetary policy.

**Who:** Stacks Endowment — `vip@stacksendowment.co`. They manually manage coverage during the
~12-month PoX-5 bootstrap.
**Channel:** cold email to vip@stacksendowment.co (the brief as the opener).
**Offer:** independent pre-activation review is **already done** (attach/link the brief); pitch a
scoped engagement on the **bootstrap-phase operational risks** they carry.
**Price:** scoped engagement (size after a scoping call); plain Stripe invoice from sentinel.
**Conversion path (later):** monitoring retainer $1–3k/mo once testnet exists.

---

## Cold email draft

**Subject:** Independent pre-activation review of pox-5.clar — bootstrap ops risk

> Hi —
>
> Ahead of the SIP-045 vote we published an independent security review of the contract that
> auto-deploys at Epoch 4.0 — `pox-5.clar` plus the reference `signer-manager.clar`, pinned to the
> exact commit: [link]. No side taken on the vote; we review code.
>
> The review surfaced several **one-way-door** properties that fall on whoever operates the
> bootstrap phase — i.e. you:
> - **`pause-rewards` is irreversible** (no unpause; stranded-reward recovery function is private and
>   uncalled) — a single key permanently halts signer reward claims.
> - **The reserve fund is write-only in the deployed contract** — it accumulates via `calculate-rewards`
>   but the only draw function is private and never called, so any coverage payout needs a hard fork.
>   That directly shapes how coverage can be managed during the ~12-month bootstrap.
> - **Two disjoint admin keys** (`bond-admin`, `pause-admin`) with enumerable unilateral powers.
>
> These are operational-risk facts, not bugs to disclose. We'd scope a short engagement mapping the
> bootstrap-phase operational risks you're carrying and how to monitor them once testnet is live.
> Fixed scope, fixed fee. Worth a 30-minute call?

## Notes for the call

- Lead with the brief as proof; the ask is a scoped bootstrap-ops-risk engagement, not the audit
  (that's done and free-to-them as the door-opener).
- Post-testnet upsell: monitoring retainer $1–3k/mo — exit-intent + admin-action alerting on live
  bonds (WS4 config already written and fixture-tested; deploys when a testnet boot address exists).
- OUT of scope in copy: L1 UTXO spend-watcher (customer-funded phase 2 only), coverage-ratio
  telemetry as a product (the contract already exposes the ratio), custodian NAV feed (LOI first).
- **Never** engage on SIP-031. If they raise it, redirect to the code review.
