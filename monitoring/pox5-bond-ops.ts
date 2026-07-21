/**
 * PoX-5 bond-ops monitor — the provisioning config for watching the SIP-045 "Bitcoin Staking"
 * boot contract (`pox-5.clar`) once it deploys at Epoch 4.0.
 *
 * This is a HAND-AUTHORED config, NOT a `deriveConfig(contractId)` (monitoring/kb.ts) output: pox-5
 * is a consensus boot contract with no KB record and no chain deployment yet, so its watch set comes
 * from the reviewed source (WS1), not an audit KB. The plan it produces is the same `SubSpec` shape
 * the provisioner reconciles, so when a testnet boot address exists this drops straight into
 * `applyPlan` — until then it is exercised against a FAKE contractId and unit-tested against fixture
 * events (NO live deploy; see pox5-bond-ops.test.ts).
 *
 * Both trigger types are LIVE in secondlayer prod (@secondlayer/shared chain triggers):
 *   - print_event { contractId, topic }  — the ~20 pox-5 print topics (behavioral coverage).
 *   - contract_call { contractId, functionName, caller } — the privileged fns + admin-key watch.
 *
 * Provenance — topics + fns are pinned to the reviewed bytes:
 *   stacks-network/stacks-core @ tag 4.0.1 (FINAL Epoch-4.0 release, 2026-07-15),
 *   commit 62e03cc5551bfc574223c2b78ce04ceca30cec37
 *   stackslib/src/chainstate/stacks/boot/pox-5.clar (3,845 lines, Clarity 6).
 * Diff vs prior pin d78f15a8 (pox-wf-integration): topics + public/private fn sets IDENTICAL;
 * deltas are (1) bond-admin/pause-admin now init to the real principal
 * SP72DMR3MJKS7RVBY33JVV7EEJSQ1PYDVKDP10FX (not the boot placeholder), (2) new
 * BITCOIN_LOCKTIME_THRESHOLD u500000000 assert on unlock-burn-height (ERR_INVALID_UNLOCK_HEIGHT),
 * (3) reward-settlement gas refactors (zero-shares settle skip, claim-path recompute) — same
 * return shapes. 4.0.1 is the shipped fork code; no further churn expected before activation.
 *
 *   bun run monitoring/pox5-bond-ops.ts [contractId]   # print the plan (config only, no account calls)
 */
import type { Invariant } from "./invariant";
import type { SubSpec } from "./sources/trigger-source";
import { ruleKeyFor, ruleKeyForPrint } from "./sub-store";

/** The commit whose topics/fns this config is pinned to (matches reports/pox-5-pre-activation-review.md). */
export const POX5_REVIEW_SHA = "62e03cc5551bfc574223c2b78ce04ceca30cec37"; // tag 4.0.1

/**
 * The genesis holder of BOTH admin roles in shipped 4.0.1 bytes (`bond-admin` L348,
 * `pause-admin` L353) — a real principal, single-sig (SP) format, shipped under the source's own
 * "TODO: this should be set to some predefined multisig" comment. Pass it as `adminKeys` to
 * `pox5BondOpsPlan` for the caller-scoped watch; re-verify at T+0 via the data-var baseline read.
 */
export const POX5_GENESIS_ADMIN = "SP72DMR3MJKS7RVBY33JVV7EEJSQ1PYDVKDP10FX";

/**
 * Boot contractId. pox-5 auto-deploys under the boot principal `SP000000000000000000002Q6VF78`
 * when Bitcoin crosses 960,230 (~2026-07-29/30). NOTE: the contract's admin data-vars do NOT
 * initialize to the boot principal — shipped 4.0.1 inits both to `POX5_GENESIS_ADMIN` (L348/L353).
 * Until activation the monitor is exercised against a caller-supplied FAKE id — do NOT `--apply`
 * against this id before the contract exists.
 */
export const POX5_PLACEHOLDER_CONTRACT_ID = "SP000000000000000000002Q6VF78.pox-5";

/** Watch priority. P1 = the one-way-door / high-signal ops (page-worthy); P2 = full behavioral coverage. */
export type Priority = 1 | 2;

/**
 * All ~20 print topics pox-5 emits (pinned; `grep 'topic: "..."'` over the reviewed source).
 * `priority` follows the sprint brief: P1 = early-exit announce, pause, admin changes, reserve
 * movements (calculate-rewards / bond-distribution carry the reserve-deposit + tranche split).
 */
