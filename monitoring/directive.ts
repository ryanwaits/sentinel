/**
 * [SENTINEL-TRIGGER] directive builder (M3).
 *
 * Turns a notable chain event into the structured instruction the eve agent acts on: which tier,
 * which exact contracts to audit (`audit_targets[]`), and the trigger provenance. The agent
 * (agent/instructions.md, M3b) parses the `[SENTINEL-TRIGGER]{…}[/SENTINEL-TRIGGER]` block.
 *
 * audit_targets[] is the heart of the value: for a governance proposal/upgrade the SUBJECT is the
 * proposal contract passed in `function_args` — NOT the watched DAO/treasury (already baseline-
 * audited). We decode that principal and resolve ITS live static call-graph closure (best-effort,
 * off the node) so a proposal-by-indirection — a hostile proposal acting via a separate deployed M
 * — has M in scope too. The watched contract + its KB-seeded closure are always unioned in for
 * context. The agent re-fetches each target's full source for the auditor subagents.
 */

import { resolveClosureIds } from "./closure";
import type { MonitoringConfig, SensitiveFn, TriggerClass } from "./config";
import { fetchSourceById, sourceReadEnabled } from "./contract-source";
import {
  type ChainEventBody,
  decodeArgs,
  firstContractPrincipal,
  type PrefilterVerdict,
} from "./prefilter";
import type { Tier } from "./spend-ceiling";

const GOVERNANCE_CLASSES: TriggerClass[] = [
  "governance.proposal_submitted",
  "governance.proxy_upgrade",
];

// Trigger-time closure bounds — keep the dispatched audit scope to the immediate blast radius so the
// subagent panel isn't drowned in inlined source. The agent expands deeper on demand.
const CLOSURE_MAX_DEPTH = Number(process.env.SENTINEL_CLOSURE_MAX_DEPTH ?? 2);
const CLOSURE_MAX_CONTRACTS = Number(process.env.SENTINEL_CLOSURE_MAX_CONTRACTS ?? 6);

/**
 * Tier for an event = the STRICTER of the class tier and the contract's archetype tier (deep
 * beats monitor), so a value-holding contract is never under-audited. Governance → deep; transfer/
 * counterparty → monitor, unless the contract itself (treasury/DAO) is already deep.
 */
export function tierFor(cls: TriggerClass, contractTier: Tier): Tier {
  const classTier: Tier = GOVERNANCE_CLASSES.includes(cls) ? "deep" : "monitor";
  return classTier === "deep" || contractTier === "deep" ? "deep" : "monitor";
}

/**
 * Resolve audit_targets[] for a trigger. Returns the ordered target list (proposal first when one
 * is decoded, then the watched contract, then closures) plus the decoded proposal principal.
 */
export async function buildAuditTargets(
  config: MonitoringConfig,
  fn: SensitiveFn,
  event: ChainEventBody,
): Promise<{ targets: string[]; proposal: string | null }> {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | null | undefined) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  };

  // 1) the proposal/upgrade subject + its LIVE closure (the new, un-audited code) — first.
  let proposal: string | null = null;
  if (GOVERNANCE_CLASSES.includes(fn.triggerClass)) {
    proposal = firstContractPrincipal(decodeArgs(event.function_args));
    if (proposal) {
      add(proposal);
      if (sourceReadEnabled()) {
        try {
          // Bound the trigger-time walk to the immediate blast radius — dispatching a 64-contract
          // audit inlines too much source across the subagent panel (slow + costly). The agent
          // expands deeper via its own fetch_contract_source if a target warrants it.
          const ids = await resolveClosureIds(
            proposal,
            async (id) => (await fetchSourceById(id))?.source ?? null,
            { maxDepth: CLOSURE_MAX_DEPTH, maxContracts: CLOSURE_MAX_CONTRACTS },
          );
          for (const id of ids) add(id);
        } catch {
          // node miss / walk failure — proposal alone stays in scope; agent re-resolves closure.
        }
      }
    }
  }

  // 2) the watched contract + its KB-seeded closure (context; already baseline-audited).
  add(config.contractId);
  for (const id of config.closure) add(id);

  return { targets: ordered, proposal };
}

/** The structured payload embedded in the directive block. */
export type SentinelDirective = {
  version: 1;
  contract_id: string;
  function_name: string;
  trigger_class: TriggerClass;
  caller: string | null;
  tx_id: string | null;
  block_height: number | null;
  /** Block by which a verdict must land (timelock-aware). Pass-through/null in M3; computed in M5. */
  deadline_block: number | null;
  tier: Tier;
  /** Governance call from a caller outside the allowlist. */
  suspicious: boolean;
  /** The decoded proposal/upgrade subject (governance), else null. */
  proposal_target: string | null;
  /** Decoded outflow amount (transfer.outflow), as a decimal string, else null. */
  outflow_amount: string | null;
  audit_targets: string[];
};

const OPEN = "[SENTINEL-TRIGGER]";
const CLOSE = "[/SENTINEL-TRIGGER]";

export type BuiltDirective = { message: string; directive: SentinelDirective; tier: Tier };

/** Build the full eve `message` (directive block + instruction) for a notable event. */
export async function buildDirective(
  config: MonitoringConfig,
  fn: SensitiveFn,
  event: ChainEventBody,
  verdict: PrefilterVerdict,
  meta: { txId?: string; blockHeight?: number; deadlineBlock?: number | null },
): Promise<BuiltDirective> {
  const tier = tierFor(fn.triggerClass, config.tier);
  const { targets, proposal } = await buildAuditTargets(config, fn, event);

  const directive: SentinelDirective = {
    version: 1,
    contract_id: config.contractId,
    function_name: fn.name,
    trigger_class: fn.triggerClass,
    caller: event.sender ?? null,
    tx_id: meta.txId ?? null,
    block_height: meta.blockHeight ?? null,
    deadline_block: meta.deadlineBlock ?? null,
    tier,
    suspicious: verdict.suspicious,
    proposal_target: proposal,
    outflow_amount: verdict.amount !== null ? verdict.amount.toString() : null,
    audit_targets: targets,
  };

  const subject = proposal
    ? `governance ${fn.name} executing proposal ${proposal}`
    : `${fn.triggerClass} via ${fn.name} on ${config.contractId}`;
  const message =
    `${OPEN}\n${JSON.stringify(directive, null, 2)}\n${CLOSE}\n\n` +
    `Sentinel trigger: ${subject}${verdict.suspicious ? " (SUSPICIOUS — caller outside allowlist)" : ""}. ` +
    `Audit the contracts in audit_targets[] — START with audit_targets[0] (the primary subject); if ` +
    `the list is large, focus there and its direct dependencies. Read EVERY source with the ` +
    `fetch_contract_source tool ONLY (closure=true on the proposal target to catch indirection) — do ` +
    `NOT use web_fetch or bash. Run the auditor-* subagents, adversarially verify, and reproduce any ` +
    `confirmed high/critical with run_simnet_poc (if the sandbox errors, report pocStatus pending — do not loop). ` +
    `If deadline_block is set, deliver a verdict BEFORE attempting the (slow) PoC. Report findings ` +
    `labeled bug-vs-centralization.`;

  return { message, directive, tier };
}
