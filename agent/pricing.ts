/**
 * Pricing for discovery ranking — turns raw on-chain base-unit balances into a
 * comparable USD figure so `find_value_contracts` can rank audit targets by real
 * $-at-risk instead of incomparable per-token amounts.
 *
 * DESIGN (see docs/discovery-widening.md "Pricing module"):
 * - Curated map for the Stacks-only wedge assets — fast, in-repo, no third-party
 *   API (honors the powered-by-secondlayer no-third-party rule). Good enough for
 *   RANKING; not an accounting oracle.
 * - Decimals curated here too (secondlayer Index token metadata is the eventual
 *   source; curated until that's wired).
 * - Unpriced assets return `null` → listed in the breakdown but EXCLUDED from the
 *   ranked USD number (honest: we don't invent a price we don't have).
 * - NFTs are intentionally NOT priced here (illiquid, floor ≠ realizable) — the
 *   tool surfaces them as a secondary count flag, never in `usdAtRisk`.
 *
 * MAINTENANCE: `usdPerUnit` is a coarse, MANUALLY-REFRESHED snapshot for ranking
 * only. Update the values + `PRICED_AS_OF` when they drift materially. Asset
 * identifiers are the canonical `<contract>::<asset-name>` (and literal "STX").
 */

/** Snapshot date for the curated prices below (manual refresh). */
export const PRICED_AS_OF = "2026-06-26";

interface AssetMeta {
  /** Base-unit decimals. STX = 6, sBTC = 8. */
  decimals: number;
  /** Coarse USD per whole unit, for ranking only. null/absent = unpriced. */
  usdPerUnit: number | null;
  /** Human label for output. */
  symbol: string;
}

/**
 * Curated wedge assets. Keyed by canonical asset identifier.
 * Prices are ranking-grade snapshots — CONFIRM before any $-precise use.
 */
const ASSETS: Record<string, AssetMeta> = {
  // Native STX (synthetic identifier used by the asset-holdings subgraph).
  STX: { decimals: 6, usdPerUnit: 2.0, symbol: "STX" },
  // sBTC — the wedge's flagship value-bearing asset (1:1 BTC). The canonical asset
  // id is `<contract>::sbtc-token` (the define-fungible-token name is `sbtc-token`,
  // NOT `sbtc`) — verified against the Index. Using the wrong suffix leaves real
  // sBTC unpriced. This allowlist is also the scam-token defense: stxcity look-alikes
  // named "sBTC"/"Wsbtc"/"esBTC" are NOT here, so they score $0 and sink in the rank.
  "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc-token": {
    decimals: 8,
    usdPerUnit: 100000,
    symbol: "sBTC",
  },
  // Common Stacks stablecoins / majors — extend as the wedge widens.
  // Identifiers + prices are placeholders pending confirmation against the
  // secondlayer Index; left unpriced (null) until verified rather than guessed.
};

/** Lookup curated metadata for an asset identifier (null if unknown). */
function meta(assetId: string): AssetMeta | null {
  return ASSETS[assetId] ?? null;
}

/** Base-unit decimals for an asset. Falls back to 6 (STX-like) if unknown. */
export function decimals(assetId: string): number {
  return meta(assetId)?.decimals ?? 6;
}

/** Display symbol, or the raw asset id if uncurated. */
export function symbol(assetId: string): string {
  return meta(assetId)?.symbol ?? assetId;
}

/**
 * USD value of `amountBaseUnits` of `assetId`.
 * Returns null when the asset is uncurated or deliberately unpriced (NFTs, or
 * FTs we haven't confirmed a price for) — caller excludes null from the rank.
 */
export function usd(assetId: string, amountBaseUnits: bigint | string | number): number | null {
  const m = meta(assetId);
  if (!m || m.usdPerUnit == null) return null;
  const base = typeof amountBaseUnits === "bigint" ? amountBaseUnits : BigInt(amountBaseUnits ?? 0);
  // whole units = base / 10^decimals, kept as float — ranking precision, not accounting.
  const whole = Number(base) / 10 ** m.decimals;
  return whole * m.usdPerUnit;
}