export const POX5_PRINT_TOPICS: readonly { topic: string; priority: Priority; note: string }[] = [
  {
    topic: "announce-l1-early-exit",
    priority: 1,
    note: "exit intent on a live bond (T-0 leave signal)",
  },
  {
    topic: "pause-rewards",
    priority: 1,
    note: "irreversible reward-claim kill switch (one-way-door #1)",
  },
  { topic: "set-bond-admin", priority: 1, note: "bond-admin key rotation (one-way-door #4)" },
  { topic: "set-pause-admin", priority: 1, note: "pause-admin key rotation (one-way-door #4)" },
  {
    topic: "calculate-rewards",
    priority: 1,
    note: "reserve deposit + T1/T2 tranche split (one-way-door #2/#5)",
  },
  {
    topic: "bond-distribution",
    priority: 1,
    note: "per-bond reward distribution (tranche accounting)",
  },
  { topic: "grant-authorization", priority: 1, note: "authorization grant — privilege change" },
  { topic: "grant-signer-key", priority: 2, note: "signer-key grant" },
  { topic: "revoke-signer-grant", priority: 2, note: "signer-grant revocation" },
  { topic: "setup-bond", priority: 2, note: "new protocol bond created" },
  { topic: "add-to-allowlist", priority: 2, note: "allowlist addition" },
  {
    topic: "register-for-bond",
    priority: 2,
    note: "staker registers for a bond (SPV eligibility proof)",
  },
  { topic: "register-signer", priority: 2, note: "signer registration" },
  { topic: "update-bond-registration", priority: 2, note: "bond registration update" },
  { topic: "stake", priority: 2, note: "sBTC staked into a bond" },
  { topic: "stake-update", priority: 2, note: "stake amount updated" },
  { topic: "unstake", priority: 2, note: "stake removed" },
  { topic: "unstake-sbtc", priority: 2, note: "sBTC withdrawn from a bond" },
  { topic: "claim-rewards", priority: 2, note: "rewards claimed" },
  {
    topic: "claim-staker-rewards-for-signer",
    priority: 2,
    note: "staker rewards claimed via signer",
  },
] as const;

/**
 * Privileged public fns to watch via contract_call (defense-in-depth twin of the print topics — the
 * call fires even on a path that doesn't reach its print). Pinned to `define-public` in the source.
 */
export const POX5_ADMIN_FNS: readonly { fn: string; priority: Priority; note: string }[] = [
  { fn: "pause-rewards", priority: 1, note: "permanent pause — no unpause exists (L487)" },
  { fn: "set-bond-admin", priority: 1, note: "transfer bond-admin role (L451)" },
  { fn: "set-pause-admin", priority: 1, note: "transfer pause-admin role (L470)" },
  { fn: "announce-l1-early-exit", priority: 1, note: "staker announces L1 early exit (L1196)" },
  { fn: "set-burnchain-parameters", priority: 1, note: "burnchain parameter setter" },
] as const;

/**
 * sBTC token pox-5 moves rewards/reserve in (asset id = `<contract>::<token-name>`, from the source's
 * `with-ft 'SM3…sbtc-token "sbtc-token"`). Used by the reserve conservation invariants below.
 */
export const POX5_SBTC_ASSET = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";

/**
 * Conservation invariants — the THIRD lane (see monitoring/invariant.ts). pox-5's reserve draws
 * (`transfer-from-reserve`) and stranded-sweeps (`transfer-stranded-rewards`) are BOTH `define-private`
 * + consensus-invoked: no `contract_call`, no `print`, so the reactive subscriptions above are blind to
 * them. These poll on-chain state and assert a conservation property instead. Evaluated post-activation
 * (reads 404 until the boot contract exists → surfaced as `unreadable`, the honest degraded signal).
 *
 * `Invariant` is imported as a TYPE only (no runtime dep on invariant.ts → no import cycle; invariant.ts
 * dynamically imports THIS module for its CLI registry).
 */
export const POX5_INVARIANTS: readonly Invariant[] = [
  {
    // reserve-balance is incremented in reachable code ONLY (calculate-rewards); the sole decrement is
    // the private/consensus transfer-from-reserve. So any observed DECREASE = a consensus reserve draw
    // occurred — the exact invisible-money-movement event this lane exists to catch. Expected-but-
    // newsworthy → centralization label, not a bug.
    id: "pox5-reserve-monotonic",
    contractId: POX5_PLACEHOLDER_CONTRACT_ID,
    description:
      "reserve-balance is write-only in reachable code; a decrease means a consensus/hard-fork draw",
    kind: "monotonic",
    quantity: "reserveBalance",
    direction: "non-decreasing",
    severity: "high",
    findingClass: "centralization",
    observe: [
      {
        key: "reserveBalance",
        kind: "data-var-uint",
        contractId: POX5_PLACEHOLDER_CONTRACT_ID,
        varName: "reserve-balance",
      },
    ],
  },
  {
    // The contract's actual sBTC holdings must stay ≥ the reserve it claims to hold (holdings also cover
    // unclaimed rewards, so it's a floor, not an equality). A drop BELOW reserve-balance = sBTC left
    // without the ledger decrementing (transfer-stranded-rewards, or an exploit) → bug-tier.
    id: "pox5-sbtc-backing-floor",
    contractId: POX5_PLACEHOLDER_CONTRACT_ID,
    description: "pox-5 sBTC balance must be ≥ reserve-balance (reserve is a subset of holdings)",
    kind: "conservation",
    total: "sbtcBalance",
    parts: ["reserveBalance"],
    tolerance: 0n,
    mode: "floor",
    severity: "critical",
    findingClass: "bug",
    observe: [
      {
        key: "sbtcBalance",
        kind: "read-only-uint",
        contractId: POX5_SBTC_ASSET,
        fn: "get-balance",
        args: [{ principal: POX5_PLACEHOLDER_CONTRACT_ID }],
      },
      {
        key: "reserveBalance",
        kind: "read-only-uint",
        contractId: POX5_PLACEHOLDER_CONTRACT_ID,
        fn: "get-reserve-balance",
        args: [],
      },
    ],
  },
] as const;

