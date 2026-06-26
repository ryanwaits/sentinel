import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Audits flash-loan correctness & liquidity accounting: repayment enforced across all revert paths, live-balance vs internal-accounting discrepancies, fee rounding/fee-exempt bypass, receiver constraints, and cross-effects with the lending side. Returns structured findings.",
  // Tiered: auditors run Sonnet (cheap high-recall idea-generation); the
  // verifier + orchestrator stay Opus (precision gate). See docs/business-model.md COGS.
  model: "anthropic/claude-sonnet-4.6",
});
