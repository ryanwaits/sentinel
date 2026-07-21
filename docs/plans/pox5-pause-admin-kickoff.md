# Kickoff — pox-5 admin-surface monitoring (pause-rewards focus)

> Session prompt. Scope FIRST (plan + unresolved questions); implement only after plan approval.
> Written 2026-07-20 from a secondlayer-monorepo session that diffed the shipped contract.

## Why now

stacks-core **4.0.1 shipped Jul 15** (final Epoch 4.0 release). pox-5 auto-deploys at
`SP000000000000000000002Q6VF78.pox-5` when Bitcoin crosses **960,230 (~Jul 29–30)** — ~9 days out.
Our monitor config `monitoring/pox5-bond-ops.ts` is pinned to `POX5_REVIEW_SHA = d78f15a8`
(pox-wf-integration, pre-final) and its own header says re-pin on churn. It churned.

## Known deltas in shipped 4.0.1 (found by diffing clarinet-sdk 3.21.1's embedded pox-5 vs the 4.0.1 tag — NOT vs our d78f15a8 pin; do the authoritative diff yourself)

1. **`bond-admin` AND `pause-admin` data-vars initialize to `SP72DMR3MJKS7RVBY33JVV7EEJSQ1PYDVKDP10FX`**
   — a real principal, not the boot-address placeholder our config comments assume (L345/L350 refs stale).
2. New `BITCOIN_LOCKTIME_THRESHOLD u500000000` + assert `unlock-burn-height < 500M` in L1 lockup
   verification (`ERR_INVALID_UNLOCK_HEIGHT` / u52). (SDK-side fix lives in secondlayer, not here —
   but affects any lockup-script reasoning in our review report.)
3. Reward-settlement gas refactors (skip `settle-staker-rewards` at zero shares; claim-path
   recompute). Same return shapes.
4. Function set + arity vs clarinet snapshot: identical. Topics likely unchanged — verify vs d78f15a8.
5. 4.0.1 release notes: `/v2/pox` now reports `pox_5_sbtc_contract` + `pox_5_sbtc_registry_contract`;
   `pause-rewards` described as **irreversible** ("pause admin" set at 4.0 activation); private
   `transfer-from-reserve` exists for consensus sBTC moves from reserve.

Fetch the authority:
`https://raw.githubusercontent.com/stacks-network/stacks-core/4.0.1/stackslib/src/chainstate/stacks/boot/pox-5.clar`

## Scope these (in order)

### 1. Re-pin `pox5-bond-ops.ts` to tag 4.0.1
Diff d78f15a8 → 4.0.1 tag. Update `POX5_REVIEW_SHA`, topic/fn lists, priorities, all line refs, and
`reports/pox-5-pre-activation-review.md`. Confirm the ~20 print topics + admin fns survived unchanged;
flag anything added/removed.

### 2. Pause-admin threat model (the headline)
`pause-rewards` is a one-way door — no unpause exists — and at activation the key is
`SP72DMR3MJKS7RVBY33JVV7EEJSQ1PYDVKDP10FX`. Scope:
- **Dossier**: what IS this principal — single-sig? multisig? contract-controlled? funding history,
  first-seen, linked activity (secondlayer Index/SDK). Who operationally holds it (Stacks
  Foundation? core devs?) — check SIP-045 text + stacks-core PR discussion for stated custody.
- **Blast radius**: read the 4.0.1 source — exactly which functions gate on paused state? (claim
  paths only, or settlement too?) What happens to unclaimed rewards, in-flight bonds, L1 lockups
  under permanent pause? Write the honest bug-vs-centralization framing.
- **Rotation risk**: `set-pause-admin` / `set-bond-admin` transfer the roles — key-compromise →
  hostile irreversible pause. Both already P1 in config; scope alert copy + who gets paged.

### 3. Reserve watch
`transfer-from-reserve` is **private** (consensus-invoked) — contract_call triggers can't see it.
Scope monitoring the sBTC reserve via balance deltas + the `reserve-deposit` / tranche fields on
`calculate-rewards` / `bond-distribution` prints. Define the invariant (reserve conservation) and
what deviation pages.

### 4. Activation runbook
- When/how to `applyPlan` against the real boot id (`SP000000000000000000002Q6VF78.pox-5`) — at
  activation, not before; the contract doesn't exist until 960,230.
- **Cross-repo dependency**: secondlayer prod pox-5 print DECODERS are in flight in a separate
  session (not landed). pox-5 has NO node-synthesized events — everything is `print`. Provisioning
  before decoders land = triggers that never fire or fire undecoded. Sequence explicitly; define a
  post-activation smoke check (first `stake` print observed end-to-end).
- Baseline reads at T+0: pause-admin/bond-admin values, `/v2/pox` sbtc contract fields.

### 5. Deliverable
Plan doc in `docs/plans/` + unresolved-questions list. No implementation this session beyond what
the plan approves. (Re-pin in #1 may be approved inline if the diff is clean.)

## Out of scope here
secondlayer-monorepo items (SDK locktime validation, clarinet-pin CI check, node 4.0.1 rollout) —
tracked in the secondlayer session, waiting on the pox5-decoders session to finish.
