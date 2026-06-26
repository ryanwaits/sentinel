import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Audits ERC-4626-style share accounting: first-deposit/inflation, donation, rounding direction (who it favors), zero-share/zero-asset edges, deposit->redeem round-trip extraction, treasury/fee dilution. Returns structured findings.",
  // Tiered: auditors run Sonnet (cheap high-recall idea-generation); the
  // verifier + orchestrator stay Opus (precision gate). See docs/business-model.md COGS.
  model: "anthropic/claude-sonnet-4.6",
});
