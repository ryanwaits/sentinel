import { defineAgent } from "eve";

export default defineAgent({
  // `description` is required: the parent reads it to decide when to delegate.
  description:
    "Audits oracle & price-feed integrity: every external price the contract consumes (oracle contract, DEX spot/reserves, Pyth/Redstone) and whether it has staleness/timestamp checks, deviation/bounds circuit-breakers, manipulation resistance (spot vs TWAP, self-influenced/low-liquidity), single-source fallback, decimals/scaling, and who can push prices. Returns structured findings. Delegate when the target reads a price/exchange-rate to value collateral, mint, liquidate, or settle.",
  // Tiered: auditors run Sonnet (cheap high-recall idea-generation); the
  // verifier + orchestrator stay Opus (precision gate). See docs/business-model.md COGS.
  model: "anthropic/claude-sonnet-4.6",
});
