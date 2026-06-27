/**
 * KB / context store — the audit ↔ config ↔ incident loop (component 5), MVP slice.
 *
 * Persists what an audit learned about a contract, keyed by `contractId`, as a git-checked JSON
 * record under `sentinel/kb/` (NOT the gitignored `.sentinel/` runtime dir). `deriveConfig`
 * turns a record into a `MonitoringConfig` — pure judgment, no chain dependency. Seeded from the
 * two `reports/*.md` audits.
 *
 * Full version also holds stateful baselines (windowed outflow-rate / total-assets-% an absolute
 * filter can't express); MVP captures the static facts: archetype, call-graph closure, sensitive
 * fns, and accepted centralization waivers (warn once, don't re-page).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Archetype, MonitoringConfig, SensitiveFn, tierForArchetype } from "./config";

export const KB_DIR = process.env.SENTINEL_KB_DIR ?? join(process.cwd(), "sentinel", "kb");

/** An accepted centralization/trust finding — surfaced once, then suppressed (not a re-pageable bug). */
export const CentralizationWaiver = z.object({
  finding: z.string(),
  label: z.enum(["centralization", "by-design", "info", "low"]),
  note: z.string().optional(),
});

/** What an audit recorded about one contract. Source of truth for `deriveConfig`. */
export const KBRecord = z.object({
  contractId: z.string(),
  client: z.string(),
  archetype: Archetype,
  /** Static call-graph closure audited (target + every contract it reaches). */
  closure: z.array(z.string()).default([]),
  baselineAudited: z.boolean().default(false),
  auditedAt: z.string().optional(),
  sensitiveFns: z.array(SensitiveFn).default([]),
  waivers: z.array(CentralizationWaiver).default([]),
  /** Provenance — the report this record was distilled from. */
  source: z.string().optional(),
});
export type KBRecord = z.infer<typeof KBRecord>;

function recordPath(contractId: string): string {
  return join(KB_DIR, `${contractId}.json`);
}

/** Load + validate a KB record by contractId, or null if absent. */
export function loadRecord(contractId: string): KBRecord | null {
  let raw: string;
  try {
    raw = readFileSync(recordPath(contractId), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return KBRecord.parse(JSON.parse(raw));
}

/** List every KB record (validated). */
export function listRecords(): KBRecord[] {
  let names: string[];
  try {
    names = readdirSync(KB_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return names
    .filter((n) => n.endsWith(".json"))
    .map((n) => KBRecord.parse(JSON.parse(readFileSync(join(KB_DIR, n), "utf8"))));
}

/**
 * Derive a MonitoringConfig from the KB record for `contractId`.
 * Tier comes from the archetype policy (`tierForArchetype`); sensitive fns + closure + baseline
 * flow straight through. Throws if no record exists (config can't be invented without an audit).
 */
export function deriveConfig(contractId: string): MonitoringConfig {
  const rec = loadRecord(contractId);
  if (!rec) throw new Error(`no KB record for ${contractId} — audit it first`);
  return MonitoringConfig.parse({
    client: rec.client,
    contractId: rec.contractId,
    archetype: rec.archetype,
    tier: tierForArchetype(rec.archetype),
    sensitiveFns: rec.sensitiveFns,
    closure: rec.closure,
    route: "default",
    baselineAudited: rec.baselineAudited,
    derivedFrom: rec.source,
  });
}

// CLI: `bun run monitoring/kb.ts [contractId]` — derive + print config, or list records.
if (import.meta.main) {
  const id = process.argv[2];
  if (id) {
    console.log(JSON.stringify(deriveConfig(id), null, 2));
  } else {
    console.log(JSON.stringify(listRecords().map((r) => ({ contractId: r.contractId, archetype: r.archetype })), null, 2));
  }
}
