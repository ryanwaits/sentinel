# Clarity Built-in Functions — Complete Index

Authoritative source: https://docs.stacks.co/reference/clarity (functions, keywords,
types). **Re-sync on every Clarity epoch / version bump** — see
[staying-current.md](../../docs/staying-current.md). Security semantics +
asset-safety heuristics live in [clarity-semantics.md](./clarity-semantics.md);
`⚠` marks functions with a documented auditing gotcha covered there.

Version tags: **C1/C2/C3/C4** = Clarity version introduced. Some entries note
deprecations / epoch disables.

## Arithmetic ⚠ (overflow/underflow/div-0 ABORT — no wraparound, see semantics §1)
| fn | since | sig | note |
|---|---|---|---|
| `+` `-` `*` `/` | C1 | `(* i1 i2 ...)` | variadic; overflow/underflow/÷0 abort |
| `mod` | C1 | `(mod i1 i2)` | ÷0 aborts |
| `pow` | C1 | `(pow i1 i2)` | overflow aborts; i2<0 or >u32::MAX aborts |
| `log2` | C1 | `(log2 n)` | aborts on negative |
| `sqrti` | C1 | `(sqrti n)` | floor sqrt; aborts on negative |
| `to-int` | C1 | `(to-int u)` | aborts if u ≥ 2^127 |
| `to-uint` | C1 | `(to-uint i)` | aborts if i < 0 |

## Bitwise ⚠ (shifts IGNORE overflow — not safe arithmetic)
`bit-and` `bit-or` `bit-xor` `bit-not` (C2) · `bit-shift-left` `bit-shift-right` (C2, mod-128 shamt) · `xor` (C1)

## Comparison & logic
`<` `<=` `>` `>=` (C1; C2.1 adds string/buff compare) · `is-eq` (C1, no short-circuit) · `and` `or` (C1, lazy/short-circuit) · `not` (C1)

## Sequences (list / buff / string-ascii / string-utf8)
`append` `concat` `len` `list` (C1) · `as-max-len?` (C1) · `element-at?` (C2; `element-at` C1 deprecated) · `index-of?` (C2; `index-of` C1 deprecated) · `slice?` `replace-at?` (C2) · `filter` `fold` `map` (C1) · `to-ascii?` (C4)

## Options & responses (control flow, reverts) ⚠ semantics §2
`ok` `err` `some` (C1) · `is-ok` `is-err` `is-none` `is-some` (C1) · `default-to` (C1) · `match` (C1) · `try!` `unwrap!` `unwrap-err!` (C1, early-return) · `unwrap-panic` `unwrap-err-panic` (C1, **ABORT tx**) · `asserts!` (C1) · `if` `begin` `let` (C1)

## Tuples, maps, data-vars
`tuple` / `{..}` `get` `merge` (C1) · `map-get?` `map-set` `map-insert` `map-delete` (C1) — ⚠ `map-set` blind-overwrites, `map-insert` only-if-absent · `var-get` `var-set` (C1) · `define-constant` `define-data-var` `define-map` (C1)

## Fungible tokens ⚠ semantics §3 (anyone can call; non-positive amount errs+reverts)
`define-fungible-token` (C1, optional supply cap) · `ft-mint?` `ft-burn?` `ft-transfer?` `ft-get-balance` `ft-get-supply` (C1)

## Non-fungible tokens ⚠ ("any user can transfer — add guards")
`define-non-fungible-token` (C1) · `nft-mint?` `nft-burn?` `nft-transfer?` `nft-get-owner?` (C1)

## STX ⚠ (sender must == tx-sender, else err u4)
`stx-transfer?` `stx-burn?` `stx-get-balance` (C1) · `stx-transfer-memo?` `stx-account` (C2) — ⚠ at-block locked-balance bug (fixed C5; at-block now disabled)

## Authorization / contract context ⚠ semantics §4
| fn | since | note |
|---|---|---|
| `as-contract` | C1 | **DEPRECATED C4**; sets tx-sender=contract |
| `as-contract?` | C4 | sets tx-sender+contract-caller; enforces asset allowances; `(response A uint)` |
| `restrict-assets?` | C4 | asset-outflow allowance guard — **key safety primitive** |
| `with-stx` `with-ft` `with-nft` `with-stacking` | C4 | allowances inside the above |
| `with-all-assets-unsafe` | C4 | **disables asset protection — flag every use** |
| `contract-call?` | C1 | err from callee aborts callee's DB changes; ⚠ dynamic dispatch on `<trait>` = untrusted callee |
| `contract-of` | C1 | concrete principal of a trait param (use for allow-listing) |
| `contract-hash?` | C4 | SHA-512/256 of contract code — pin/verify callees |

## Principals
`principal-of?` (C1) · `principal-construct?` `principal-destruct?` `is-standard` (C2) — ⚠ network version-byte handling

## Crypto / hashing
`hash160` `keccak256` `sha256` `sha512` `sha512/256` (C1) · `secp256k1-recover?` `secp256k1-verify` (C1) · `secp256r1-verify` (C4)

## Block / tenure info ⚠ semantics §6 (time coarse & non-monotonic; not randomness)
`get-stacks-block-info?` `get-tenure-info?` (C3) · `get-burn-block-info?` (C2) · `get-block-info?` (C1, **removed C3**) · `at-block` (C1, **DISABLED epoch 3.4 — SIP-042**)

## Conversions / serialization
`int-to-ascii` `int-to-utf8` `string-to-int?` `string-to-uint?` (C2) · `buff-to-int-be` `buff-to-int-le` `buff-to-uint-be` `buff-to-uint-le` (C2) · `to-consensus-buff?` `from-consensus-buff?` (C2) — ⚠ return `none` on too-large / type-mismatch · `print` (C1, returns input)

## Definitions / traits (top-level only)
`define-public` `define-private` `define-read-only` `define-constant` `define-data-var` `define-map` `define-fungible-token` `define-non-fungible-token` `define-trait` (C1) · `impl-trait` `use-trait` (C1)

---
**Clarity 4 additions to audit for:** `as-contract?`, `restrict-assets?`,
`with-*` allowances, `with-all-assets-unsafe`, `contract-hash?`, `secp256r1-verify`,
`to-ascii?`. **Disabled/removed to flag in legacy code:** `at-block` (epoch 3.4),
`get-block-info?` (C3), `as-contract` (deprecated C4), `element-at`/`index-of`
(deprecated C2).
