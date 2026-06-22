# Clarity Keywords & Types — Auditor Notes

> Asset-safety focused reference for auditing Stacks/Clarity contracts. For each item: what it is, and the gotcha that bites. Companion to [clarity-semantics.md](./clarity-semantics.md) (function-level semantics) and [clarity-functions.md](./clarity-functions.md) (built-in index). Source of truth: https://docs.stacks.co/reference/clarity — re-sync per [../../docs/staying-current.md](../../docs/staying-current.md).

---

## Keywords

### Identity & Authorization

#### `tx-sender` → `principal`
The **original** transaction signer. Mutated to the contract's own principal inside an `as-contract` block.
- **GOTCHA (auth confusion):** Authorizing on `tx-sender` is phishing-prone. A malicious intermediary contract can `contract-call?` into your contract while `tx-sender` still equals the victim user — your `(asserts! (is-eq tx-sender owner))` passes for an attacker-initiated call. Asset transfers gated solely on `tx-sender` allow drain-via-proxy.
- **GOTCHA (`as-contract`):** Inside `as-contract`, `tx-sender` becomes the contract principal. Any `tx-sender`-based check inside that block now compares against the contract, not the user — easy to accidentally bypass user authorization, or to let the contract move its own custodied assets without intended guard. (See incidents #1 ALEX, #7 Charisma in [stacks-incidents.md](./stacks-incidents.md).)

#### `contract-caller` → `principal`
The **immediate** caller of the current contract (the principal one frame up). Changes with every `contract-call?` / `as-contract`.
- **GOTCHA (auth confusion):** `tx-sender` vs `contract-caller` is the #1 audit finding.
  - Use `contract-caller` when you must trust the *direct* caller (e.g., only an allow-listed contract may invoke).
  - Use `tx-sender` only for "is this the human who signed?" — and even then prefer post-conditions + explicit allow-lists.
  - For direct user calls (no intermediary), `tx-sender == contract-caller`. The divergence appears only with nested contract calls — exactly the attack surface. Verify which one each privileged path uses.

#### `current-contract` (Clarity 4) → `principal`
The executing contract's own principal.
- **GOTCHA:** Use this instead of hard-coding the deployer/contract address string for self-reference; hard-coded principals break on redeploy and can be spoofed in copy-paste forks.

#### `tx-sponsor?` (Clarity 2) → `(optional principal)`
Sponsor in a sponsored (fee-delegated) tx, else `none`.
- **GOTCHA:** Never use as an auth source. Presence/identity of a sponsor is attacker-influenceable; treat as untrusted metadata only.

---

### Block / Time (replay, deadlines, vesting, oracles)

#### `block-height` (Clarity 1, **deprecated in Clarity 3**) → `uint`
Legacy Stacks block height.
- **GOTCHA:** In Clarity 3+ contracts, semantics shifted with Nakamoto (Stacks blocks now produced much faster than tenures). Code that assumed pre-Nakamoto block cadence for timelocks/vesting/deadlines will mature far sooner than intended. Flag any deadline math built on `block-height`.

#### `stacks-block-height` (Clarity 3) → `uint`
Current Stacks block height (the modern replacement).
- **GOTCHA:** Post-Nakamoto cadence (~seconds, multiple blocks per Bitcoin tenure). Do not reuse old "blocks ≈ minutes" assumptions when computing durations for lockups, auctions, or cooldowns.

#### `tenure-height` (Clarity 3) → `uint`
Number of tenures elapsed; tracks Bitcoin-anchored cadence (~one per burn block).
- **GOTCHA:** This, not `stacks-block-height`, is the right clock when you want "Bitcoin-paced" timing. Mixing `tenure-height` and `stacks-block-height` in the same time calc produces wildly wrong windows.

#### `burn-block-height` (Clarity 1) → `uint`
Underlying Bitcoin (burnchain) height.
- **GOTCHA (Clarity 3 bug):** Inside an `at-block` expression it **always returns the burn height at the current chain tip**, not the historical value at the referenced block. Any audit of historical/`at-block` snapshots (price oracles, fair-value reads, retroactive eligibility) must treat `burn-block-height` as non-deterministic w.r.t. the snapped block — potential manipulation/incorrect-accounting vector. (Note: `at-block` itself is disabled from epoch 3.4 — see [clarity-semantics.md](./clarity-semantics.md) §6.)

#### `stacks-block-time` (Clarity 4) → `uint`
Unix epoch seconds of current block; respects `at-block`.
- **GOTCHA:** Block timestamps are miner-influenceable within bounds. Never use as a precise/secure clock or randomness source for asset-critical decisions; prefer height-based timing for adversarial settings.

---

### Network / Environment

#### `chain-id` (Clarity 2) → `uint`
`u1` = mainnet, `u2147483648` = testnet.
- **GOTCHA:** If used as a network guard, hard-coded constants drift. Confirm the exact value compared and that test-only branches can't execute on mainnet.

#### `is-in-mainnet` (Clarity 2) → `bool`
True on mainnet.

#### `is-in-regtest` (Clarity 1) → `bool`
True in regression-test env.
- **GOTCHA (both):** A frequent backdoor pattern: "skip auth / mint freely / bypass post-conditions when not mainnet." Audit every branch gated on these — verify the *unsafe* branch is genuinely unreachable on mainnet, and that the boolean sense isn't inverted (`is-in-regtest` true ≠ "is safe to allow"). Test-net-only mint/admin escape hatches must be absent or provably mainnet-disabled.

---

### System State & Constants

#### `stx-liquid-supply` (Clarity 1) → `uint`
Total circulating micro-STX.
- **GOTCHA:** Tempting denominator for "% of supply" governance/economic checks, but it changes block-to-block (mint/burn/unlock). Using it in ratios for quorum, voting power, or collateralization creates a moving target an actor can game by timing; can also `/ 0`-style surprise only if mis-scaled. Verify it isn't assumed constant.

#### `true` / `false` (Clarity 1) → `bool`
Boolean literals.

#### `none` (Clarity 1) → `(optional ?)`
Absence of value.
- **GOTCHA:** A function returning `(ok none)` vs `(ok (some ...))` — callers that `unwrap!` a `none` will abort. For asset flows, an unchecked `none` (e.g., missing map entry treated as success) commonly means "balance assumed 0 / owner assumed valid" — verify `none` is handled, not silently coerced.

---

## Types

### `int` — signed 128-bit
Range **−2¹²⁷ to 2¹²⁷−1**.
- **GOTCHA (overflow aborts):** Arithmetic overflow/underflow does **not** wrap — it **aborts the transaction at runtime** (runtime error, full revert). Good for safety, but a DoS/availability vector: attacker-controlled inputs that push a sum past the bound permanently brick a code path or lock funds. Bound-check before arithmetic on funds.
- **GOTCHA (sign):** Subtraction can go negative legally here (unlike `uint`). Comparisons of signed amounts where unsigned was intended can let negative values slip past `>` checks. (See incident #8 Zest signed-int rewards.)

### `uint` — unsigned 128-bit
Range **0 to 2¹²⁸−1**. Literal syntax `u123`.
- **GOTCHA (underflow aborts):** `(- a b)` with `b > a` aborts (no negative, no wrap). Common in token transfers: subtracting more than the balance reverts — relied upon for safety, but ensure the check produces a clean `(err ...)` rather than an uncaught abort that confuses callers/post-conditions.
- **GOTCHA (int/uint mixing):** `int` and `uint` are not interchangeable; mixing requires explicit conversion (`to-int`/`to-uint`), and `to-uint` of a negative aborts. Audit conversions around amounts.
- **Note:** Almost all asset amounts (STX, FT, NFT ids) are `uint`. Treat any `int` in an amount context as suspect.

### `bool`
`true` / `false`.

### `principal` — standard or contract
Either a standard principal (`SP…`/`ST…`) or a contract principal (`SP….contract-name`).
- **GOTCHA:** Validate which kind a function expects. Passing a contract principal where a standard recipient is assumed (or vice versa) can route assets to an unintended/uncontrolled address. Hard-coded principals in forks point at the original deployer — a real drain risk in copy-pasted code.

### `(response ok-type err-type)`
Used by public functions to commit (`ok`) or abort (`err`). On `err`, **all state changes in that call revert**.
- **GOTCHA (silent drop):** A `(response ...)` returned by an inner `contract-call?` must be checked (`unwrap!`/`try!`/`asserts!`). Ignoring the result lets an `err` from a transfer be discarded while the outer call still succeeds — classic "transfer failed but we credited anyway" accounting bug.
- **GOTCHA (`ok false`):** `try!`/`unwrap!` only check the `err` branch — an `(ok false)` from a `(response bool _)` is treated as success. Assert the unwrapped bool is `true`. (See incident #10.)
- **GOTCHA:** Only `err` from a *public* function reverts at the tx boundary; an `(err ...)` value that's merely returned and not propagated does **not** auto-revert the caller. Confirm errors propagate up.

### `(optional some-type)` — `(some value)` | `none`
- **GOTCHA:** `unwrap!`/`unwrap-panic` on `none` aborts. Map reads (`map-get?`) return `optional` — unhandled `none` from a missing entry is a frequent default-value bug (treating absent balance/owner as zero/valid). Distinguish "not found" from "found, value is 0/none".

### `(buff max-len)` — byte sequence
Max **1,048,576 bytes (1 MiB)**.
- **GOTCHA:** Declared `max-len` is a hard upper bound; appends/concats exceeding it abort. For signatures/hashes verify exact expected length (e.g. 33/65-byte keys, 32-byte hashes) — accepting variable-length buffers in signature checks can enable malleability/forgery.

### `(string-ascii max-len)` / `(string-utf8 max-len)`
ASCII up to 1,048,576 chars; UTF-8 up to 262,144 chars.
- **GOTCHA:** UTF-8 length counts differ from byte length; bound assumptions can mismatch. Generally not asset-critical, but token metadata/URI strings exceeding `max-len` on construction abort.

### `(list max-len entry-type)` — sequences (shared bounds rules)
- **GOTCHA (sequence bounds):** All sequences (`list`, `buff`, strings) are length-bounded at the type level. `fold`/`map`/`filter` over lists are the main batched-asset paths — an oversized or unexpected-length list aborts, and per-element transfers in a fold revert *the entire batch* on any single failing element (all-or-nothing). Verify batch operations can't be wedged by one bad element, and that list length limits don't cap legitimate operations into unusability.
- **GOTCHA (caller-supplied lists):** A `fold`/aggregation over an attacker-controlled list with no dedup can double-count value (collateral, voting power). (See incident #6 Zest duplicate-collateral.)

### Tuples `{ field: type, ... }`
Named-field records.
- **GOTCHA:** Tuple types are structural and exact — field presence/types must match. When tuples carry amounts/owners, an audit should confirm every field that gates a transfer is validated; an unvalidated tuple field (e.g., recipient or amount taken directly from caller input) is a direct injection point.

---

## Quick Auditor Triage

| Symptom | Look at |
|---|---|
| Auth bypass via proxy contract | `tx-sender` used where `contract-caller` needed |
| Timelock/vesting matures wrong | `block-height` (deprecated) vs `stacks-block-height` vs `tenure-height` cadence |
| Historical snapshot manipulable | `burn-block-height` inside `at-block` (Clarity 3 bug) |
| Mainnet backdoor | `is-in-regtest` / `is-in-mainnet` / `chain-id` gated unsafe branch |
| Revert/DoS on funds | `int`/`uint` overflow/underflow aborts on attacker input |
| "Transfer failed, credited anyway" | unchecked `(response …)` from `contract-call?` |
| Missing entry treated as valid | unhandled `none` from `map-get?` |
| Batch wedged / signature forgery | `list` fold all-or-nothing; loose `buff` length in sig checks |
