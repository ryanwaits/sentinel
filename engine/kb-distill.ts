/**
 * Audit → KB distillation — turn a finished baseline audit into a CANDIDATE KBRecord (the carry-
 * forward context the next audit reads: archetype, sensitive fns, accepted waivers, prior findings).
 * Automates what was hand-seeded for the Zest vault.
 *
 * Deterministic where it can be (the credibility-sensitive bits), LLM only for archetype + sensitive
 * fns (the audit emits those as `kbCandidate` in its structured output — no extra model call):
 *  - closure       ← the static resolver (override any guess)
 *  - waivers       ← CONFIRMED centralization findings (the accept-once set)
 *  - priorFindings ← CONFIRMED high/critical BUGS (the re-validate + reproduce anchor)
 *  - sensitiveFns  ← LLM, then SANITISED class-aware: counterparty allowlists are SUPPRESSION sets
 *    (a wrong entry silently drops events) so never auto-populate them; outflow thresholds left unset.
 *
 * Writes to `sentinel/kb/_candidates/` — a HUMAN reviews + promotes to `sentinel/kb/` before it
 * drives `deriveConfig`. Never auto-commits a live KB record.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Finding } from "../monitoring/adjudication";
import { resolveClosureIds } from "../monitoring/closure";
import { Archetype, SensitiveFn } from "../monitoring/config";
import { fetchSourceById } from "../monitoring/contract-source";
import { type KBRecord, KBRecord as KBRecordSchema } from "../monitoring/kb";

/** The LLM-extracted slice the audit emits alongside findings (validated). */
export const KBCandidate = z.object({ archetype: Archetype, sensitiveFns: z.array(SensitiveFn) });
export type KBCandidate = z.infer<typeof KBCandidate>;

/** Build a candidate KBRecord from a finished audit's findings + the emitted kbCandidate. */
export async function buildKBCandidate(
  contractId: string,
  findings: Finding[],
  kbCandidate: KBCandidate | undefined,
  opts: { client: string; auditedAt: string },
): Promise<KBRecord> {
  let closure: string[] = [];
  try {
    closure = (
      await resolveClosureIds(contractId, async (id) => (await fetchSourceById(id))?.source ?? null)
    ).filter((id) => id !== contractId);
  } catch {
    // node miss — leave closure empty; human/re-run fills it.
  }

  const confirmed = findings.filter((f) => f.verifierVerdict === "confirmed");
  const waivers = confirmed
    .filter((f) => f.class === "centralization")
    .map((f) => ({
      finding: f.title,
      label: "centralization" as const,
      note: f.recommendedAction ?? f.blastRadius,
    }));
  const priorFindings = confirmed
    .filter((f) => f.class === "bug" && (f.severity === "high" || f.severity === "critical"))
    .map((f) => ({
      title: f.title,
      severity: f.severity,
      class: "bug" as const,
      note: f.blastRadius ?? f.recommendedAction,
    }));

  // Class-aware sanitisation: counterparty allowlists drop events as benign → never auto-fill them;
  // drop any proposed outflowThreshold (a human sets that, or it silently suppresses real drains).
  const sensitiveFns = (kbCandidate?.sensitiveFns ?? []).map((fn) => {
    const sf = { ...fn };
    delete sf.outflowThreshold;
    if (sf.triggerClass === "counterparty.new") sf.callerAllowlist = [];
    return sf;
  });

  return KBRecordSchema.parse({
    contractId,
    client: opts.client,
    archetype: kbCandidate?.archetype ?? "other",
    closure,
    baselineAudited: true,
    auditedAt: opts.auditedAt,
    sensitiveFns,
    waivers,
    priorFindings,
    source: "engine/distill (CANDIDATE — human review required before it drives monitoring)",
  });
}

/** Write a candidate to `sentinel/kb/_candidates/<contractId>.json` (review dir). Returns the path. */
export function writeCandidate(record: KBRecord): string {
  const dir = join(process.cwd(), "sentinel", "kb", "_candidates");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${record.contractId}.json`);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return path;
}
