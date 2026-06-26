import { defineAgent } from "eve";

export default defineAgent({
  // `description` is required: the parent reads it to decide when to delegate.
  description:
    "Audits governance & proposal-execution: DAO/ExecutorDAO proposal lifecycle, who can submit/queue/execute, what a passed proposal can do (arbitrary-code execution, treasury reach), with-all-assets-unsafe around dynamic proposal calls, flash-loanable / live-balance voting power, missing timelock/quorum/snapshot, and upgrade/impl-swap authority. Returns structured findings. Delegate when the target has a DAO/executor, proposals, voting, extensions, or upgradeable implementation.",
  model: "anthropic/claude-opus-4.8",
});
