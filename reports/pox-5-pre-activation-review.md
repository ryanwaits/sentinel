# Pre-Activation Security Review — PoX-5 (SIP-045 "Bitcoin Staking")

> **STATUS: DRAFT — pre-publication.** Scope + one-way-door analysis below are complete
> (code-grounded, deterministic) and **re-pinned to the shipped 4.0.1 bytes (2026-07-20)**. The
> severity-ranked findings table is **pending the agent audit + adversarial-verify pass** (WS1,
> task #3). Do not publish until that section is filled and findings are verified. Activation is
> imminent — pox-5 auto-deploys at Bitcoin block **960,230 (~2026-07-29/30)**; publish before then.

**Targets:**
- `pox-5.clar` — the Epoch-4.0 boot contract (auto-deploys at the hard fork, replaces pox-4).
- `signer-manager.clar` — reference signer-manager for pools.

**Reviewed bytes (pinned):**
- Repo: `stacks-network/stacks-core`, tag **`4.0.1`** — the FINAL Epoch-4.0 release (shipped
  2026-07-15; these ARE the bytes that auto-deploy at Bitcoin block 960,230).
- Commit: **`62e03cc5551bfc574223c2b78ce04ceca30cec37`**.
- `pox-5.clar`: `stackslib/src/chainstate/stacks/boot/pox-5.clar` — 3,845 lines, Clarity 6.
- `signer-manager.clar`: `contrib/core-contract-tests/contracts/signer-manager.clar` — 641 lines
  (byte-identical to the previously reviewed d78f15a8).
- **Delta vs the previously reviewed `d78f15a8`** (pox-wf-integration, 2026-07-02) — full diff is
  88 lines; topics, public/private function sets, and arities are IDENTICAL:
  1. `bond-admin` AND `pause-admin` now initialize to the real principal
     **`SP72DMR3MJKS7RVBY33JVV7EEJSQ1PYDVKDP10FX`** (L348/L353) — no longer the boot-address
     placeholder. The source's own `TODO: this should be set to some predefined multisig for
     mainnet` comment survives directly above the shipped single-sig-format literal.
  2. New `BITCOIN_LOCKTIME_THRESHOLD u500000000` (L88) + assert `unlock-burn-height <
     BITCOIN_LOCKTIME_THRESHOLD` in L1 lockup verification (L2077, `ERR_INVALID_UNLOCK_HEIGHT`
     u52) — rejects lockups whose locktime Bitcoin would interpret as a Unix timestamp.
  3. Reward-settlement gas refactors: `settle-staker-rewards` skipped at zero shares
     (L1695–1703); claim-path earned-rewards recompute via `compute-earned-rewards` (L2536–2541).
     Same return shapes.

**Spec:** SIP-045 V2 markdown (stacksgov/sips PR #270). The stacks.link/sip-pox5 PDF is the
older V1; do not diff against it.

**Date:** 2026-07-20 · **Pipeline:** Audit Sentinel (agent-driven) · Powered by secondlayer.

**Method:** discover→audit→verify pipeline + manual/agent deep-read of the five one-way-door
paths below. **Constraint (stated up front):** the Clarity simnet **cannot** exercise
burnchain-coupled consensus semantics (reward cycles, burn-block ops, epoch transitions).
Consensus-coupled observations ship as reasoned analysis with code cites, clearly labeled;
only pure-Clarity findings (auth, arithmetic, state-machine) get an airgapped PoC. This is a
stated methodology limit, not a hedge.

---

## Verdict

_Pending the audit + verify pass (task #3)._ Note the sprint framing: **one confirmed finding
on a consensus boot contract is ecosystem news; zero findings is still a credibility asset** —
"we reviewed the contract institutions are about to lock BTC against."

## Findings

_Pending the agent audit + adversarial-verify pass. Every bug-tier claim will be
default-refuted on verification and — where pure-Clarity — gated on a green airgapped PoC
before it ships here._

| # | Finding | Auditor sev | Verifier verdict | Honest label | PoC |
|---|---------|-------------|------------------|--------------|-----|
| — | _pending_ | — | — | — | — |

---

## One-way-door analysis (code-grounded; the brief's spine)

Governance is voting to auto-deploy this contract at Epoch 4.0. These five paths are what a
"yes" is committing to. Each is analyzed against the actual pinned code; line numbers are into
`pox-5.clar` at the SHA above. "One-way-door" = irreversible without a **new hard fork** (the
deployed contract cannot be patched).

### 1. `pause-rewards` is permanent and irreversible — confirmed by the code's own comment

- `pause-rewards` (L489) sets `rewards-paused` → `true` (L493), gated on
  `contract-caller = pause-admin` (L491). The contract comment at **L487** states it outright:
  *"This is one-way: there is no unpause function."* There is no `unpause`/`resume` anywhere.
- The only reader of the flag is the claim path (`asserts! (not (var-get rewards-paused))`,
  L2404, inside `claim-rewards`) — once paused, **all signer reward claims revert**
  (`ERR_REWARDS_PAUSED`, err u53). Note: `claim-staker-rewards-for-signer` (L2444) does NOT
  re-check the flag itself; it only mutates settlement state and never transfers sBTC out — the
  actual sBTC egress is gated in `claim-rewards`, so the pause is complete for fund movement.
- **Stranded-funds recovery does not exist in reachable code.** Two functions could move funds
  after a pause — `transfer-from-reserve` (L2696) and `transfer-stranded-rewards` (L2724, the
  pause-specific catch-all) — both `define-private` and, per their own comments, *"not called
  anywhere in the contract, so it can only be called by the node as part of consensus (via the
  SIP process)."* So post-pause, stranded rewards are recoverable **only via a new hard fork.**
- **`pause-admin` is a single-sig key** (L353), init to `SP72DMR3MJKS7RVBY33JVV7EEJSQ1PYDVKDP10FX`
  (c32 version 22 = MainnetSingleSig; NOT a multisig, NOT a contract), transferable via
  `set-pause-admin` (L470). The source's own comment one line above still reads *"TODO: this
  should be set to some predefined multisig for mainnet."* — i.e. the shipped bytes carry the
  placeholder the TODO warns against.
- **Custody (on-chain dossier).** The key's entire history is a single ~13-minute burst on
  **2026-07-15** (the day 4.0.1 shipped, ~2 weeks pre-activation): funded 1,000 STX from an
  unlabeled, unattributable high-throughput wallet (`SP39QDF6…`), then one 1.1-STX outbound at
  nonce 0 — a proof-of-control transfer. It has never deployed a contract or made a contract
  call. On-chain data proves *someone holds the private key* but gives **no link to the Stacks
  Foundation, Hiro, or any named core dev**; no BNS. hash160 `0e26d303…dbcddc` is unpatterned
  real-key material (not a burn/vanity placeholder).
- **Governance is committing to:** a single-sig key — funded from an anonymous wallet two weeks
  before the fork, with no public custody attestation — that can permanently halt all signer
  reward claims, with no in-contract reversal and no reachable path to release stranded rewards.
  Honest label: **centralization / governance one-way-door**, not an outsider-exploitable bug.
  *Open for the audit pass / disclosure:* who operationally holds this key and whether the
  post-activation rotation to a multisig (the TODO) is planned.
- **Spec-vs-implementation divergence (worth stating plainly).** The literal was set by
  `stacks-core#7416` "set mainnet admins" (merged 2026-07-15, no human review comments), which
  inserted the single-sig key *directly beneath the surviving `TODO: …predefined multisig`*.
  SIP-045 §3.3.1 ratified a **per-distribution, delay-window** circuit-breaker ("can pause **a
  distribution**… cannot redirect rewards") operated by "the Endowment"; the shipped
  `pause-rewards` is a **global, permanent** halt of *all* signer claims. The SIP names no key
  holder, threshold, or ceremony (§8.1 trust table has no admin-key row). So the deployed power
  is broader than the text governance voted on, and its custody is unattested. Release notes
  confirm the admin "is set initially at 4.0 activation" but say nothing about who holds it.

### 2. Reserve draw requires a hard fork — the reserve is write-only in deployed code

- `reserve-balance` (L384) is **only ever incremented** in reachable code: in `calculate-rewards`
  (`var-set reserve-balance new-reserve-balance`, L2210), by `reserve-cut` plus any unallocated
  staker cut. Read-only getter `get-reserve-balance` (L3293).
- The **only** decrement is `transfer-from-reserve` (L2696), which is `define-private` and — per
  its comment — *"not called anywhere in the [contract]."*
- **Therefore the reserve can accumulate but cannot be paid out by the deployed contract.** Any
  coverage draw / depletion path requires new code = a hard fork. This confirms the accepted
  draft's flagged risk.
- **Governance is committing to:** "the reserve fund can only be spent by a future hard fork."
  Honest label: **by-design one-way-door.** *Open for the audit pass:* whether SIP-045 §3.6.1's
  coverage-ratio mechanism is supposed to have an in-contract draw and simply doesn't yet.

### 3. Early-exit signer set — on-chain exit is staker-pinned to the registration signer

- `announce-l1-early-exit` (L1196) requires `contract-caller = tx-sender = staker`:
  **only the staker announces their own exit** — not a signer, not a pool, not via a proxy
  contract.
- It takes an `old-signer-manager` trait and asserts `old-signer = signer` recorded in the bond
  membership (L1222, `ERR_INVALID_OLD_SIGNER_MANAGER`): the exit is **bound to the signer
  recorded at bond registration** — a changed signer set cannot announce the exit.
- Guarded against prepare-phase mutation (L1210) and signer-manager-trait reentrancy (L1213);
  zeroes the membership sats and records the announce map (L1232–1243).
- The **actual L1 UTXO time-lock release signing is off-chain** and is **not defined in
  `pox-5.clar`.** So the accepted draft's "who signs the L1 early-exit release?" is answered
  on-chain only in the negative: the *Stacks-side* announce is staker-driven and pinned to the
  registration signer; the L1 signing authority itself lives outside this contract.
- **Governance is committing to:** an early-exit whose Stacks-side leg is tightly constrained,
  but whose L1 signing authority is out of scope of the reviewed code. *Open for the audit pass
  / disclosure to the team:* the off-chain signer handoff at exit is the real unknown and should
  be documented by the SIP, not the contract.

### 4. Admin setters — two disjoint keys, enumerated

- Two admin roles, **both init to the same single-sig key `SP72DMR3MJKS7RVBY33JVV7EEJSQ1PYDVKDP10FX`**
  in shipped 4.0.1 (they are *nominally* disjoint roles but *actually* the same holder at genesis):
  - **`bond-admin`** (L348), transferred via `set-bond-admin` (L451, gated on current holder).
    Gates `setup-bond` (L532: `is-eq contract-caller (var-get bond-admin)`), `add-to-allowlist`,
    `set-burnchain-parameters`.
  - **`pause-admin`** (L353), transferred via `set-pause-admin` (L470). Gates **only** the
    irreversible `pause-rewards` (L491, path 1).
- The setter logic keeps the two roles disjoint (each `set-*-admin` transfers **only** its own
  role, gated on the current holder — no cross-role escalation on the face of it), **but at
  genesis a single key holds both** — so the "two disjoint keys" separation is a property the
  holder must *establish* by rotating one role away, not a property the shipped state has.
- **Governance is committing to:** two standing keys — one that can permanently pause reward
  claims, one that administers bond setup. *Open for the audit pass:* full unilateral-capability
  enumeration per admin, and whether any bond-admin action can strand or misallocate stake.

### 5. Tranche accounting — T1-first, reserve second, T2 residual (matches SIP §3.6)

- `calculate-rewards` (L2158, public, reentrancy-guarded, "already computed" guard):
  1. Bond (Tranche-1 / BTC-staker) rewards computed first via `fold calculate-bond-rewards`;
     the remainder is `remaining-rewards`.
  2. `reserve-cut = remaining-rewards * RESERVE_RATIO / 10000` (**integer division**, floors);
     Tranche-2 (STX-staker) rewards = `remaining-rewards - reserve-cut`.
  3. Per-ustx accrual is `stx-staker-rewards * PRECISION / cycle-staked-ustx` (integer division,
     floors).
- **No-STX-staker cycle:** the staker cut is folded into the reserve — value grows the reserve,
  it is not lost or double-counted.
- The **ordering (T1 → reserve → T2 residual) matches SIP-045 §3.6** (T1 fixed BTC-staker yield
  funded first, T2 residual for STX-only).
- *Open for the audit pass:* the two integer-division floors (reserve-cut, per-ustx) are the
  rounding/dust surface; whether any bond-period ordering in the `fold` lets an early bond
  starve a later one of `available-rewards` is a state-machine question for the auditors.

---

## `signer-manager.clar` — reference-contract trust surface

**Caveat first (honesty):** the `signer-manager.clar` in `contrib/core-contract-tests/` is a
**reference** implementation, hard-wired to **testnet** addresses — it calls
`ST000000000000000000002AMW42H.pox-5` (the testnet boot principal, L540/L543/L560) and a fixed
sBTC token principal. It is the pattern pools (jBTC, Xverse Earn) will **fork**, not a deployed
mainnet artifact. So this section reviews the *pattern*; a pool's actual wrapper needs its own
audit. (`signer-manager.clar` is byte-identical between the prior d78f15a8 review and tag 4.0.1.)

- **The admin set can be emptied irreversibly — no minimum-admin floor.** `admins` is a map
  (L51), bootstrapped to the deployer at genesis (`map-set admins tx-sender true`, L55).
  `update-admin` (L424, admin-gated) can enable **or disable any principal** (L435) — including
  the last admin disabling itself. There is no re-bootstrap path after deploy, so an emptied
  admin set **permanently bricks** every admin function (`update-fees`, `withdraw-fees`,
  `sweep-fee-refunds`, `register-self`). Honest label: **operational one-way-door** (footgun /
  governance hygiene), not an outsider exploit. `authorize-admin` (L549) also requires
  `contract-caller = tx-sender`, so admins must act as EOAs — no contract-proxied admin path.
- **Fees apply retroactively to already-earned rewards.** The contract's own header comment
  (L7–11) is explicit: after `update-fees` (L441) raises the rate, a staker who has not yet
  claimed pays the new rate on rewards earned *before* it was set. Fees are capped
  (`< MAX_BIPS`, L444), so this is bounded — but it is a real fee-governance trust surface for
  anyone building an LST on top. Label: **centralization / trust.**
- **Fee extraction is bounded away from staker principal — well-constructed.** `withdraw-fees`
  (L456) asserts `amount <= earned-fees` (L462) and moves only the fee accumulator.
  `sweep-fee-refunds` (L498) computes `sweepable = balance − (earned-fees + withdrawal-liability
  + unclaimed-staker-rewards)` (L503–509); the 20-line comment (L476–497) is a careful argument
  that it can **never** sweep staker-owed funds (a rejected-but-unreclaimed refund sits in both
  the balance and the liability, so the two cancel). This accounting invariant is the primary
  thing the audit pass should **adversarially verify** across every withdrawal path.

---

## What we'd monitor post-activation (retainer teaser)

Sentinel's live product is continuous, audit-informed monitoring. For PoX-5 bonds, the
high-signal events — provisioning config already written (WS4), exercised against a fixture
until testnet exists — are:

- **`announce-l1-early-exit`** (exit intent on a live bond — the T-0 signal for a staker leaving).
- **`pause-rewards`** (the irreversible kill switch — path 1).
- **`set-bond-admin` / `set-pause-admin`** (admin-key rotation — path 4).
- **Reserve movements** (`calculate-rewards` reserve deposits — path 2/5).

Delivered as ed25519-signed webhook alerts (existing Sentinel webhook/monitoring machinery),
per-topic and per-admin-key. Sell only after a testnet deploy exists.

---

*Powered by secondlayer (public SDK + hosted Subscriptions). We review code; we take no side in
the SIP-045 vote.*
