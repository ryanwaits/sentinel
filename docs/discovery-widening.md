# Spec — Discovery Widening (FT + NFT + STX, USD-ranked)

Engineering spec for Phase 0 of the [validation sweep](./validation-sweep.md):
extend discovery from FT/STX-only to **all asset types, ranked by real $-at-risk**.
Powered-by-secondlayer rules apply ([../CLAUDE.md](../CLAUDE.md)) — secondlayer
subgraphs/Index only, no third-party data without explicit sign-off.

## Goal
`find_value_contracts` returns the contracts holding the most **USD value** across
FT + NFT + STX, with a per-asset breakdown — so triage + audit spend lands on the
highest-$-at-risk targets, not raw token amounts.

## Current state / gaps
- `subgraphs/token-balances.ts` — FT only (`ft_transfer/mint/burn`), keyed
  `(asset_identifier, holder)`, manual `findOne`+`upsert`. Deployed via `sl`.
- `agent/tools/find_value_contracts.ts` — queries that one subgraph, filters
  holders containing `"."`, ranks by raw `amount`, seed fallback.
- **Gaps:** no NFT holdings; no STX holdings; raw amounts not comparable across
  assets/decimals → ranking is meaningless across token types; no USD.

## Verified secondlayer facts (from installed `@secondlayer/subgraphs`)
- Source types exist: `ft_transfer|mint|burn`, `nft_transfer|mint|burn`,
  `stx_transfer|mint|burn|lock`.
- Handler event fields: FT → `assetIdentifier, sender, recipient, amount`;
  NFT → `assetIdentifier, sender, recipient` (**no amount — count-based**);
  STX → `sender, recipient, amount` (**no assetIdentifier**).
- `ctx.increment(table, key, {col: delta})` = blessed atomic accumulator
  (`col = COALESCE(col,0)+delta`, deltas may be negative, needs matching
  `uniqueKeys`). Use it; drop the manual findOne/upsert pattern.

## Architecture decision — one unified subgraph
Replace `token-balances` with a single **`asset-holdings`** subgraph handling all
three asset classes. One query instead of three; one merge. (Alt: three separate
subgraphs — rejected: 3× queries + 3× join in the tool for no gain.)

Schema `holdings`, keyed `(kind, asset_identifier, holder)`:
| col | type | notes |
|---|---|---|
| `kind` | text (indexed) | `"ft" | "nft" | "stx"` discriminator |
| `asset_identifier` | text (indexed, search) | FT/NFT asset id; `"STX"` for stx |
| `holder` | principal (indexed, search) | contract principals contain `"."` |
| `amount` | uint | FT/STX base units; NFT = count held |

Handlers (all via `ctx.increment`):
- **ft_transfer:** sender −amount, recipient +amount. **ft_mint:** recipient
  +amount. **ft_burn:** sender −amount. (`kind:"ft"`)
- **nft_transfer:** sender −1, recipient +1. **nft_mint:** recipient +1.
  **nft_burn:** sender −1. (`kind:"nft"`, amount = count)
- **stx_transfer:** sender −amount, recipient +amount. **stx_mint:** recipient
  +amount. **stx_burn:** sender −amount. (`kind:"stx"`, asset_identifier `"STX"`)

```ts
// subgraphs/asset-holdings.ts (sketch)
sources: {
  ftXfer:{type:"ft_transfer"}, ftMint:{type:"ft_mint"}, ftBurn:{type:"ft_burn"},
  nftXfer:{type:"nft_transfer"}, nftMint:{type:"nft_mint"}, nftBurn:{type:"nft_burn"},
  stxXfer:{type:"stx_transfer"}, stxMint:{type:"stx_mint"}, stxBurn:{type:"stx_burn"},
}
// e.g. ftXfer handler:
const a = BigInt(event.amount ?? 0)
if (event.sender) ctx.increment("holdings",
  {kind:"ft", asset_identifier:event.assetIdentifier, holder:event.sender}, {amount:-a})
if (event.recipient) ctx.increment("holdings",
  {kind:"ft", asset_identifier:event.assetIdentifier, holder:event.recipient}, {amount:a})
```