/** One planned subscription: the reconcilable `SubSpec` + its deterministic ruleKey + why we watch it. */
export type PlannedSub = {
  ruleKey: string;
  spec: SubSpec;
  label: string;
  priority: Priority;
  rationale: string;
};

export type Pox5PlanOptions = {
  /** Restrict to P1 (page-worthy) subs only — the minimal one-way-door watch. Default: all. */
  priorityOnly?: boolean;
  /**
   * Admin principals to watch across ALL calls to the contract (caller-scoped contract_call, no
   * functionName) — "anything this key touches". Empty by default; pass `POX5_GENESIS_ADMIN`
   * (holds BOTH roles in shipped 4.0.1) and re-verify against the T+0 data-var baseline read.
   */
  adminKeys?: string[];
};

/**
 * The desired subscription set for a pox-5 boot contract. Deterministic + pure (no chain/account
 * calls) — this is the config artifact WS4 ships. Feed the result to the provisioner's `applyPlan`
 * once a real boot `contractId` exists.
 */
export function pox5BondOpsPlan(contractId: string, opts: Pox5PlanOptions = {}): PlannedSub[] {
  const wantP1Only = opts.priorityOnly === true;
  const plan: PlannedSub[] = [];

  // 1) print_event per topic — the primary behavioral watch.
  for (const t of POX5_PRINT_TOPICS) {
    if (wantP1Only && t.priority !== 1) continue;
    plan.push({
      ruleKey: ruleKeyForPrint(contractId, t.topic),
      spec: { kind: "print_event", contractId, topic: t.topic },
      label: `print_event(${contractId}, topic="${t.topic}")`,
      priority: t.priority,
      rationale: t.note,
    });
  }

  // 2) contract_call per privileged fn — fires on the call even if a path skips the print.
  for (const a of POX5_ADMIN_FNS) {
    if (wantP1Only && a.priority !== 1) continue;
    plan.push({
      ruleKey: ruleKeyFor(contractId, a.fn),
      spec: { kind: "contract_call", contractId, functionName: a.fn },
      label: `contract_call(${contractId}, "${a.fn}")`,
      priority: a.priority,
      rationale: a.note,
    });
  }

  // 3) admin-key watch — caller-scoped contract_call (any fn) per supplied key.
  for (const key of opts.adminKeys ?? []) {
    plan.push({
      ruleKey: `${ruleKeyFor(contractId, "admin")}:${key}`,
      spec: { kind: "contract_call", contractId, caller: key } as SubSpec,
      label: `contract_call(${contractId}, caller=${key})`,
      priority: 1,
      rationale: `admin-key watch — any call ${key} makes to the contract`,
    });
  }

  return plan;
}

/** A fixture chain event (the shape the webhook bridge normalizes to) for exercising the plan offline. */
export type FixtureEvent =
  | { type: "print_event"; contractId: string; topic: string }
  | { type: "contract_call"; contractId: string; functionName: string; caller?: string };

/**
 * Which planned subs would fire for a fixture event — the offline "would this monitor catch it?"
 * check the unit tests assert against. Filter semantics mirror the secondlayer chain-trigger matcher:
 * an unset field on the sub is a wildcard; a set field must equal the event's.
 */
export function matchesEvent(plan: PlannedSub[], ev: FixtureEvent): PlannedSub[] {
  return plan.filter(({ spec }) => {
    if (spec.kind === "print_event") {
      return (
        ev.type === "print_event" && spec.contractId === ev.contractId && spec.topic === ev.topic
      );
    }
    if (spec.kind === "contract_call") {
      return (
        ev.type === "contract_call" &&
        spec.contractId === ev.contractId &&
        (spec.functionName === undefined || spec.functionName === ev.functionName) &&
        (spec.caller === undefined || spec.caller === ev.caller)
      );
    }
    return false;
  });
}

// CLI: print the plan for a contractId (config only — no account calls, no deploy).
if (import.meta.main) {
  const contractId = process.argv[2] ?? POX5_PLACEHOLDER_CONTRACT_ID;
  const plan = pox5BondOpsPlan(contractId);
  console.log(
    `[pox5-bond-ops] contractId=${contractId} pinned=${POX5_REVIEW_SHA.slice(0, 7)} subs=${plan.length} ` +
      `(P1=${plan.filter((p) => p.priority === 1).length})`,
  );
  for (const p of plan)
    console.log(`  P${p.priority} ${p.ruleKey}\n       ${p.label} — ${p.rationale}`);
  console.log(
    "\n  (config only — feed to the provisioner's applyPlan once a real boot contractId exists)",
  );
}
