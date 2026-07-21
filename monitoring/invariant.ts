/**
 * Conservation-invariant primitive — the THIRD monitoring lane.
 *
 * The reactive lane (provisioner + trigger-source) watches `print_event` / `contract_call` / asset
 * outflows: it can only see actions that EMIT something. Privileged internal money movement that
 * emits no event is invisible to it — canonically pox-5's `transfer-from-reserve` /
 * `transfer-stranded-rewards`, both `define-private` and consensus-invoked, so no call and no print
 * ever crosses a subscription. The only way to catch them is to POLL on-chain quantities and assert a
 * conservation property holds. That is this file.
 *
 * Shape mirrors baseline.ts: a PURE core (`evaluateInvariant`) that unit-tests without a chain, plus
 * a thin impure edge (`SecondLayerObservationReader`) behind a seam. A violation is not an alert of
 * its own — it becomes a `Finding` (origin "incident", verdict "uncertain": a correlation needing a
 * human, never a self-confirmed exploit) via `violationToFinding`, so it flows through the EXISTING
 * `adjudicateFindings` → `notify` path and reuses warn-once suppression, severity rollup, and the
 * hard human-gating. No parallel alert channel.
 *
 * Reads: absolute uints (a SIP-010 `get-balance`, any `get-*` getter) via the configured Stacks
 * node's `/v2/contracts/call-read` RPC; uint data-vars with no getter (e.g. `reserve-balance` is
 * exposed, but the admin/paused vars are not) via `/v2/data_var`; announced movement via the Index
 * (`index.events` print sums). Node reads are standard node RPC, NOT a third-party API swap
 * (STACKS_NODE_URL). All behind the `ObservationReader` seam so the pure core needs no network.
 *
 *   . ./.env.local && bun run invariant [invariantId]   # evaluate configured invariants once
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SecondLayer } from "@secondlayer/sdk";
import { Cl, deserializeCV, serializeCV } from "@secondlayer/stacks/clarity";
import { parseContractId } from "@secondlayer/stacks/utils";
import type { Finding, FindingClass, Severity } from "./adjudication";
import { networkOf, resolveNodeUrl } from "./network";

/** Observed on-chain quantities at evaluation time, keyed by the invariant's observation `key`. */
export type Observations = Record<string, bigint>;

/**
 * How to READ one named quantity. Declaring the source (not a closure) keeps `Invariant` a pure data
 * value — serializable, diffable, and evaluable in tests with hand-supplied `Observations`.
 *  - data-var-uint: a `uint` data-var read via node `/v2/data_var` (state with no read-only getter).
 *  - read-only-uint: an ABSOLUTE uint from a read-only call via node `/v2/contracts/call-read` —
 *    e.g. a SIP-010 `get-balance(holder)` (the true token balance; NOT a windowed Index sum, which
 *    would give net flow over a page, not the balance) or any uint getter like `get-reserve-balance`.
 *  - print-field-sum: Σ of a numeric field across a contract's print topic (the LEGITIMATE, announced
 *    movement) — the "explained" side of a delta-explained check.
 */
export type ReadOnlyArg = { principal: string } | { uint: string };
export type ObservationSource =
  | { key: string; kind: "data-var-uint"; contractId: string; varName: string }
  | {
      key: string;
      kind: "read-only-uint";
      contractId: string;
      fn: string;
      args: ReadOnlyArg[];
      sender?: string;
    }
  | { key: string; kind: "print-field-sum"; contractId: string; topic: string; field: string };

/**
 * A conservation invariant over named observations. `severity` + `findingClass` are author-declared so
 * the honest bug-vs-centralization label is set at the source (a consensus reserve draw is
 * "centralization"/expected-but-newsworthy; a broken backing floor is a "bug"). Discriminated by `kind`:
 *  - monotonic: `quantity` may only move one way (STATEFUL — needs the prior snapshot). Catches a
 *    decrement of a write-only ledger var (pox-5 `reserve-balance` → `transfer-from-reserve`).
 *  - conservation: relates `total` to Σ`parts` (STATELESS). `mode:"equal"` = exact ledger balance
 *    (|total−Σ| ≤ tolerance); `mode:"floor"` = backing floor (total ≥ Σ−tolerance), for when `total`
 *    legitimately exceeds the tracked parts (pox-5 sBTC balance ≥ `reserve-balance`).
 *  - delta-explained: the change in `quantity` since the prior snapshot must be covered by
 *    `explainedBy` (STATEFUL). Catches an outflow larger than the announced/claim egress.
 */
