# Clarity Semantics — Auditor Reference (asset-safety)

Security-relevant Clarity behavior every `auditor-*` and the `verifier` MUST reason
with. Distilled from the official Clarity functions reference. Complete function
index: [clarity-functions.md](./clarity-functions.md). Keyword/type notes:
[clarity-keywords-types.md](./clarity-keywords-types.md) (generated). Source of
truth = https://docs.stacks.co/reference/clarity — re-check on each Clarity epoch.

> Version tags: **C1/C2/C3/C4** = Clarity version a feature was introduced.
> Epoch notes matter — some features are disabled/changed by hard fork.

## 1. Arithmetic aborts (no wraparound) — the #1 thing EVM intuition gets wrong
- `+ - * / mod pow`: overflow / underflow / divide-by-zero → **runtime error,
  whole tx ABORTS and rolls back**. There is **no silent wraparound** → classic
  EVM "underflow drain" does NOT apply. The real risk is **unexpected abort = DoS**
  (a function path that always reverts → funds stuck). This is exactly Finding 1's
  shape: `socialize-debt` drives `total-assets`→0, then `redeem` math aborts
  (`ERR-OUTPUT-ZERO`) and sBTC is permanently locked.
- `bit-shift-left` / `bit-shift-right`: **deliberately IGNORE overflow.** Never
  treat shifts as safe multiply/divide — use `* / pow` when overflow must trap.
- `to-uint i`: aborts if `i` negative. `to-int u`: aborts if `u >= 2^127`.
- `pow`: `i2` negative or `> u32::MAX` → abort. `log2` / `sqrti`: abort on negative.
- `int` vs `uint` are distinct; comparisons/ops require matching types (type error
  otherwise). uint range `0..2^128-1`; int is signed 128-bit.

**Heuristic (interest-math, invariants-dos):** trace every arithmetic path on
attacker-influenced inputs; an input that forces an abort on a withdraw/redeem path
is a fund-lock DoS even with no "theft."

## 2. Responses, reverts, control flow
- `define-public` MUST return `(response ok err)`. **Returning `(err ...)` rolls
  back ALL datamap/token changes in that call.** `(ok ...)` commits.
- `contract-call?`: if the callee returns `(err ...)`, **DB changes from that call
  are aborted** (but the caller decides whether to propagate). Unchecked intermediary
  responses are a bug — `begin` notes intermediary responses must be checked.
- `try!` / `unwrap!` / `unwrap-err!`: on `none`/`err` they **early-return** from the
  current function (control-flow exit). `asserts!` returns its thrown-value on false.
- `unwrap-panic` / `unwrap-err-panic`: on the bad case they **ABORT the tx** (no
  graceful error) — a panic path on attacker input = DoS vector.
- `define-read-only`: cannot mutate state (enforced at analysis + runtime).

## 3. Token primitives — "anyone can call; guards expected"
- `ft-transfer?` and `nft-transfer?`: **any principal can invoke the asset op — the
  language does NOT gate the caller.** The *contract* must add auth guards. Missing
  guards around a transfer of contract-held assets = drain. (reentrancy/
  access-control dimensions.)
- `ft-mint?` / `ft-burn?` / `ft-transfer?` of **non-positive amount → `(err ...)`
  and revert** (e.g. amount 0). So "mint/burn 0" cannot move balances — a refutation
  the `verifier` should apply before confirming exploits relying on zero-amount ops.
- `ft-transfer?` err codes: u1 insufficient, u2 sender==recipient, u3 non-positive.
  `nft-transfer?`: u1 not owner, u2 same principal, u3 nonexistent.
- `stx-transfer?` / `stx-burn?`: **`sender` MUST equal `tx-sender`** (else `(err u4)`)
  → inside `as-contract`, sender becomes the contract principal.
- `define-fungible-token` with a supply cap: `ft-mint?` past the cap aborts.
- Donation/external balance changes can't move share price when accounting is
  **internal** (tracked in data-vars, not `ft-get-balance`/`stx-get-balance` of
  self) — the `verifier` should check whether accounting is internal before
  confirming a donation/inflation attack. (share-accounting dimension.)

## 4. Authorization model — tx-sender vs contract-caller (classic footgun)
- `tx-sender`: original signer of the tx. `contract-caller`: immediate caller (the
  contract that did the `contract-call?`). Auth checks using the **wrong one** are a
  top finding: gating on `tx-sender` lets an intermediary contract act on a user's
  behalf; gating on `contract-caller` may break/again over-trust. (access-control.)