## Pricing module (the hard part — and an open decision)
Raw amounts → USD needs **price** + **decimals** per asset. Tensions with the
no-third-party rule:

- **FT/STX price:** secondlayer may not expose a USD oracle. Options:
  1. **Curated price map** (`agent/pricing.ts`) for the handful of wedge assets
     (sBTC, STX, major FTs) — fast, good enough for ranking, Stacks-only wedge.
     **Recommended for now.**
  2. Derive price from DEX swap events via a `prices` subgraph (sBTC/USD-stable
     pairs) — stays in-ecosystem, more work, later.
  3. External price API (CoinGecko etc.) — **breaks the no-third-party rule;
     needs explicit sign-off.** Pricing arguably a different category than
     on-chain data — flag for decision, don't assume.
- **Decimals:** FT base units need token decimals. Source: secondlayer Index
  token metadata if available, else curated map alongside prices. STX = 6.
- **NFT valuation is unreliable** (illiquid, floor ≠ realizable). **Do NOT fold
  NFT into the USD rank.** Rank by FT+STX USD; surface NFT holdings as a
  *secondary flag* (count + collection), not precise $. Documented honesty, not a
  bug. Revisit if an NFT-heavy target matters.

Module shape:
```ts
// agent/pricing.ts
usd(kind, assetId, amountBaseUnits): number | null   // null = unpriced → excluded from rank, still listed
decimals(assetId): number
```

## `find_value_contracts` rewrite
1. Query `asset-holdings` top rows by `amount` per kind (over-fetch), keep holders
   containing `"."` (contract principals).
2. Group by `holder`; per asset compute `usd = pricing.usd(...)`.
3. `usdAtRisk` = Σ FT+STX usd (NFT excluded from the number).
4. Rank holders by `usdAtRisk` desc; return top `limit` with breakdown.
5. Keep the seed fallback (Zest sBTC vault) when subgraph/env unset.

Output schema:
```ts
{
  source: "asset-holdings" | "seed",
  count: number,
  contracts: [{
    contractId: string,
    usdAtRisk: number | null,            // FT+STX only
    breakdown: [{ kind:"ft"|"nft"|"stx", assetId, amount, usd: number|null,
                  count?: number /* nft */ }],
    nftFlag?: { collections: number, items: number },   // secondary signal
  }]
}
```

## Sequencing
- **A.** Author `subgraphs/asset-holdings.ts`; `sl subgraphs deploy`; let it index;
  spot-check the Zest sBTC vault row appears with correct sBTC balance.
- **B.** `agent/pricing.ts` — curated price+decimals map for wedge assets
  (after deciding the price-source question below).
- **C.** Rewrite `find_value_contracts` (merge + USD rank + breakdown); keep seed
  fallback. Update its doc comment.
- **D.** Validate: run the tool, confirm Zest sBTC vault surfaces ranked by USD,
  breakdown correct; confirm an NFT-holding contract shows the nftFlag, not USD.

Retire `subgraphs/token-balances.ts` once `asset-holdings` is deployed + the tool
is cut over (don't delete until C+D green).

## Testing
- Subgraph: deterministic — confirm a known holder's balance matches chain.
- Tool: unit against a fixture subgraph response; assert ranking order + that
  unpriced assets are listed (usd:null) but excluded from `usdAtRisk`; assert
  NFT excluded from the number.
- Regression: seed fallback still returns Zest sBTC when env unset.

## Open questions (decide before building B)
- **Price source:** curated map (recommended, fast) vs DEX-derived `prices`
  subgraph vs external API (needs no-third-party sign-off — does pricing count as
  "on-chain data"?).
- **Decimals/metadata source:** does secondlayer Index expose token metadata, or
  curate alongside prices for the wedge?
- **NFT:** confirm secondary-flag-only treatment is acceptable for validation
  (vs investing in floor-price valuation).
- **Index vs subgraph for STX:** subgraph (chosen, consistent) assumes stx_*
  events fully reconstruct balances incl. genesis/coinbase — verify, else
  reconcile against an Index account-balance query.
