import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Audits flash-loan correctness & liquidity accounting: repayment enforced across all revert paths, live-balance vs internal-accounting discrepancies, fee rounding/fee-exempt bypass, receiver constraints, and cross-effects with the lending side. Returns structured findings.",
  model: "anthropic/claude-opus-4.8",
});
