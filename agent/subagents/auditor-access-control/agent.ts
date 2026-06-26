import { defineAgent } from "eve";

export default defineAgent({
  // `description` is required: the parent reads it to decide when to delegate.
  description:
    "Audits Clarity access-control & privilege: auth gates (tx-sender vs contract-caller), unguarded mutators, admin/DAO blast radius, authorized-contract powers (e.g. socialize-debt), init/front-run. Returns structured findings.",
  // Tiered: auditors run Sonnet (cheap high-recall idea-generation); the
  // verifier + orchestrator stay Opus (precision gate). See docs/business-model.md COGS.
  model: "anthropic/claude-sonnet-4.6",
});
