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

/** One privileged function to watch on the target contract. */
export const SensitiveFn = z.object({
  name: z.string().describe("Clarity function name, e.g. 'propose' or 'set-implementation'"),
  triggerClass: TriggerClass,
  /** Authorized callers; a call from outside this set is the notable event. Empty = any call is notable. */
  callerAllowlist: z.array(z.string()).default([]),
  /** Optional absolute outflow gate for transfer-class fns (benign below it). */
  outflowThreshold: OutflowThreshold.optional(),
});
export type SensitiveFn = z.infer<typeof SensitiveFn>;

export const MonitoringConfig = z.object({
  client: z.string(),
  contractId: z.string().describe("address.contract-name of the watched contract"),
  archetype: Archetype,
  /** Audit tier fired when one of this contract's sensitive fns triggers. */
  tier: Tier,
  sensitiveFns: z.array(SensitiveFn),
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

/** Default class→tier policy (MVP; replaced by the TVL/stakes router post-subgraph). */
export function tierForArchetype(archetype: Archetype): Tier {
  // Governance + upgradeable-proxy paths are where DAO drains live → Deep. Treasury holds value
  // and is proposal-driven → Deep. AMM/vault/token state changes → Monitor by default.
  return archetype === "governance-dao" || archetype === "treasury" ? "deep" : "monitor";
}
