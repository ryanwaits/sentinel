import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Audits Clarity reentrancy & external-call ordering: attacker-controlled callbacks (flash-loan), checks-effects-interactions, reentrancy-guard coverage, and whether internal vs live-balance accounting can be gamed mid-call. Returns structured findings.",
  // Tiered: auditors run Sonnet (cheap high-recall idea-generation); the
  // verifier + orchestrator stay Opus (precision gate). See docs/business-model.md COGS.
  model: "anthropic/claude-sonnet-4.6",
});
