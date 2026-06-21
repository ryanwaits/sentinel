import { defineAgent } from "eve";

/**
 * Audit Sentinel — orchestrator agent.
 * Opus 4.8 confirmed supported by eve via the Vercel AI Gateway (spike Q4).
 */
export default defineAgent({
  model: "anthropic/claude-opus-4.8",
});
