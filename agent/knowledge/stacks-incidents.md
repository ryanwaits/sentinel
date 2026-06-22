# Documented Stacks Asset-Safety Incidents

A curated, source-verified knowledge base of real asset-safety incidents on Stacks (and closely related Bitcoin-DeFi protocols), built for the Audit Sentinel auditor subagents. Each entry is labeled with a **CLASS** so reviewers know whether contract-logic auditing could plausibly have caught it.

## Honesty note (read first)

Our tool audits **Clarity contract logic**. A large share of headline Stacks/Bitcoin-DeFi losses by dollar value are **NOT** contract-logic bugs — they are **key compromises** (stolen deployer/admin keys, usually via phishing) or **off-chain oracle/data-feed defects**. Those would not be caught by reading the contract source, no matter how good the audit. We label every incident's CLASS explicitly:

- `logic-bug` — a Clarity contract-logic / access-control / input-validation flaw. **In scope** for our audit.
- `key-compromise` — stolen privileged key / opsec failure. **Out of scope** for contract-logic auditing (the contract behaved as written for a holder of the key). Listed for completeness and contrast.
- `oracle` — off-chain data-feed integrity / economic pricing defect. **Partially in scope**: only catchable if the contract itself lacks in-contract sanity bounds, staleness/timestamp checks, or circuit breakers.

The six audit dimensions our subagents apply: **access-control, reentrancy, share-accounting, interest-math, flashloan-economics, invariants-dos**.

**Bottom line on confirmed in-scope incidents:** The clearly-confirmed *contract-logic* exploits with concrete on-chain detail are a small set — ALEX (2025), Arkadiko Swap (2021), Zest (2024), and Charisma (2024). The two largest-by-headline ALEX incidents include one (the XLink bridge) that is purely key-compromise and out of scope. Several entries below are recurring audit-finding *patterns* (from formal audits, not live exploits) and are flagged as such.

---

## 1. ALEX Protocol — self-listing vault access-control exploit

- **Date:** 2025-06-06
- **Protocol:** ALEX Lab (ALEX Protocol AMM/vault, Stacks)
- **Estimated loss:** ~$8.3M official ($8,373,227 cited); independent analysis up to ~$16M including unreimbursed aBTC/ALEX. Largest exploit in Stacks DeFi history.
- **CLASS:** `logic-bug` (in scope) — confidence: high

