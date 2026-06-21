import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Audits interest-rate model & index/accrual math: index monotonicity, accrual timing/double-count, overflow in products at extreme values, underflow-abort DoS, rate-curve interpolation edges (zero-pad, descending, single-point). Returns structured findings.",
  model: "anthropic/claude-opus-4.8",
});
