/**
 * Consumer pre-filter — the "no spend on benign" gate (M3).
 *
 * A trigger fires on every matching on-chain event; most are benign. This decides, per trigger
 * CLASS, whether an event is notable enough to spend a (budgeted) audit on. Benign ⇒ the bridge
 * logs + 204s with zero spend; notable ⇒ it proceeds to dispatch.
 *
 * Per-class semantics (decided 2026-06-29 — a single caller-allowlist rule can't work: e.g. a DAO
 * `execute` is ALWAYS called by the DAO core, so "caller∈allowlist ⇒ drop" would drop every
 * proposal and never audit governance):
 *  - governance.proposal_submitted / governance.proxy_upgrade → ALWAYS notable (the proposal/
 *    upgrade payload is the subject). A caller OUTSIDE the allowlist is flagged `suspicious` (an
 *    unexpected principal hitting a privileged fn), not dropped.
 *  - transfer.outflow → benign iff the decoded amount is BELOW the configured threshold. No
 *    threshold, or an undecodable amount ⇒ notable (fail-safe: never silently drop a drain).
 *  - counterparty.new → benign iff the caller (tx sender) is a KNOWN counterparty (in the
 *    allowlist); an unknown/new counterparty is the notable event.
 *
 * `caller` = the tx `sender` (immediate-caller attribution is an upstream node-receipt limit;
 * server-side caller set/negation filtering is secondlayer f044, planned-not-shipped — so this
 * stays client-side). Pure + deterministic: unit-tested without any chain or spend.
 */
import { decodeClarityValue } from "@secondlayer/sdk";
import type { SensitiveFn } from "./config";

/** The decoded chain event carried under the webhook envelope's `event`. The bridge normalizes the
 *  raw delivery into this flat shape (secondlayer uses `event_type` + sometimes a nested `payload`;
 *  see normalizeEvent in the webhook bridge), so downstream code reads a canonical `type` + flat fields. */
export type ChainEventBody = {
  type?: string;
  /** Raw secondlayer discriminator (`ft_transfer`/`contract_call`/…); normalized into `type`. */
  event_type?: string;
  /** Raw nested payload (Streams-shape deliveries); the bridge flattens it into the fields below. */
  payload?: Record<string, unknown>;
  contract_id?: string;
  function_name?: string;
  /** Clarity values, hex-encoded (decodeClarityValue decodes each). */
  function_args?: string[];
  /** Tx sender = the `caller` we filter on. */
  sender?: string;
  status?: string;
  result_hex?: string;
  /** Asset-transfer event fields (ft_transfer/stx_transfer subs): the asset + amount + recipient
   *  carried DIRECTLY (no function_args to decode). `sender` = the watched contract (we scope
   *  sender=contract), so an outflow event has the amount/asset at the top level. */
  asset_identifier?: string;
  amount?: string;
  recipient?: string;
};

// A fully-qualified contract principal `SP….name` (the shape a decoded proposal/extension arg takes).
const CONTRACT_PRINCIPAL = /^S[A-Z0-9]{38,40}\.[a-z][a-z0-9-]*$/;

/**
 * Decode `function_args` (hex) to their string forms. `decodeClarityValue` returns a contract
 * principal as `"SP….name"`, a uint as a decimal string, etc. An undecodable arg becomes "".
 */
export function decodeArgs(args: string[] | undefined): string[] {
  if (!args) return [];
  return args.map((hex) => {
    try {
      const v = decodeClarityValue(hex);
      return typeof v === "string" ? v : String(v);
    } catch {
      return "";
    }
  });
}

/** First arg that is a contract principal (`SP….name`) — the proposal/extension target. */
export function firstContractPrincipal(decoded: string[]): string | null {
  return decoded.find((d) => CONTRACT_PRINCIPAL.test(d)) ?? null;
}

/** First arg that is a non-negative integer (uint) — the outflow amount, best-effort. */
export function firstUint(decoded: string[]): bigint | null {
  for (const d of decoded) {
    if (/^\d+$/.test(d)) return BigInt(d);
  }
  return null;
}

/** The amount carried directly on a transfer event (`event.amount`), or null if absent/malformed. */
export function transferAmount(event: ChainEventBody): bigint | null {
  if (event.amount == null || !/^\d+$/.test(event.amount)) return null;
  return BigInt(event.amount);
}

export type PrefilterVerdict = {
  /** True ⇒ worth a (budgeted) audit; false ⇒ benign, log + 204, no spend. */
  notable: boolean;
  /** Human-readable why (logged). */
  reason: string;
  /** Governance: a caller outside the allowlist hit a privileged fn — escalate attention. */
  suspicious: boolean;
  /** Decoded outflow amount (transfer.outflow), if one was found. */
  amount: bigint | null;
};

/** Decide whether one event on a watched sensitive fn is notable. Pure; no side effects. */
export function classify(fn: SensitiveFn, event: ChainEventBody): PrefilterVerdict {
  const decoded = decodeArgs(event.function_args);
  const caller = event.sender ?? "";

  switch (fn.triggerClass) {
    case "governance.proposal_submitted":
    case "governance.proxy_upgrade": {
      const authorized = fn.callerAllowlist.length === 0 || fn.callerAllowlist.includes(caller);
      return {
        notable: true,
        suspicious: !authorized,
        amount: null,
        reason: authorized
          ? "governance call — always audited"
          : `governance call from caller outside allowlist (${caller || "unknown"}) — suspicious`,
      };
    }
    case "transfer.outflow": {
      // Transfer-event subs carry the amount directly (event.amount); contract_call subs carry it in
      // function_args (firstUint). Prefer the direct field.
      const amount = transferAmount(event) ?? firstUint(decoded);
      const threshold = fn.outflowThreshold ? BigInt(fn.outflowThreshold.amount) : null;
      if (threshold !== null && amount !== null) {
        const notable = amount >= threshold;
        return {
          notable,
          suspicious: false,
          amount,
          reason: notable
            ? `outflow ${amount} >= threshold ${threshold} — audit`
            : `outflow ${amount} < threshold ${threshold} — benign`,
        };
      }
      return {
        notable: true,
        suspicious: false,
        amount,
        reason:
          threshold === null
            ? "no outflow threshold configured — audit (fail-safe)"
            : "outflow amount undecodable — audit (fail-safe)",
      };
    }
    case "counterparty.new": {
      const known = fn.callerAllowlist.length > 0 && fn.callerAllowlist.includes(caller);
      return {
        notable: !known,
        suspicious: false,
        amount: null,
        reason: known
          ? `known counterparty ${caller} — benign`
          : `new/unknown counterparty ${caller || "unknown"} — audit`,
      };
    }
    default:
      return {
        notable: true,
        suspicious: false,
        amount: null,
        reason: `unhandled trigger class ${fn.triggerClass} — audit (fail-safe)`,
      };
  }
}