**Root cause.** A Clarity access-control / caller-context flaw in the AMM vault and self-listing feature. The attacker deployed a malicious SIP-010 token (`ssl-labubi-672d3` / `ssl-labubu-672d3`) whose `transfer` function contained hostile logic, created a Labubu/STX pool, and called `set-approved-token` so the vault granted the attacker-controlled contract vault-level permissions, then flipped `set-enable-farming`. Because the vault executed transfers via `(as-contract ...)`, the caller identity reported to authorization checks was the vault itself (not the attacker's token contract), bypassing access checks. The self-listing path failed to validate the listed token. The attacker invoked `swap-x-for-y` and drained STX, ALEX, sUSDT, sUSDC, xBTC and USDA pools. Genuine contract logic flaw (missing validation + over-broad trust in self-listed token contracts under `as-contract`), not a key compromise. The exploited code was reportedly outside recent audit scope.

**Exploited functions / pattern:** `set-approved-token`, `set-enable-farming`, `swap-x-for-y`, `as-contract` (privilege assumption during swap), attacker-token `transfer`, self-listing verification logic.

**Sources:**
- https://www.halborn.com/blog/post/explained-the-alex-protocol-hack-june-2025
- https://rekt.news/alexlab-rekt2
- https://www.theblock.co/post/357368/stacks-based-alex-lab-to-reimburse-users-after-8-3-million-exploit-as-token-drops-45
- https://cointelegraph.com/news/bitcoin-defi-platform-alex-protocol-loses-8-3m-to-exploit
- https://www.guardrail.ai/blog/alex-protocol-hack-june-2025
- https://www.vibraniumaudits.com/post/alex-protocol-hit-by-major-exploit-8-3-million-in-assets-stolen
- https://x.com/ALEXLabBTC/status/1931014419133169734

**Our dimensions that catch it:**
- **access-control** — the privileged setters (`set-approved-token`, `set-enable-farming`) and the vault's transfer authorization.
- **invariants-dos** — the broken invariant that only validated, protocol-owned tokens may receive vault permissions.

**Detection heuristic for an auditor subagent:**
> Flag any function that grants a token/contract elevated permissions (allowlists, approved-token registries, "set-approved-*") when the token contract is **caller-supplied / self-listed** and not validated against a hardcoded or governance-gated set. Separately, flag any authorization check that reads identity from `tx-sender` while the protected operation runs inside `(as-contract ...)` — under `as-contract` the sender becomes the contract principal, so the check is satisfied by anyone routing through that path. Require `contract-caller`-based checks (or explicit asserted-principal allowlists) for privilege grants, and require that dynamically-dispatched token traits cannot be attacker-deployed for vault-permissioned flows.

---

## 2. ALEX Lab — XLink bridge private-key compromise

- **Date:** 2024-05-14 (disclosed 2024-05-15)
- **Protocol:** ALEX Lab / XLink cross-chain bridge (Stacks <-> BNB Chain)
- **Estimated loss:** ~$4.3M (~$0.3M BTC, ~$3.3M stablecoins, plus other tokens; ~13.7M STX cited in some reports)
- **CLASS:** `key-compromise` (**OUT OF SCOPE** for contract-logic auditing) — confidence: high

**Root cause.** Compromise of the deployer/admin private key controlling the XLink Bridge Endpoint, reportedly via phishing. With the stolen key the attacker pushed four-to-five malicious upgrades to the Bridge Endpoint proxy contract, pointing it to unverified/malicious bytecode, then assumed admin control and drained funds. CertiK attributed the root cause to a compromised key; ALEX Lab and ZachXBT later linked it to the Lazarus Group. The contracts behaved as designed for a holder of the privileged key — this is an opsec/key-management failure plus centralized-upgrade-authority risk, **not** a Clarity logic flaw.

**Exploited functions / pattern:** Bridge Endpoint proxy contract upgrade (admin/deployer-authorized) via stolen key.

**Sources:**
- https://rekt.news/alexlab-rekt
- https://www.coindesk.com/business/2024/05/15/bitcoin-defi-tool-alex-lab-loses-43m-in-hack-offers-10-bounty-for-stolen-funds
- https://www.certik.com/resources/blog/alex
- https://neptunemutual.com/blog/taking-a-closer-look-at-alex-lab-exploit/
- https://cryptoslate.com/bitcoin-defi-app-alex-lab-links-4-million-exploit-to-lazarus-group/
- https://www.theblock.co/post/301722/bitcoin-defi-alex-lab-lazarus
- https://cointelegraph.com/news/bitcoin-layer-2-alex-lab-may-exploit-lazrus-group-north-korea

**Our dimensions that catch it:** None directly — no contract-logic dimension catches a stolen key. The only auditable adjacency is **access-control** as a *centralization-of-upgrade-authority concern*: a single key able to upgrade a bridge endpoint is a finding even when the code is correct.

**Detection heuristic for an auditor subagent:**
> Do not claim this class of incident is "caught." Instead, note as an informational/centralization finding any contract whose value-bearing logic can be replaced by a single privileged principal (upgradeable proxy, swappable endpoint, owner-only `set-implementation`). Recommend multisig/timelock on upgrade authority. Flag clearly that this is opsec/governance, not a logic guarantee.

---

## 3. Arkadiko Swap — LP-token validation exploit

- **Date:** 2021-10-27
- **Protocol:** Arkadiko Finance (Arkadiko Swap AMM)
- **Estimated loss:** ~$1.5M (~400,000 STX + ~740,000 USDA, ~25% of the STX/USDA pool)
- **CLASS:** `logic-bug` (in scope) — confidence: high

**Root cause.** Insufficient validation in the Clarity Swap contract's pair-creation function (bug cited at **line 189**): when creating a new trading pair, the contract did not verify that the supplied LP token was the legitimate, unique LP token for that pair. The attacker created a bogus pair re-using the existing `wstx-usda` LP token, was credited a large quantity of those legitimate LP tokens at zero cost, then redeemed them to withdraw the real underlying STX and USDA from the genuine STX/USDA pool. Purely a missing-validation / broken-invariant flaw. The team disabled Swap, ran the same exploit to recover ~88% of remaining LP assets, and deployed a contract to burn the attacker's 740k USDA.

**Exploited functions / pattern:** `create-pair` / `add-pair` (missing LP-token binding validation, line 189), mint LP token, `remove-liquidity` / `reduce-position` (redeem reserves).

**Sources:**
- https://arkadikofinance.medium.com/arkadiko-swap-detailed-post-mortem-b79f8a68f922
- https://arkadikofinance.medium.com/arkadiko-swap-post-mortem-f38cef95ff28
- https://www.beosin.com/resources/stacks-and-its-clarity-contract-security

**Our dimensions that catch it:**
- **share-accounting** — LP tokens are pool shares; minting legitimate shares against a fake pair is a share-accounting break.
- **invariants-dos** — the missing invariant "each pair has exactly one unique LP token bound to it."
- **access-control / input-validation** — unvalidated, caller-supplied LP-token reference.

**Detection heuristic for an auditor subagent:**
> In any AMM/pool factory, flag pair/pool creation that accepts a caller-supplied LP-token (or share-token) reference without asserting it is freshly created and uniquely bound to the new pair (e.g., `is-eq existing-lp none`, or deriving the LP token deterministically). Verify the invariant: minting LP shares must be reachable only through the canonical pool whose reserves back them. Trace whether minted shares from one pool can be redeemed against another pool's reserves.

---

## 4. Arkadiko — oracle glitch (CoinMarketCap price spike)

- **Date:** 2021-12-14
- **Protocol:** Arkadiko (Stacks stablecoin/vault protocol)
- **Estimated loss:** unknown / not quantified in sources
- **CLASS:** `oracle` (partially in scope) — confidence: medium

**Root cause.** Off-chain oracle data-integrity failure. Arkadiko's price oracle depended in part on CoinMarketCap data. A CMC/Coinbase glitch briefly reported STX at >$21M; the oracle forwarded this inflated price on-chain. Vaults treated collateral as massively over-valued, letting a few wallets mint millions of unbacked USDA and extract STX, depegging USDA. The defect is an off-chain data feed plus the absence of in-contract sanity bounds / deviation checks — not a Clarity exploit or key compromise.

**Exploited functions / pattern:** oracle price update (no deviation/bounds sanity check), vault collateral valuation / USDA mint.

**Sources:**
- https://arkadikofinance.medium.com/arkadiko-oracle-glitch-aftermath-23dc1b742513
- https://cryptopotato.com/coinmarketcap-glitch-shows-prices-of-cryptocurrencies-in-the-order-of-several-trillions-of-dollars-per-coin/
- https://www.nasdaq.com/articles/coinmarketcap-shows-crypto-spike-bitcoin-flippening-in-apparent-glitch

**Our dimensions that catch it:**
- **interest-math / invariants-dos** — collateral valuation math that accepts an unbounded external price violates the over-collateralization invariant.
- (Adjacent) **flashloan-economics** — same family of "price-fed value extraction," though here the bad price came from a feed glitch, not a manipulated pool.

**Detection heuristic for an auditor subagent:**
> Flag any collateral-valuation or mint path that consumes an external oracle price without (a) a maximum deviation / circuit-breaker check vs the last accepted price, (b) absolute sanity bounds, and (c) a staleness/timestamp check. The contract should reject or pause on prices outside plausible bounds. Note that a correct contract can still be drained by a bad feed — the in-scope finding is the *absence of in-contract guards*, not the feed itself.

---

## 5. Velar PerpDEX — oracle / AMM drain (Stacks, later replicated on Mezo)

- **Date:** 2026-01-26
- **Protocol:** Velar (Stacks perpetual DEX)
- **Estimated loss:** ~$401k on the BTC/MUSD pool (2.257 BTC + 250,077 MUSD), attacker net ~$250k; ~$72M of volume routed across 236+ wallets. NOTE: public sources do not cleanly separate the Stacks-only figure from the later Mezo replication (~$401k, 87 wallets).
- **CLASS:** `oracle` (partially in scope) — confidence: medium

**Root cause.** Economic/oracle design flaw in Velar's perpetual-swap pool. The perp contracts lacked oracle price timestamp/staleness checks; the Pyth oracle on Stacks pulled fresh prices based on on-chain activity, so during low legitimate activity the attacker could control when/how prices updated. By cycling `open-long -> close` for BTC then `open-short` with BTC `-> close` for MUSD, repeated across many wallets, the attacker slowly extracted LP reserves. The same design flaw was reused on Mezo (Redstone oracle). Velar called it "not a smart contract hack," but the root cause is missing in-contract oracle timestamp validation plus exploitable perp/AMM pricing under low activity — an economic/oracle design defect that is auditable in contract logic. At least one auditor had flagged the absence of a pause/slowdown mechanism.

**Exploited functions / pattern:** `open-long`/`close`, `open-short`/`close` (position open+close cycling), Pyth oracle price-update path with no timestamp/staleness check.

**Sources:**
- https://mezo.org/blog/velars-perpdex-exploited-on-mezo/
- https://mezo.org/blog/a-community-driven-response-to-velars-recent-exploit

**Our dimensions that catch it:**
- **flashloan-economics** — the core is economic value extraction via repeated open/close cycling against mispriced/stale pool pricing.
- **interest-math** — perp pricing/PnL math evaluated against a price the attacker can time.
- **invariants-dos** — missing pause/circuit-breaker; LP reserve-conservation invariant not enforced under adversarial cycling.

**Detection heuristic for an auditor subagent:**
> In perp/AMM contracts, flag any price consumption that lacks a staleness/timestamp check (assert `block-height`/publish-time freshness) and any pricing that is updatable by, or sensitive to, the attacker's own transactions under low activity. Model a multi-wallet open/close cycle and check whether repeated round-trips can net positive against LP reserves (reserve-conservation invariant). Recommend a pause/slowdown circuit breaker. Flag "open position -> immediate close at a price the same actor influenced" as a profit loop.

---

## 6. Zest Protocol — borrow collateral-list duplication exploit

- **Date:** 2024-04-11
- **Protocol:** Zest Protocol (Stacks lending)
- **Estimated loss:** ~$1M (~322,000 STX)
- **CLASS:** `logic-bug` (in scope) — confidence: high

**Root cause.** The `borrow` function in `pool-borrow-v1-1.clar` accepted a user-supplied collateral `assets` list (up to 100 entries) and computed borrowing power by folding over it (`calculate-user-global-data` / `aggregate-user-data`) **without deduplicating entries**. The attacker deposited ~200 STX (receiving `zwstx` LP tokens), then passed that same collateral asset repeated ~98 times in a 100-element array, causing the contract to count the collateral ~98x (~19,600 STX of perceived collateral vs 200 STX real). Repeated across ~5 borrow calls to drain ~322k STX. Pure Clarity input-validation / list-uniqueness flaw.

**Exploited functions / pattern:** `borrow`, `calculate-user-global-data`, `aggregate-user-data` (fold over attacker-controlled, non-deduplicated array).

**Sources:**
- https://www.zestprotocol.com/blog/zest-protocol-security-update
- https://medium.com/@exvul/the-first-attack-on-bitcoin-defi-smart-contract-ec5e5976983e
- https://www.quadrigainitiative.com/hackfraudscam/zestprotocollendingcollateralvulnerability.php
- https://www.beosin.com/resources/stacks-and-its-clarity-contract-security
- https://www.halborn.com/blog/post/month-in-review-top-defi-hacks-of-april-2024

**Our dimensions that catch it:**
- **share-accounting / interest-math** — collateral aggregation is the accounting that bounds borrowing power; double-counting inflates it.
- **invariants-dos** — broken invariant "each collateral asset contributes to borrowing power at most once."
- **access-control / input-validation** — unvalidated user-supplied list.

**Detection heuristic for an auditor subagent:**
> Flag any `fold`/aggregation over a **caller-supplied list** that drives a value-bearing computation (collateral, voting power, rewards, balances) when the list is not deduplicated or its entries are not asserted unique. Specifically check borrowing-power / collateral-valuation functions: does the same asset appearing N times count N times? Require a uniqueness check (or aggregation over a canonical per-user position rather than a caller-provided list).

---

## 7. Charisma — `unwrap` `as-contract` / `tx-sender` privilege escalation

- **Date:** 2024-09-21
- **Protocol:** Charisma (Stacks liquidity/staking)
- **Estimated loss:** ~183,548 STX (~$530k cited)
- **CLASS:** `logic-bug` (in scope) — confidence: medium

**Root cause.** The `unwrap` function wrapped privileged internal calls in `(as-contract ...)`, which reassigns `tx-sender` to the Charisma contract principal. Because downstream authorization relied on `tx-sender`, the attacker effectively gained the same rights as the contract/owner and abused them to transfer STX and mint tokens. A classic Clarity-specific anti-pattern: `tx-sender`-based authorization combined with `as-contract` context switching — not a key compromise.

**Exploited functions / pattern:** `unwrap`, `as-contract`, `tx-sender`-based authorization, mint authorization, in-context STX transfer.

**Sources:**
- https://www.beosin.com/resources/stacks-and-its-clarity-contract-security
- https://www.stackspulse.com/protocols/charisma
- https://newsletter.blockthreat.io/p/blockthreat-week-38-2024

**Our dimensions that catch it:**
- **access-control** — the central failure: authorization keyed on `tx-sender` inside an `as-contract` context.
- **reentrancy** (adjacent) — same family of "control/context confusion around external/wrapped calls."

**Detection heuristic for an auditor subagent:**
> Grep for `as-contract` and, for each occurrence, trace whether any authorization downstream reads `tx-sender`. Under `as-contract`, `tx-sender` becomes the contract principal, so any `(asserts! (is-eq tx-sender <owner>))` style guard inside that context is trivially satisfied. Flag every `tx-sender`-based check reachable through an `as-contract` boundary; recommend `contract-caller` checks or capturing the original sender before the context switch.

---

## Recurring audit-finding patterns (not live exploits)

These come from formal audits / best-practice checklists, not on-chain incidents. They are real Clarity logic pitfalls our subagents should screen for, but no loss occurred.

### 8. Signed-int reward input not validated / negative rewards
- **Protocol:** Zest Protocol (`loan-token`, `lp-token`, `sp-token`, `zest-rewards-dist`) — CoinFabrik finding ME-02 (Medium). **CLASS:** `logic-bug` (audit pattern), confidence: high.
- **Root cause:** `deposit-rewards()` accepted an unconstrained signed `int`, allowing negative reward values to corrupt accounting. Illustrates the Clarity `int`-vs-`uint` pitfall.
- **Function/pattern:** `deposit-rewards`.
- **Source:** https://www.coinfabrik.com/blog/zest-full-audit/
- **Dimension:** **interest-math / share-accounting**.
- **Heuristic:** Flag any reward/balance/amount parameter typed `int` where only non-negative values are valid; require `uint` or an explicit `(asserts! (> v 0))`.

### 9. Double-borrow / missing prior-state check
- **Protocol:** Zest Protocol (`pool-v1-0`) — CoinFabrik finding ME-03 (Medium). **CLASS:** `logic-bug` (audit pattern), confidence: medium.
- **Root cause:** `drawdown()` did not validate the borrower's prior loan status, allowing multiple draw-downs against a single funding. Missing state-machine guard.
- **Function/pattern:** `drawdown`.
- **Source:** https://www.coinfabrik.com/blog/zest-full-audit/
- **Dimension:** **invariants-dos / access-control**.
- **Heuristic:** For each state-changing action, verify it asserts the expected current state before transitioning (e.g., loan not already drawn). Flag actions with no precondition guard against repeat invocation.

### 10. Unchecked response boolean via `try!` / `unwrap!`
- **Protocol:** Clarity / Stacks general — CertiK checklist example. **CLASS:** `logic-bug` (audit pattern), confidence: high.
- **Root cause:** Functions returning `(response bool _)` can return `(ok false)` on logical failure. `try!` / `unwrap!` only check the `err` branch and treat `(ok false)` as success (CertiK's example: `verify-mined()` returning `(ok false)` being accepted), letting invalid operations proceed.
- **Function/pattern:** `try!`, `unwrap!`, `unwrap-panic`, `verify-mined`.
- **Source:** https://www.certik.com/resources/blog/clarity-best-practices-and-checklist
- **Dimension:** **invariants-dos** (correctness of control flow).
- **Heuristic:** For any call to a function returning `(response bool _)`, ensure the unwrapped boolean is explicitly asserted `true` (`(asserts! (try! ...) err)`), not merely unwrapped. Flag `try!`/`unwrap!` on bool-returning responses where the `false` case is not handled.

---

## Closing matrix: pattern -> audit dimension -> detection heuristic

| # | Incident / pattern | CLASS | Audit dimension(s) | Detection heuristic (one-liner) |
|---|---|---|---|---|
| 1 | ALEX self-listing vault (2025) | logic-bug | access-control, invariants-dos | Permission grants to caller-supplied/self-listed token contracts; `tx-sender` auth satisfied under `as-contract`. |
| 2 | ALEX XLink bridge (2024) | key-compromise (OUT OF SCOPE) | access-control (centralization only) | Single key can upgrade/replace value-bearing endpoint -> centralization finding, not a logic guarantee. |
| 3 | Arkadiko Swap LP-token (2021) | logic-bug | share-accounting, invariants-dos | Pair/pool creation accepts caller-supplied LP token without unique binding; shares from one pool redeemable against another. |
| 4 | Arkadiko oracle glitch (2021) | oracle (partial) | interest-math, invariants-dos | Collateral valuation consumes external price with no deviation/bounds/staleness guard. |
| 5 | Velar PerpDEX (2026) | oracle (partial) | flashloan-economics, interest-math, invariants-dos | Stale/timeable price + repeatable open/close cycle nets positive vs LP reserves; no circuit breaker. |
| 6 | Zest duplicate-collateral (2024) | logic-bug | share-accounting, invariants-dos | `fold` over caller-supplied list (collateral/power) with no dedup/uniqueness; same asset counted N times. |
| 7 | Charisma `as-contract` (2024) | logic-bug | access-control, reentrancy | `as-contract` reachable to a `tx-sender`-based auth check -> attacker assumes contract privileges. |
| 8 | Zest signed-int rewards | logic-bug (audit pattern) | interest-math, share-accounting | Amount/reward param typed `int` where only non-negative valid -> use `uint` / assert `> 0`. |
| 9 | Zest double-borrow | logic-bug (audit pattern) | invariants-dos, access-control | State-changing action lacks prior-state precondition (re-invocation guard). |
| 10 | Unchecked bool via `try!` | logic-bug (audit pattern) | invariants-dos | `(response bool _)` unwrapped without asserting the bool is `true` (`(ok false)` slips through). |

**Coverage summary:** Of 10 entries, 4 are confirmed live contract-logic exploits with concrete on-chain detail (#1 ALEX, #3 Arkadiko Swap, #6 Zest, #7 Charisma), 3 are recurring formal-audit logic patterns (#8-#10, no loss), 2 are oracle/economic defects partially in scope (#4 Arkadiko, #5 Velar), and 1 is a key compromise that contract-logic auditing cannot catch (#2 ALEX XLink). Reviewers should weight detection claims accordingly: our highest-value, clearly-in-scope precedents are the access-control / `as-contract` confusion (#1, #7), unvalidated-list aggregation (#6), and LP-token / share-binding (#3) families.
