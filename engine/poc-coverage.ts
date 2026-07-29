/**
 * PoC coverage manifest — the machine-readable record a freeze/liveness PoC emits so completeness is
 * READ FROM THE POC'S OWN OUTPUT, never self-reported by the model. Gate 3 (engine/gates.ts) reconciles
 * a finding's CLAIMED value-out paths against this DEMONSTRATED coverage, exactly as verifierRan reads
 * subagent evidence off the SDK stream rather than the model's word.
 *
 * The incident this closes (docs/findings/hermetica-v2-RETRACTED.md): a green 21/21 PoC that never
 * CALLED the real exit (`fund-claim`) and asserted its lock precondition as a PREMISE. exitCode 0
 * certified only the assertions the author chose to write, not coverage over the value-out surface.
 *
 * A PoC prints exactly one delimited line to stdout; run_simnet_poc scans the FULL stdout for it and
 * appends it verbatim to the tool result so it survives truncation and flows onto the stream unchanged.
 */
import { z } from "zod";

export const PocExitOutcome = z.enum(["reverted", "ok", "not-called"]);
export const PocExit = z.object({
  fn: z.string(),
  outcome: PocExitOutcome,
  errCode: z.string().nullable().default(null), // on-chain err code, null = bare abort
});
export const PocCoverage = z.object({
  finding: z.string(), // == Finding.title — the match key
  exits: z.array(PocExit),
  preconditionEstablished: z.boolean().default(false), // PoC APPLIED the lock state in-run
  conditional: z.boolean().default(false), // exits revert ONLY under that state
});
export type PocCoverage = z.infer<typeof PocCoverage>;

export const POC_COV_OPEN = "[SENTINEL-POC-COV]";
export const POC_COV_CLOSE = "[/SENTINEL-POC-COV]";

/** Parse the manifest out of arbitrary text (tool stdout / stream tool_result). Null if absent/malformed. */
export function extractPocCoverage(text: string): PocCoverage | null {
  const o = text.indexOf(POC_COV_OPEN);
  const c = text.indexOf(POC_COV_CLOSE);
  if (o < 0 || c < 0 || c < o) return null;
  try {
    const r = PocCoverage.safeParse(JSON.parse(text.slice(o + POC_COV_OPEN.length, c).trim()));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