export type Invariant = {
  id: string;
  contractId: string;
  description: string;
  severity: Severity;
  findingClass: FindingClass;
  /** How to read every quantity the check references. */
  observe: ObservationSource[];
} & (
  | { kind: "monotonic"; quantity: string; direction: "non-decreasing" | "non-increasing" }
  | {
      kind: "conservation";
      total: string;
      parts: string[];
      tolerance: bigint;
      mode: "equal" | "floor";
    }
  | {
      kind: "delta-explained";
      quantity: string;
      explainedBy: string;
      direction: "outflow" | "inflow";
    }
);

/** Persisted prior evaluation — the memory the stateful kinds diff against. bigints as strings. */
export type InvariantSnapshot = {
  invariantId: string;
  observations: Record<string, string>;
  computedAt: string;
};

/**
 * A broken invariant. `kind:"unreadable"` is its own violation (a degraded read PAGES, never silently
 * passes — the credibility rule) distinct from a genuine conservation break.
 */
export type InvariantViolation = {
  invariantId: string;
  kind: Invariant["kind"] | "unreadable";
  message: string;
  observed: Record<string, string>;
  expected?: string;
  delta?: string;
};

const snap = (o: Observations): Record<string, string> =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.toString()]));

/**
 * PURE evaluation: current observations (+ the prior snapshot for stateful kinds) → violations.
 * No chain, no clock, no IO — the whole testable heart of the primitive.
 *
 * A required observation missing from `current` yields an `unreadable` violation, never a false break:
 * we cannot tell "reserve went to zero" from "the read failed", so we surface the read failure instead
 * of inventing a conservation breach.
 */
export function evaluateInvariant(
  inv: Invariant,
  current: Observations,
  prior: InvariantSnapshot | null,
): InvariantViolation[] {
  const observed = snap(current);
  const missing = (keys: string[]): InvariantViolation | null => {
    const absent = keys.filter((k) => !(k in current));
    if (absent.length === 0) return null;
    return {
      invariantId: inv.id,
      kind: "unreadable",
      message: `could not read ${absent.join(", ")} for ${inv.contractId} — degraded read, human review (not a pass)`,
      observed,
    };
  };
  const priorVal = (k: string): bigint | null => {
    const raw = prior?.observations[k];
    return raw === undefined ? null : BigInt(raw);
  };

  if (inv.kind === "monotonic") {
    const gap = missing([inv.quantity]);
    if (gap) return [gap];
    const before = priorVal(inv.quantity);
    if (before === null) return []; // bootstrap: first observation establishes the baseline
    const now = current[inv.quantity];
    const dropped = inv.direction === "non-decreasing" ? now < before : now > before;
    if (!dropped) return [];
    return [
      {
        invariantId: inv.id,
        kind: "monotonic",
        message: `${inv.quantity} moved ${inv.direction === "non-decreasing" ? "DOWN" : "UP"} (${before} → ${now}) — violates ${inv.direction}; only consensus/hard-fork code can do this`,
        observed,
        expected: `${inv.direction} from ${before}`,
        delta: (now - before).toString(),
      },
    ];
  }

  if (inv.kind === "conservation") {
    const gap = missing([inv.total, ...inv.parts]);
    if (gap) return [gap];
    const total = current[inv.total];
    const sum = inv.parts.reduce((a, k) => a + current[k], 0n);
    const diff = total - sum; // >0 total exceeds parts; <0 parts exceed total (under-backed)
    const broken = inv.mode === "equal" ? abs(diff) > inv.tolerance : diff < -inv.tolerance;
    if (!broken) return [];
    return [
      {
        invariantId: inv.id,
        kind: "conservation",
        message:
          inv.mode === "equal"
            ? `${inv.total} (${total}) ≠ Σ[${inv.parts.join("+")}] (${sum}); off by ${diff} (tolerance ${inv.tolerance})`
            : `${inv.total} (${total}) fell BELOW Σ[${inv.parts.join("+")}] (${sum}) by ${-diff} — backing floor broken; sBTC left without decrementing the ledger`,
        observed,
        expected: inv.mode === "equal" ? `= ${sum}` : `≥ ${sum}`,
        delta: diff.toString(),
      },
    ];
  }

  // delta-explained
  const gap = missing([inv.quantity, inv.explainedBy]);
  if (gap) return [gap];
  const before = priorVal(inv.quantity);
  if (before === null) return []; // bootstrap
  const now = current[inv.quantity];
  const moved = inv.direction === "outflow" ? before - now : now - before; // the observed change
  if (moved <= 0n) return []; // moved the benign way (or not at all)
  const explained = current[inv.explainedBy];
  const unexplained = moved - explained;
  if (unexplained <= 0n) return []; // fully covered by announced movement
  return [
    {
      invariantId: inv.id,
      kind: "delta-explained",
      message: `${inv.quantity} ${inv.direction} of ${moved} exceeds announced ${inv.explainedBy} (${explained}) by ${unexplained} — unexplained movement`,
      observed,
      expected: `${inv.direction} ≤ ${explained}`,
      delta: unexplained.toString(),
    },
  ];
}

