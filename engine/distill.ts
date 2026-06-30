/**
 * CLI — baseline-audit a contract and distil a CANDIDATE KBRecord for human review.
 *   . ./.env.local  (ANTHROPIC_API_KEY + STACKS_NODE_URL)
 *   bun run distill <contractId> [client]
 * Writes sentinel/kb/_candidates/<contractId>.json; review + move to sentinel/kb/ to go live.
 */
import { loadRecord } from "../monitoring/kb";
import { audit } from "./audit";
import { buildKBCandidate, writeCandidate } from "./kb-distill";

const contractId = process.argv[2];
const client = process.argv[3] ?? "unknown";
if (!contractId) {
  console.error("usage: bun run distill <contractId> [client]");
  process.exit(1);
}

console.log(`=== distill === ${contractId} (client ${client})\n`);
const res = await audit(contractId, {
  tier: "deep",
  distillKB: true,
  onTool: (n, ms) => console.log(`[${(ms / 60000).toFixed(1)}m] ${n}`),
});
console.log(
  `\naudit ${res.status} | $${res.metrics.costUsd} | findings ${res.findings.length} | kbCandidate ${res.kbCandidate ? "✓" : "MISSING"}`,
);

const auditedAt = new Date().toISOString().slice(0, 10);
const candidate = await buildKBCandidate(contractId, res.findings, res.kbCandidate, {
  client,
  auditedAt,
});
const path = writeCandidate(candidate);

console.log(`\n=== CANDIDATE → ${path} ===`);
console.log(
  `archetype ${candidate.archetype} | sensitiveFns ${candidate.sensitiveFns.length} | waivers ${candidate.waivers.length} | priorFindings ${candidate.priorFindings.length} | closure ${candidate.closure.length}`,
);
console.log(JSON.stringify(candidate, null, 2));
console.log(
  loadRecord(contractId)
    ? "\nNOTE: a live KB record already exists — diff the candidate before replacing."
    : "\nReview the candidate, then move it to sentinel/kb/ to drive monitoring.",
);
