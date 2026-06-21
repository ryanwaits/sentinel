import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Audits economic invariants, DoS & accounting consistency: identifies core invariants (assets vs shares, borrowed vs principal*index, balance >= obligations) and finds sequences that break them; bank-run/insolvency ordering, cap off-by-ones, and cheap permanent-DoS griefs. Returns structured findings.",
  model: "anthropic/claude-opus-4.8",
});
