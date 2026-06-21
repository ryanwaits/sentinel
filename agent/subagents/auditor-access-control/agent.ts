import { defineAgent } from "eve";

export default defineAgent({
  // `description` is required: the parent reads it to decide when to delegate.
  description:
    "Audits Clarity access-control & privilege: auth gates (tx-sender vs contract-caller), unguarded mutators, admin/DAO blast radius, authorized-contract powers (e.g. socialize-debt), init/front-run. Returns structured findings.",
  model: "anthropic/claude-opus-4.8",
});
