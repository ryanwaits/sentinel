/**
 * CLI — baseline-audit a contract and distil a CANDIDATE KBRecord for human review.
 *   . ./.env.local  (ANTHROPIC_API_KEY + STACKS_NODE_URL)
 *   bun run distill <contractId> [client]
 * Writes KB_DIR/_candidates/<contractId>.json (default `.sentinel/kb/_candidates/`).
 * Review + saveRecord into KB_DIR to go live. Live watches are not git.
 */
import { loadRecord } from "../monitoring/kb";
import { audit } from "./audit";
import {
  buildKBCandidate,
  distillBlocked,
  droppedLiveBugs,
  planAdvice,
  writeCandidate,
} from "./kb-distill";

const contractId = process.argv[2];
const client = process.argv[3] ?? "unknown";
if (!contractId) {
  console.error("usage: bun run distill <contractId> [client]");
  process.exit(1);
}

console.log(`=== distill === ${contractId} (client ${client})\n`);
const live = loadRecord(contractId);
const res = await audit(contractId, {
  tier: "deep",
  distillKB: true,
  kb: live,
  onTool: (n, ms) => console.log(`[${(ms / 60000).toFixed(1)}m] ${n}`),
});
console.log(
  `\naudit ${res.status} | $${res.metrics.costUsd} | findings ${res.findings.length} | kbCandidate ${res.kbCandidate ? "✓" : "MISSING"}`,
);

const auditedAt = new Date().toISOString().slice(0, 10);
const candidate = await buildKBCandidate(contractId, res.findings, res.kbCandidate, {
  client,
  auditedAt,
  live,
});
const path = writeCandidate(candidate);

console.log(`\n=== CANDIDATE → ${path} ===`);
console.log(
  `archetype ${candidate.archetype} | sensitiveFns ${candidate.sensitiveFns.length} | waivers ${candidate.waivers.length} | priorFindings ${candidate.priorFindings.length} | closure ${candidate.closure.length}`,
);
console.log(planAdvice(candidate));
console.log(JSON.stringify(candidate, null, 2));
if (live) {
  const dropped = droppedLiveBugs(candidate, live);
  if (dropped.length) {
    console.log(
      `\nWARNING: live KB bug(s) missing from candidate — do not promote until re-validated:\n${dropped
        .map((d) => `  - ${d.title} [${d.severity}]`)
        .join("\n")}`,
    );
  }
  console.log(
    "\nNOTE: a live record already exists in KB_DIR — diff the candidate before replacing.",
  );
} else {
  console.log(
    "\nReview the candidate, then saveRecord into KB_DIR (default .sentinel/kb/) to drive monitoring.",
  );
}
const blocked = distillBlocked(candidate, live);
if (blocked) {
  console.error(`\nDISTILL BLOCKED — ${blocked}`);
  process.exit(1);
}
