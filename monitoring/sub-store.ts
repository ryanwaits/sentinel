/**
 * Durable subscription store — the reconciler's source of record for live secondlayer
 * chain subscriptions.
 *
 * Maps a deterministic `ruleKey` (`sentinel:<contractId>:<fn>`, also the subscription `name`)
 * → the secondlayer subscription id + its signing secret (surfaced ONCE at create, so we MUST
 * persist it here) + provenance. The provisioner writes it; the bridge reads it to resolve the
 * per-subscription signing secret by the `ruleKey` carried in the webhook URL path.
 *
 * MVP state = one JSON file under SENTINEL_SINK_DIR (default `.sentinel/`, gitignored), same seam
 * as monitoring/spend-ceiling.ts. ⚠️ Vercel FS is ephemeral → swap for an external KV (Vercel KV /
 * Upstash) in prod; this module is the seam where that happens. Secrets live here, so the file
 * stays gitignored.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const STATE_DIR = process.env.SENTINEL_SINK_DIR ?? join(process.cwd(), ".sentinel");
const STATE_PATH = join(STATE_DIR, "subscriptions.json");

/** Subscription prefix for `name`/`ruleKey` — scopes every Sentinel-owned sub on the account. */
export const NAME_PREFIX = "sentinel:";

/** Deterministic key for one watched (contract, fn) pair — used as the sub `name` AND URL path. */
export function ruleKeyFor(contractId: string, fn: string): string {
  return `${NAME_PREFIX}${contractId}:${fn}`;
}

/** Key for an asset-outflow watch (one transfer sub per contract+asset, not per fn). Same
 *  `sentinel:<contract>:` prefix so offboard/scoping still catches it. */
export function ruleKeyForOutflow(contractId: string, asset: string): string {
  return `${NAME_PREFIX}${contractId}:outflow:${asset}`;
}

/** Key for a print-topic watch (one sub per contract+topic). Same `sentinel:<contract>:`
 *  prefix — the `print:` segment keeps it disjoint from a same-named fn's contract_call key. */
export function ruleKeyForPrint(contractId: string, topic: string): string {
  return `${NAME_PREFIX}${contractId}:print:${topic}`;
}

/** One persisted subscription. `signingSecret` is a bare 64-char hex (Standard Webhooks). */
export type SubRecord = {
  ruleKey: string;
  subId: string;
  signingSecret: string;
  contractId: string;
  fn: string;
  triggerClass: string;
  url: string;
};

type Store = Record<string, SubRecord>;

function load(): Store {
  if (!existsSync(STATE_PATH)) return {};
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as Store;
}

function save(store: Store): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

/** Resolve a persisted subscription by its ruleKey (bridge: secret lookup), or null. */
export function getByRuleKey(ruleKey: string): SubRecord | null {
  return load()[ruleKey] ?? null;
}

/** All persisted subscriptions. */
export function listRecords(): SubRecord[] {
  return Object.values(load());
}

/** Upsert a subscription record (provisioner: after create/update). */
export function putRecord(rec: SubRecord): void {
  const store = load();
  store[rec.ruleKey] = rec;
  save(store);
}

/** Drop a subscription record (provisioner: after delete/offboard). */
export function deleteRecord(ruleKey: string): void {
  const store = load();
  delete store[ruleKey];
  save(store);
}
