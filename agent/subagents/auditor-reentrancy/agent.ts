import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Audits Clarity reentrancy & external-call ordering: attacker-controlled callbacks (flash-loan), checks-effects-interactions, reentrancy-guard coverage, and whether internal vs live-balance accounting can be gamed mid-call. Returns structured findings.",
  model: "anthropic/claude-opus-4.8",
});
