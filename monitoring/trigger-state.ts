/**
 * Trigger state — durable dedup, debounce, and the trigger→session ledger (M3).
 *
 * Three jobs, all on the `.sentinel/` seam (swap for external KV in prod, like the rest of the
 * durable state — Vercel FS is ephemeral):
 *  - EVENT DEDUP: an event is keyed by `(tx_id, contract_id, function_name)`. A re-delivery or
 *    replay of the same event must not fire a second audit. Marked only AFTER a successful
 *    dispatch (a failed dispatch stays un-marked so the server's retry can re-drive it).
 *  - DEBOUNCE: at most one dispatch per `(contract_id, function_name)` per window — a flood of
 *    cheap calls on the same fn can't fan out into many budgeted sweeps.
 *  - LEDGER: each dispatch records {sessionId → trigger metadata}. M4 reads this alongside
 *    `readRun(sessionId)` to adjudicate (severity/class/PoC) and route an alert.
 *
 * Time uses `Date.now()` — fine here (plain Bun/Node module, not a Workflow script).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Tier } from "./spend-ceiling";

const STATE_DIR = process.env.SENTINEL_SINK_DIR ?? join(process.cwd(), ".sentinel");
const STATE_PATH = join(STATE_DIR, "triggers.json");

/** How long an event dedup key is retained (covers server retry/backoff up to 72h, capped). */
const DEDUP_TTL_MS = Number(process.env.SENTINEL_DEDUP_TTL_MS ?? 24 * 60 * 60 * 1000);
/** Min gap between dispatches on the same (contract, fn). */
export const DEBOUNCE_MS = Number(process.env.SENTINEL_DEBOUNCE_MS ?? 10 * 60 * 1000);

/** Trigger metadata persisted per dispatched audit — M4's adjudication input. */
export type TriggerRecord = {
  sessionId: string;
  contractId: string;
  fn: string;
  triggerClass: string;
  tier: Tier;
  txId?: string;
  blockHeight?: number;
  deadlineBlock?: number | null;
  auditTargets: string[];
  suspicious: boolean;
  dispatchedAt: string;
};

type State = {
  /** dedupKey → epoch ms first seen. */
  seen: Record<string, number>;
  /** `${contractId}:${fn}` → epoch ms of last dispatch. */
  debounce: Record<string, number>;
  /** sessionId → record. */
  records: Record<string, TriggerRecord>;
};

function emptyState(): State {
  return { seen: {}, debounce: {}, records: {} };
}

function load(): State {
  if (!existsSync(STATE_PATH)) return emptyState();
  try {
    return { ...emptyState(), ...(JSON.parse(readFileSync(STATE_PATH, "utf8")) as State) };
  } catch {
    return emptyState();
  }
}

function save(state: State): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

/** Prune expired dedup keys (called on every write to keep the file bounded). */
function pruneSeen(state: State, now: number): void {
  for (const [k, ts] of Object.entries(state.seen)) {
    if (now - ts > DEDUP_TTL_MS) delete state.seen[k];
  }
}

/** Event identity for dedup: the same on-chain event always yields the same key. */
export function dedupKey(txId: string | undefined, contractId: string, fn: string): string {
  return `${txId ?? "no-tx"}:${contractId}:${fn}`;
}

/** Has this exact event already been processed (within the dedup TTL)? Does NOT mark. */
export function isDuplicate(key: string): boolean {
  const state = load();
  const ts = state.seen[key];
  return ts !== undefined && Date.now() - ts <= DEDUP_TTL_MS;
}

/** Is (contract, fn) inside its debounce window? Returns the elapsed ms if blocked. */
export function inDebounce(
  contractId: string,
  fn: string,
): { blocked: boolean; elapsedMs?: number } {
  const state = load();
  const last = state.debounce[`${contractId}:${fn}`];
  if (last === undefined) return { blocked: false };
  const elapsedMs = Date.now() - last;
  return { blocked: elapsedMs < DEBOUNCE_MS, elapsedMs };
}

/**
 * Commit a successful dispatch: mark the event seen, stamp the debounce window, and record the
 * trigger→session metadata. One write; call only after eve accepted the dispatch.
 */
export function commitDispatch(key: string, record: TriggerRecord): void {
  const state = load();
  const now = Date.now();
  state.seen[key] = now;
  state.debounce[`${record.contractId}:${record.fn}`] = now;
  state.records[record.sessionId] = record;
  pruneSeen(state, now);
  save(state);
}

/** A trigger record by eve session id (M4). */
export function getRecord(sessionId: string): TriggerRecord | null {
  return load().records[sessionId] ?? null;
}

/** All trigger records (M4: find un-adjudicated sessions). */
export function listRecords(): TriggerRecord[] {
  return Object.values(load().records);
}