- `as-contract expr` (**C1, DEPRECATED in C4**): runs `expr` with `tx-sender` = the
  contract principal. Used for the contract to move its own assets. Over-broad use =
  the contract can be tricked into spending its holdings.
- **`as-contract?` (C4)**: replaces `as-contract`; switches BOTH `tx-sender` and
  `contract-caller` to the contract, and **enforces asset-outflow allowances**
  (`with-stx` / `with-ft` / `with-nft` / `with-stacking`, or `with-all-assets-unsafe`).
  Returns `(response A uint)`; `(err index)` on the first violated allowance.
- **`restrict-assets?` (C4)**: wraps a body with outflow allowances for a given
  `asset-owner`; reverts if outflows exceed grants. **Major asset-safety primitive.**
- **`with-all-assets-unsafe`**: disables all asset protection inside the block —
  **flag every usage**; only acceptable behind a verified-trusted callee.

**Heuristic (access-control):** on C4 contracts, *absence* of `restrict-assets?` /
`as-contract?` allowances around external/dynamic calls is a real weakness; presence
of `with-all-assets-unsafe` is a red flag. On C1–C3 contracts, scrutinize every
`as-contract` + the tx-sender/contract-caller choice on each privileged path.

## 5. Dynamic dispatch / traits (reentrancy & untrusted-callee)
- `contract-call?` to a **trait parameter** (`<trait>`) targets a caller-supplied
  contract → untrusted code runs. Clarity has no shared mutable reentrancy like EVM,
  but **state read before an external trait call can be stale after it**, and the
  callee can re-enter public fns. Check ordering: validate/lock → external call →
  settle. (reentrancy / flashloan-economics dimensions.)
- `contract-of <trait>` gives the concrete principal — auth/allow-listing should use
  it. `impl-trait` / `use-trait` define/import; `contract-hash?` (C4) returns the
  code hash → can pin/verify a callee's code.

## 6. Block info, time, randomness (oracle / invariants)
- **`at-block` is DISABLED from epoch 3.4** (SIP-042): any execution reaching it is a
  runtime error; new contracts using it are rejected. Treat any `at-block` as
  dead/abortable.
- `get-block-info?` **removed in C3** → use `get-stacks-block-info?` (Stacks block)
  and `get-tenure-info?` (tenure). Auditing legacy contracts: flag `get-block-info?`.
- Block `time` is **not monotonic**, accurate only ~±2h; post-epoch-3.0 all blocks in
  a tenure share a timestamp. **Never** use block time/height/`vrf-seed`/hashes as a
  secure randomness or precise-time source — manipulable/coarse. (oracle, economic.)
- `stx-account` / `stx-get-balance` have a known bug **inside `at-block`** for locked
  (stacking) tokens — fixed in Clarity 5; moot now that `at-block` is disabled.

## 7. Serialization & misc footguns
- `to-consensus-buff?` returns `none` if the value is too large to serialize — an
  unchecked `unwrap-panic` on it is a DoS path.
- `from-consensus-buff?` returns `none` on type mismatch — validate before trusting.
- `map-set` is a **blind overwrite**; `map-insert` only writes if absent. Using
  `map-set` where `map-insert` was intended can clobber state (e.g. re-init).
- `define-constant` evaluates at deploy in source order — ordering bugs at init.
- `principal-construct?` / `is-standard`: network-version checks; mis-handling the
  testnet/mainnet version byte can mis-route assets.

## Clarity-4 asset-safety checklist (new surface to audit)
- `as-contract?` + `restrict-assets?` allowances used around outflows / external
  calls? (good) — or `with-all-assets-unsafe` present? (red flag)
- `contract-hash?` used to pin trait callees?
- Legacy `as-contract` / `at-block` / `get-block-info?` remaining? (migration smells)
- `secp256r1-verify`, `to-ascii?` newly available — check input-size assumptions.

## How auditors use this
Each `auditor-*` subagent loads this file's section(s) for its dimension before
reviewing source. The `verifier` uses §1–§3 to REFUTE: most false "exploits" die on
"that path aborts/reverts" or "amount 0 errors" or "accounting is internal." Confirm
only mechanically-correct exploits; correct severity; then `run_simnet_poc`.