const abs = (n: bigint): bigint => (n < 0n ? -n : n);

/** Hex-serialize a Clarity arg for a call-read request body. */
function cvHex(cv: Parameters<typeof serializeCV>[0]): string {
  const h = serializeCV(cv);
  return typeof h === "string" ? h : Buffer.from(h as Uint8Array).toString("hex");
}

/**
 * A `uint` out of a hex-serialized Clarity value — unwrapping a `(response uint …)` if the getter
 * returns one (SIP-010 `get-balance`), or reading a bare `uint` (a data-var). Throws on any other
 * shape rather than coercing garbage to a number.
 */
function uintFromCV(hex: string): bigint {
  let cv = deserializeCV(hex.replace(/^0x/, "")) as { type: string; value: unknown };
  if (cv.type === "ok") cv = cv.value as { type: string; value: unknown };
  if (cv.type !== "uint") throw new Error(`expected uint, got Clarity ${cv.type}`);
  return BigInt(cv.value as bigint | string);
}

/**
 * A violation → a `Finding` for `adjudicateFindings`. verdict "uncertain" (routes to needsHuman: a
 * poll-detected breach is a correlation, never self-confirmed) and pocStatus "na" (no simnet PoC
 * reproduces a consensus move). Author-declared severity/class carry the honest label.
 */
export function violationToFinding(inv: Invariant, v: InvariantViolation): Finding {
  const isRead = v.kind === "unreadable";
  return {
    title: `invariant: ${inv.id}`,
    severity: isRead ? "medium" : inv.severity,
    class: isRead ? "info" : inv.findingClass,
    verifierVerdict: "uncertain",
    pocStatus: "na",
    blastRadius: inv.description,
    recommendedAction: v.message,
    origin: "incident",
    precondition: isRead
      ? "read failed — confirm the contract is deployed and the node/Index is reachable before treating as benign"
      : "confirm on-chain whether this movement was an authorized consensus/hard-fork action or an exploit",
  };
}

// ── impure edge ──────────────────────────────────────────────────────────────────────────────────

/** Reads the declared observation sources off-chain. Seam so the pure core is testable in isolation. */
export interface ObservationReader {
  read(sources: ObservationSource[]): Promise<Observations>;
}

function slClient(): SecondLayer {
  const baseUrl = process.env.SECONDLAYER_API_URL;
  const apiKey = process.env.SECONDLAYER_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("SECONDLAYER_API_URL + SECONDLAYER_API_KEY required");
  return new SecondLayer({ baseUrl, apiKey, origin: "session" });
}

