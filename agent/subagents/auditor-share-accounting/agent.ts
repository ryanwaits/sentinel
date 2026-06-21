import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Audits ERC-4626-style share accounting: first-deposit/inflation, donation, rounding direction (who it favors), zero-share/zero-asset edges, deposit->redeem round-trip extraction, treasury/fee dilution. Returns structured findings.",
  model: "anthropic/claude-opus-4.8",
});
