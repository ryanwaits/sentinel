/**
 * Contract source reader — fetch a Clarity contract's source for the audit engine + the monitoring
 * bridge (closure resolution on a trigger).
 *
 * Two source paths, checked in order, BOTH explicit (no silent third-party default):
 *  1. LOCAL (opt-in) — `SENTINEL_LOCAL_SOURCES` points at a JSON registry mapping a `contractId` to a
 *     local `.clar` file. This is how PRE-DEPLOYMENT / not-yet-forked code is audited (e.g. pox-5.clar
 *     off a stacks-core branch, or a client's LST contracts before they ship). Result carries
 *     `origin: "local"` + the pinned `ref` so the audit + report know these are local bytes, NOT a
 *     chain-confirmed deployment.
 *  2. NODE — the network's Stacks node (`/v2/contracts/source`), resolved per-network by
 *     `resolveNodeUrl` (network.ts): mainnet → `STACKS_NODE_URL`, testnet/devnet → their own env. In
 *     prod that should be the secondlayer-operated node; Hiro is only an explicit spike fallback.
 *     secondlayer has no contract-source API yet (source is deferred off the Index), so node RPC IS
 *     the secondlayer path. Network is DERIVED from the address via `@secondlayer/stacks` (`networkOf`).
 *
 * If neither path resolves the id, reads return null — no silent stub, per the credibility rules.
 */

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { parseContractId } from "@secondlayer/stacks/utils";
import { type Network, networkOf, resolveNodeUrl } from "./network";

/** Provenance of a source read — the report/method section MUST distinguish these. */
export type SourceOrigin = "node" | "local";

export type SourceResult = {
  contractId: string;
  /** Chain publish height for a node read; -1 for a local (pre-deployment) read. */
  publishHeight: number;
  lineCount: number;
  source: string;
  /** Where the bytes came from. `local` = not chain-confirmed. */
  origin: SourceOrigin;
  /** Pinned reference for a local read (e.g. the reviewed commit SHA), when the registry provides it. */
  ref?: string;
};

/** One local-source registry entry. A bare string is shorthand for `{ path }`. */
type LocalEntry = { path: string; ref?: string };
type LocalRegistry = Record<string, string | LocalEntry>;

/** Parsed-registry cache keyed by the registry file path (avoids re-reading per contract in a closure). */
const registryCache = new Map<string, LocalRegistry | null>();

/** Load + cache the local-source registry named by `SENTINEL_LOCAL_SOURCES`, or null if unset/unreadable. */
function loadLocalRegistry(): LocalRegistry | null {
  const registryPath = process.env.SENTINEL_LOCAL_SOURCES;
  if (!registryPath) return null;
  if (registryCache.has(registryPath)) return registryCache.get(registryPath) ?? null;
  let parsed: LocalRegistry | null = null;
  try {
    parsed = JSON.parse(readFileSync(registryPath, "utf8")) as LocalRegistry;
  } catch {
    parsed = null; // unreadable/malformed registry → fall through to node, never throw the audit
  }
  registryCache.set(registryPath, parsed);
  return parsed;
}

/** Resolve a contractId to a local .clar read via the registry, or null if not registered / missing. */
function fetchLocalById(contractId: string): SourceResult | null {
  const registry = loadLocalRegistry();
  const entry = registry?.[contractId];
  if (!entry) return null;
  const { path, ref } = typeof entry === "string" ? { path: entry, ref: undefined } : entry;
  // Resolve relative paths against the registry file's location? No — against cwd, and require it to
  // exist. A registered-but-missing file is a hard signal (typo'd path), so we surface null, not a stub.
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  if (!existsSync(abs)) return null;
  const source = readFileSync(abs, "utf8");
  return {
    contractId,
    publishHeight: -1,
    lineCount: source.split("\n").length,
    source,
    origin: "local",
    ref,
  };
}

/** Fetch one contract's source off the network's node, or null. */
async function fetchNodeById(contractId: string, network: Network): Promise<SourceResult | null> {
  const nodeUrl = resolveNodeUrl(network);
  if (!nodeUrl) return null;
  let address: string;
  let contractName: string;
  try {
    [address, contractName] = parseContractId(contractId);
  } catch {
    return null; // not a valid address.contract-name
  }
  const res = await fetch(`${nodeUrl}/v2/contracts/source/${address}/${contractName}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { source: string; publish_height: number };
  return {
    contractId,
    publishHeight: data.publish_height,
    lineCount: data.source.split("\n").length,
    source: data.source,
    origin: "node",
  };
}

/**
 * Fetch one contract's source. Local registry (explicit pre-deployment opt-in) wins over node RPC;
 * returns null if neither path resolves the id. `network` defaults to the address-derived network
 * (`networkOf`) — pass it explicitly only for a devnet deployment (address-indistinct from testnet).
 */
export async function fetchSourceById(
  contractId: string,
  network?: Network,
): Promise<SourceResult | null> {
  const local = fetchLocalById(contractId);
  if (local) return local;
  let net = network;
  if (!net) {
    try {
      net = networkOf(contractId); // derive from the address; invalid id → null read
    } catch {
      return null;
    }
  }
  return fetchNodeById(contractId, net);
}

/** True when ANY source-read surface is configured for the network (a local registry OR a node URL). */
export function sourceReadEnabled(network: Network = "mainnet"): boolean {
  return Boolean(process.env.SENTINEL_LOCAL_SOURCES) || Boolean(resolveNodeUrl(network));
}
