import { defineAgent } from "eve";

/**
 * Audit Sentinel — orchestrator agent.
 *
 * Model is env-driven (read at `eve build` time): SENTINEL_AGENT_MODEL overrides the default so a
 * Monitor-tier / fast-validation build can use Sonnet without editing code. Default = Opus 4.8 (the
 * Deep-tier model, confirmed supported by eve via the Vercel AI Gateway).
 */
export default defineAgent({
  model: process.env.SENTINEL_AGENT_MODEL ?? "anthropic/claude-opus-4.8",
});
