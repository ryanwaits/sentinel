/**
 * MonitoringConfig — the declarative judgment artifact the whole monitoring layer reads.
 *
 * Turns a client's audited contracts + the audit KB into: which contracts to watch, which
 * functions are privileged (and the trigger class each maps to), absolute outflow thresholds,
 * per-fn authorized-caller allowlists, the archetype class, the audit tier, and the escalation
 * route. Pure judgment, no chain dependency — `deriveConfig` (monitoring/kb.ts) builds one from
 * a seeded KB record. zod v4 (eve's schema normalizer requires v4; v3 crashes it).
 *
 * Absolute thresholds only (ft/stx base units) — relative-% / windowed-rate baselines are
 * stateful Sentinel-KB judgment (component 5, Full), not expressible here.
 */
import { z } from "zod";
// Value import is cycle-safe: adjudication.ts value-imports ONLY zod (its kb/trigger-state imports
// are `import type`, erased at runtime), so config -> adjudication never forms a runtime cycle.
import { Severity } from "./adjudication";

/** Chain-trigger classes (MVP set). Tier is derived from these + the archetype class. */
export const TriggerClass = z.enum([
  "governance.proposal_submitted",
  "governance.proxy_upgrade",
  "counterparty.new",
  "transfer.outflow",
]);
export type TriggerClass = z.infer<typeof TriggerClass>;

/** Audit tier. Two-deployment routing in MVP (Monitor=Sonnet / Deep=Opus). */
export const Tier = z.enum(["monitor", "deep"]);
export type Tier = z.infer<typeof Tier>;

/** Contract archetype — drives class→tier policy until the TVL/stakes router ships. */
export const Archetype = z.enum(["governance-dao", "vault", "amm", "treasury", "token", "other"]);
export type Archetype = z.infer<typeof Archetype>;

/** Absolute outflow threshold in an asset's base units (string to preserve uint precision). */
export const OutflowThreshold = z.object({
  asset: z.string().describe("ft asset identifier or 'stx'"),
  amount: z.string().describe("base-units threshold; fires when a single outflow meets/exceeds it"),
});
export type OutflowThreshold = z.infer<typeof OutflowThreshold>;

/** An accepted centralization/trust finding — surfaced once, then suppressed (not a re-pageable bug).
 *  Lives HERE (not kb.ts) so kb.ts imports it FROM config — the existing safe import direction. */
export const CentralizationWaiver = z.object({
  finding: z.string(),
  label: z.enum(["centralization", "by-design", "info", "low"]),
  note: z.string().optional(),
});
export type CentralizationWaiver = z.infer<typeof CentralizationWaiver>;

/** A Type-2 detection SIGNATURE distilled from a confirmed audit finding — the bug the audit proved
 *  becomes the thing monitoring watches for being exploited. A runtime match is a CORRELATION (the
 *  flagged fn was invoked), never a confirmed exploit; `precondition` is the human's discriminator. */
export const FindingSignature = z.object({
  title: z.string().describe("the prior finding this signature concerns"),
  fn: z.string().describe("event.function_name must equal this"),
  triggerClass: TriggerClass.optional(),
  severity: Severity.optional().describe("carried from the prior finding; drives WARN level"),
  asset: z.string().describe("ft id or 'stx' — narrows the match if set").optional(),
  precondition: z
    .string()
    .describe("the exploitability condition surfaced to the human")
    .optional(),
});
export type FindingSignature = z.infer<typeof FindingSignature>;

/** One privileged function to watch on the target contract. */
export const SensitiveFn = z.object({
  name: z.string().describe("Clarity function name, e.g. 'propose' or 'set-implementation'"),
  triggerClass: TriggerClass,
  /** Authorized callers; a call from outside this set is the notable event. Empty = any call is notable. */
  callerAllowlist: z.array(z.string()).default([]),
  /** LIVE absolute outflow gate (human-promoted); prefilter reads ONLY this. */
  outflowThreshold: OutflowThreshold.optional(),
  /** Audit-SUGGESTED starting threshold (advisory). The prefilter NEVER reads this — a human
   *  reviews + promotes it into `outflowThreshold`. Audit generates the quantitative filter. */
  suggestedOutflowThreshold: OutflowThreshold.optional(),
});
export type SensitiveFn = z.infer<typeof SensitiveFn>;

export const MonitoringConfig = z.object({
  client: z.string(),
  contractId: z.string().describe("address.contract-name of the watched contract"),
  archetype: Archetype,
  /** Audit tier fired when one of this contract's sensitive fns triggers. */
  tier: Tier,
  sensitiveFns: z.array(SensitiveFn),
  /** Type-2 detection signatures (confirmed audit findings → known-finding-match). */
  signatures: z.array(FindingSignature).default([]),
  /** Accepted centralization waivers (warn-once suppression set). */
  waivers: z.array(CentralizationWaiver).default([]),
  /** Contracts to fetch alongside the target on a trigger (static call-graph closure seed). */
  closure: z.array(z.string()).default([]),
  /** Escalation route (notify channel id); disclosure stays human-gated. */
  route: z.string().default("default"),
  /** Has a prior baseline audit? flows (a)/(c) need one; else degrade to absolute-outflow watch. */
  baselineAudited: z.boolean().default(false),
  /** Provenance: KB record / report this config was derived from. */
  derivedFrom: z.string().optional(),
});
export type MonitoringConfig = z.infer<typeof MonitoringConfig>;

/** Trigger routing: Type-1 (NEW code entering a timelock → audit it) vs Type-2 (runtime behavior on
 *  unchanged code → incident triage, NO re-audit). The single source of truth; the bridge imports this
 *  (no local copy) so the webhook + triage can never drift. */
export const GOVERNANCE_CLASSES = [
  "governance.proposal_submitted",
  "governance.proxy_upgrade",
] as const;
export type TriggerRoute = "type1" | "type2";
export function routeForTriggerClass(c: TriggerClass): TriggerRoute {
  return (GOVERNANCE_CLASSES as readonly string[]).includes(c) ? "type1" : "type2";
}

/** Default class→tier policy (MVP; replaced by the TVL/stakes router post-subgraph). */
export function tierForArchetype(archetype: Archetype): Tier {
  // Governance + upgradeable-proxy paths are where DAO drains live → Deep. Treasury holds value
  // and is proposal-driven → Deep. AMM/vault/token state changes → Monitor by default.
  return archetype === "governance-dao" || archetype === "treasury" ? "deep" : "monitor";
}
