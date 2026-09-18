/**
 * Audit → KB distillation — turn a finished baseline audit into a CANDIDATE KBRecord (the carry-
 * forward context the next audit reads: archetype, sensitive fns, accepted waivers, prior findings).
 * Automates what was hand-seeded for the Zest vault.
 *
 * Deterministic where it can be (the credibility-sensitive bits). Archetype comes from the audit's
 * `kbCandidate`, overlaid by Jev when confidence clears the floor (LLM/other stays on abstain):
 *  - closure       ← the static resolver (override any guess)
 *  - waivers       ← CONFIRMED centralization findings (the accept-once set)
 *  - priorFindings ← CONFIRMED high/critical BUGS, plus live KB bugs this run omitted or
 *    relabeled centralization (don't silently drop a proven bug). Signature from targetFn, else
 *    exactly one watched fn named in the title/note (never guess among 0/2+). Jev does not pick
 *    the fn or relitigate bug-vs-centralization.
 *  - sensitiveFns  ← LLM, then SANITISED class-aware: counterparty allowlists are SUPPRESSION sets
 *    (a wrong entry silently drops events) so never auto-populate them; outflow thresholds left unset;
 *    a fn that distilled a Type-2 signature cannot stay Type-1 (except proposal_submitted — never
 *    steal the veto path). Dump-bin `proxy_upgrade` on an authorized mutator would re-audit unchanged
 *    code instead of paging "the bug got used".
 *
 * Writes drafts to `KB_DIR/_candidates/` (default `.sentinel/kb/_candidates/`). A human
 * `saveRecord`s into `KB_DIR` before it drives `deriveConfig`. Never git-commits a live watch.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Finding } from "../monitoring/adjudication";
import { resolveClosureIds } from "../monitoring/closure";
import { Archetype, routeForTriggerClass, SensitiveFn } from "../monitoring/config";
import { fetchSourceById } from "../monitoring/contract-source";
import { type ClassifyArchetype, classifyArchetype, jevConfidenceFloor } from "../monitoring/jev";
import {
  KB_DIR,
  type KBRecord,
  KBRecord as KBRecordSchema,
  type PriorFinding,
} from "../monitoring/kb";

/** The LLM-extracted slice the audit emits alongside findings (validated). */
export const KBCandidate = z.object({ archetype: Archetype, sensitiveFns: z.array(SensitiveFn) });
export type KBCandidate = z.infer<typeof KBCandidate>;

/** Build a candidate KBRecord from a finished audit's findings + the emitted kbCandidate. */
const SOURCE_EXCERPT = 6000;

/** Exactly one watched fn named in the text → that fn. 0 or 2+ → undefined (never fabricate). */
export function uniqueWatchedFn(text: string, fnNames: Iterable<string>): string | undefined {
  const hits = [...fnNames].filter((n) => n.length > 0 && text.includes(n));
  return hits.length === 1 ? hits[0] : undefined;
}

function bugSignature(
  title: string,
  severity: PriorFinding["severity"],
  fnNames: Set<string>,
  hay: string,
  targetFn?: string,
  targetAsset?: string,
  precondition?: string,
  note?: string,
): PriorFinding["signature"] {
  const fn = targetFn && fnNames.has(targetFn) ? targetFn : uniqueWatchedFn(hay, fnNames);
  if (!fn) return undefined;
  return {
    title,
    fn,
    asset: targetAsset,
    severity,
    precondition: precondition || note || undefined,
    triggerClass: targetAsset ? ("transfer.outflow" as const) : undefined,
  };
}