/** Default reader: configured Stacks node RPC for uint reads (call-read / data_var); Index for print sums. */
export class SecondLayerObservationReader implements ObservationReader {
  #sl: SecondLayer | null = null;
  #c(): SecondLayer {
    this.#sl ??= slClient();
    return this.#sl;
  }

  /**
   * Read every source, per-source resilient: a failing read OMITS its key (recorded in `errors`)
   * rather than throwing. That way one dead read becomes an `unreadable` violation in the evaluator —
   * which PAGES — instead of an exception a caller might catch-and-drop into a silent pass.
   */
  async read(sources: ObservationSource[]): Promise<Observations> {
    const { observations } = await this.readVerbose(sources);
    return observations;
  }

  async readVerbose(
    sources: ObservationSource[],
  ): Promise<{ observations: Observations; errors: Record<string, string> }> {
    const observations: Observations = {};
    const errors: Record<string, string> = {};
    for (const s of sources) {
      try {
        observations[s.key] =
          s.kind === "data-var-uint"
            ? await this.#dataVarUint(s.contractId, s.varName)
            : s.kind === "read-only-uint"
              ? await this.#readOnlyUint(s.contractId, s.fn, s.args, s.sender)
              : await this.#printFieldSum(s.contractId, s.topic, s.field);
      } catch (e) {
        errors[s.key] = (e as Error).message;
      }
    }
    return { observations, errors };
  }

  /** `/v2/data_var/{addr}/{name}/{var}` → hex-serialized Clarity; deserialize the uint to a bigint. */
  async #dataVarUint(contractId: string, varName: string): Promise<bigint> {
    const node = this.#node(contractId);
    const [addr, name] = parseContractId(contractId);
    const res = await fetch(`${node}/v2/data_var/${addr}/${name}/${varName}?proof=0`);
    if (!res.ok) throw new Error(`data_var ${contractId}.${varName} → HTTP ${res.status}`);
    const { data } = (await res.json()) as { data: string };
    return uintFromCV(data);
  }

  /** `/v2/contracts/call-read/{addr}/{name}/{fn}` → the absolute uint a getter returns (unwraps ok). */
  async #readOnlyUint(
    contractId: string,
    fn: string,
    args: ReadOnlyArg[],
    sender?: string,
  ): Promise<bigint> {
    const node = this.#node(contractId);
    const [addr, name] = parseContractId(contractId);
    const argHex = args.map((a) =>
      "principal" in a ? cvHex(Cl.principal(a.principal)) : cvHex(Cl.uint(BigInt(a.uint))),
    );
    const res = await fetch(`${node}/v2/contracts/call-read/${addr}/${name}/${fn}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sender: sender ?? addr, arguments: argHex }),
    });
    if (!res.ok) throw new Error(`call-read ${contractId}.${fn} → HTTP ${res.status}`);
    const body = (await res.json()) as { okay: boolean; result?: string; cause?: string };
    if (!body.okay || !body.result)
      throw new Error(`call-read ${contractId}.${fn} → ${body.cause}`);
    return uintFromCV(body.result);
  }

  #node(contractId: string): string {
    const net = networkOf(contractId);
    const node = resolveNodeUrl(net);
    if (!node) {
      const envVar = net === "mainnet" ? "STACKS_NODE_URL" : `STACKS_NODE_URL_${net.toUpperCase()}`;
      throw new Error(`no ${net} Stacks node configured for reads (set ${envVar})`);
    }
    return node;
  }

  /** Σ of a numeric field across a contract's print topic — the announced/legitimate movement.
   *  `topic` is not a server-side filter on the events endpoint, so we page prints for the contract
   *  and match the topic client-side (topic + the summed field live in the decoded print payload). */
  async #printFieldSum(contractId: string, topic: string, field: string): Promise<bigint> {
    const { events } = await this.#c().index.events.list({
      eventType: "print",
      contractId,
      limit: 500,
    });
    return (events as Array<Record<string, unknown>>).reduce((a, e) => {
      const payload = (e.value ?? e) as Record<string, unknown>;
      if (payload.topic !== topic) return a;
      const raw = String(payload[field] ?? "");
      return a + (/^\d+$/.test(raw) ? BigInt(raw) : 0n);
    }, 0n);
  }
}

// ── snapshot store (SENTINEL_SINK_DIR JSON, same seam as sub-store) ─────────────────────────────────

const STATE_DIR = process.env.SENTINEL_SINK_DIR ?? join(process.cwd(), ".sentinel");
const STATE_PATH = join(STATE_DIR, "invariant-snapshots.json");

export function loadSnapshot(invariantId: string): InvariantSnapshot | null {
  if (!existsSync(STATE_PATH)) return null;
  const store = JSON.parse(readFileSync(STATE_PATH, "utf8")) as Record<string, InvariantSnapshot>;
  return store[invariantId] ?? null;
}

export function saveSnapshot(s: InvariantSnapshot): void {
  const store: Record<string, InvariantSnapshot> = existsSync(STATE_PATH)
    ? JSON.parse(readFileSync(STATE_PATH, "utf8"))
    : {};
  store[s.invariantId] = s;
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

/**
 * Read → evaluate against the prior snapshot → persist the new snapshot. Returns the violations plus
 * the findings ready to hand to `adjudicateFindings`. The snapshot is recorded even on violation, so a
 * standing breach pages ONCE per evaluation, not every subsequent cycle re-fires the same old delta.
 */
export async function evaluateAndRecord(
  inv: Invariant,
  reader: ObservationReader = new SecondLayerObservationReader(),
  now: string = new Date().toISOString(),
): Promise<{
  violations: InvariantViolation[];
  findings: Finding[];
  snapshot: InvariantSnapshot;
  errors: Record<string, string>;
}> {
  const prior = loadSnapshot(inv.id);
  // Use the verbose read when available so a degraded-read alert can carry the underlying cause
  // (404 = not deployed vs a node timeout are very different pages); fall back to the seam's read().
  const { observations: current, errors } =
    reader instanceof SecondLayerObservationReader
      ? await reader.readVerbose(inv.observe)
      : { observations: await reader.read(inv.observe), errors: {} };
  const violations = evaluateInvariant(inv, current, prior);
  const findings = violations.map((v) => {
    const f = violationToFinding(inv, v);
    // Attach the read cause(s) to a degraded-read finding so the page says WHY, not just "unreadable".
    if (v.kind === "unreadable" && Object.keys(errors).length > 0) {
      f.recommendedAction = `${f.recommendedAction} · causes: ${Object.entries(errors)
        .map(([k, m]) => `${k}: ${m}`)
        .join("; ")}`;
    }
    return f;
  });
  const snapshot: InvariantSnapshot = {
    invariantId: inv.id,
    observations: snap(current),
    computedAt: now,
  };
  // Only checkpoint when the read was complete — an unreadable cycle must NOT overwrite a good
  // baseline with a partial one (that would blind the next monotonic/delta comparison).
  if (!violations.some((v) => v.kind === "unreadable")) saveSnapshot(snapshot);
  return { violations, findings, snapshot, errors };
}

// CLI: evaluate the pox-5 invariant registry once AND route any violations → adjudicate → notify (the
// live alert path, via invariant-pipeline). Reads 404 until pox-5 deploys (~Bitcoin 960,230) → surfaces
// as `unreadable` violations = the honest degraded signal, which now reaches the alert path, not a pass.
// (Dynamic import of invariant-pipeline keeps the static graph acyclic — it imports back from here.)
if (import.meta.main) {
  const { POX5_INVARIANTS } = await import("./pox5-bond-ops");
  const { runInvariant } = await import("./invariant-pipeline");
  const only = process.argv[2];
  const set = only ? POX5_INVARIANTS.filter((i) => i.id === only) : POX5_INVARIANTS;
  if (set.length === 0) {
    console.error(`no invariant '${only}'. known: ${POX5_INVARIANTS.map((i) => i.id).join(", ")}`);
    process.exit(1);
  }
  const reader = new SecondLayerObservationReader();
  for (const inv of set) {
    const r = await runInvariant(inv, reader);
    if (r.violations === 0) console.log(`✓ ${inv.id} — holds (${inv.description})`);
    // else: runInvariant already logged the violation line + notify logged the alert (incl. causes).
  }
}
