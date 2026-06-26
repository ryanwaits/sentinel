import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Audits interest-rate model & index/accrual math: index monotonicity, accrual timing/double-count, overflow in products at extreme values, underflow-abort DoS, rate-curve interpolation edges (zero-pad, descending, single-point). Returns structured findings.",
  // Tiered: auditors run Sonnet (cheap high-recall idea-generation); the
  // verifier + orchestrator stay Opus (precision gate). See docs/business-model.md COGS.
  model: "anthropic/claude-sonnet-4.6",
});