export async function buildKBCandidate(
  contractId: string,
  findings: Finding[],
  kbCandidate: KBCandidate | undefined,
  opts: {
    client: string;
    auditedAt: string;
    classifyArchetype?: ClassifyArchetype;
    /** Live KB — proven bugs survive this run omitting or relabeling them, unless REFUTED. */
    live?: Pick<KBRecord, "priorFindings" | "sensitiveFns"> | null;
  },
): Promise<KBRecord> {
  let closure: string[] = [];
  let sourceExcerpt: string | undefined;
  try {
    const fetched = await fetchSourceById(contractId);
    if (fetched?.source) sourceExcerpt = fetched.source.slice(0, SOURCE_EXCERPT);
    closure = (
      await resolveClosureIds(contractId, async (id) => (await fetchSourceById(id))?.source ?? null)
    ).filter((id) => id !== contractId);
  } catch {
    // node miss — leave closure empty; human/re-run fills it.
  }

  // Class-aware sanitisation: counterparty allowlists drop events as benign → never auto-fill them.
  // The LIVE outflowThreshold stays UNSET (a human promotes it); the audit's SUGGESTED threshold
  // (suggestedOutflowThreshold, advisory — prefilter never reads it) is preserved by the spread.
  const sensitiveFns = (kbCandidate?.sensitiveFns ?? []).map((fn) => {
    const sf = { ...fn };
    delete sf.outflowThreshold; // never let the audit set the live gate
    if (sf.triggerClass === "counterparty.new") sf.callerAllowlist = [];
    return sf;
  });
  const fnNames = new Set(sensitiveFns.map((f) => f.name));
  for (const sf of opts.live?.sensitiveFns ?? []) {
    if (sf.name) fnNames.add(sf.name);
  }

  const confirmed = findings.filter((f) => f.verifierVerdict === "confirmed");
  const refutedTitles = new Set(
    findings.filter((f) => f.verifierVerdict === "refuted").map((f) => f.title),
  );
  const priorFindings: PriorFinding[] = confirmed
    .filter((f) => f.class === "bug" && (f.severity === "high" || f.severity === "critical"))
    .map((f) => {
      const note = f.blastRadius ?? f.recommendedAction;
      return {
        title: f.title,
        severity: f.severity,
        class: "bug" as const,
        note,
        signature: bugSignature(
          f.title,
          f.severity,
          fnNames,
          `${f.title}\n${note ?? ""}\n${f.precondition ?? ""}`,
          f.targetFn,
          f.targetAsset,
          f.precondition,
          note,
        ),
      };
    });

  // Live proven bugs survive this run omitting them or relabeling centralization.
  // Only a REFUTED finding with the same title may drop them.
  const seen = new Set(priorFindings.map((p) => p.title));
  for (const liveBug of opts.live?.priorFindings ?? []) {
    if (liveBug.class !== "bug") continue;
    if (liveBug.severity !== "high" && liveBug.severity !== "critical") continue;
    if (refutedTitles.has(liveBug.title)) {
      console.log(`[distill] drop live bug (refuted this run) ${liveBug.title}`);
      continue;
    }
    if (seen.has(liveBug.title)) continue;
    const hay = `${liveBug.title}\n${liveBug.note ?? ""}\n${liveBug.signature?.fn ?? ""}`;
    const signature =
      liveBug.signature && fnNames.has(liveBug.signature.fn)
        ? {
            ...liveBug.signature,
            precondition: liveBug.signature.precondition || liveBug.note,
          }
        : bugSignature(
            liveBug.title,
            liveBug.severity,
            fnNames,
            hay,
            liveBug.signature?.fn,
            liveBug.signature?.asset,
            liveBug.signature?.precondition,
            liveBug.note,
          );
    priorFindings.push({
      title: liveBug.title,
      severity: liveBug.severity,
      class: "bug",
      note: liveBug.note,
      pocFile: liveBug.pocFile,
      signature,
    });
    seen.add(liveBug.title);
    console.log(
      `[distill] keep live bug ${liveBug.title}${signature ? ` sig=${signature.fn}` : " (no signature)"}`,
    );
  }

  const bugTitles = new Set(priorFindings.map((p) => p.title));
  const waivers = confirmed
    .filter((f) => f.class === "centralization" && !bugTitles.has(f.title))
    .map((f) => ({
      finding: f.title,
      label: "centralization" as const,
      note: f.recommendedAction ?? f.blastRadius,
    }));

  // A signature on a fn this run omitted from the watch list — restore it (from live, or Type-2 stub).
  for (const p of priorFindings) {
    const fn = p.signature?.fn;
    if (!fn || sensitiveFns.some((s) => s.name === fn)) continue;
    const fromLive = opts.live?.sensitiveFns?.find((s) => s.name === fn);
    const sf = fromLive
      ? { ...fromLive }
      : {
          name: fn,
          triggerClass: p.signature?.triggerClass ?? ("counterparty.new" as const),
          callerAllowlist: [] as string[],
        };
    delete sf.outflowThreshold;
    if (sf.triggerClass === "counterparty.new") sf.callerAllowlist = [];
    sensitiveFns.push(sf);
    console.log(`[distill] restore watched fn ${fn} (signature)`);
  }

  // Signature-bearing fns are detection watches. The LLM dumps authorized mutators into
  // governance.proxy_upgrade (junk bin) → webhook Type-1s unchanged code. Coerce to Type-2
  // except never steal proposal_submitted (Andre's veto-in-timelock path).
  const signed = new Map(
    priorFindings.flatMap((p) => (p.signature ? [[p.signature.fn, p.signature] as const] : [])),
  );
  for (const sf of sensitiveFns) {
    const sig = signed.get(sf.name);
    if (!sig) continue;
    if (sf.triggerClass === "governance.proposal_submitted") continue;
    if (routeForTriggerClass(sf.triggerClass) === "type2") continue;
    const next = sig.triggerClass ?? "counterparty.new";
    console.log(`[distill] coerce ${sf.name} ${sf.triggerClass} → ${next} (signature)`);
    sf.triggerClass = next;
    if (next === "counterparty.new") sf.callerAllowlist = [];
  }

  let archetype = kbCandidate?.archetype ?? "other";
  const classify = opts.classifyArchetype ?? classifyArchetype;
  const jev = await classify({
    contractId,
    sourceExcerpt,
    prior: kbCandidate?.archetype,
  });
  const floor = jevConfidenceFloor();
  if (jev && jev.confidence >= floor) {
    if (jev.archetype !== archetype) {
      console.log(
        `[jev] archetype ${contractId} ${archetype} → ${jev.archetype} conf=${jev.confidence.toFixed(2)} tokens=${jev.inputTokens}`,
      );
    }
    archetype = jev.archetype;
  } else if (jev) {
    console.log(
      `[jev] archetype ${contractId} abstain conf=${jev.confidence.toFixed(2)} < ${floor} (kept ${archetype})`,
    );
  }

  return KBRecordSchema.parse({
    contractId,
    client: opts.client,
    archetype,
    closure,
    baselineAudited: true,
    auditedAt: opts.auditedAt,
    sensitiveFns,
    waivers,
    priorFindings,
    source: "engine/distill (CANDIDATE — human review required before it drives monitoring)",
  });
}

/** Honest onboard line for a candidate. Not a new field — CLI / review copy. */
export function planAdvice(rec: KBRecord): string {
  const sigs = rec.priorFindings.filter((p) => p.signature).length;
  const unwatched = rec.priorFindings.filter((p) => p.class === "bug" && !p.signature).length;
  const type1 = rec.sensitiveFns.filter(
    (f) => routeForTriggerClass(f.triggerClass) === "type1",
  ).length;
  const volumeOnly =
    rec.sensitiveFns.length > 0 &&
    rec.sensitiveFns.every(
      (f) =>
        (f.triggerClass === "counterparty.new" && f.callerAllowlist.length === 0) ||
        (f.triggerClass === "transfer.outflow" && !f.outflowThreshold),
    );
  if (rec.sensitiveFns.length === 0 && sigs === 0) {
    return "NO PLAN — report only; nothing to watch.";
  }
  if (unwatched > 0) {
    return `${unwatched} confirmed bug(s) not watched (missing targetFn). Re-run or set targetFn on promote.`;
  }
  if (sigs === 0 && type1 === 0 && volumeOnly) {
    return "DON'T TURN ON until allowlist/threshold filled — remaining watches are volume.";
  }
  const bits: string[] = [];
  if (type1) bits.push(`${type1} Type-1 (veto in timelock)`);
  if (sigs) bits.push(`${sigs} detection signature(s)`);
  return `TURN ON — ${bits.join("; ") || "review the plan"}.`;
}

/** Live class:bug titles this candidate dropped (omission, not a same-title refute). */
export function droppedLiveBugs(
  candidate: KBRecord,
  live: Pick<KBRecord, "priorFindings"> | null | undefined,
): NonNullable<KBRecord["priorFindings"]> {
  if (!live) return [];
  return live.priorFindings.filter(
    (p) => p.class === "bug" && !candidate.priorFindings.some((c) => c.title === p.title),
  );
}

/**
 * Distill is blocked when a confirmed bug has no watch, or a live bug vanished.
 * Honest empty/noisy plans (NO PLAN / DON'T TURN ON) are not failures.
 */
export function distillBlocked(
  candidate: KBRecord,
  live?: Pick<KBRecord, "priorFindings"> | null,
): string | null {
  const unwatched = candidate.priorFindings.filter((p) => p.class === "bug" && !p.signature);
  if (unwatched.length) return planAdvice(candidate);
  const dropped = droppedLiveBugs(candidate, live);
  if (dropped.length) {
    return `live KB bug(s) missing from candidate: ${dropped.map((d) => d.title).join("; ")}`;
  }
  return null;
}

/** Write a candidate to `KB_DIR/_candidates/<contractId>.json` (review dir). Returns the path. */
export function writeCandidate(record: KBRecord): string {
  const dir = join(KB_DIR, "_candidates");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${record.contractId}.json`);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return path;
}
