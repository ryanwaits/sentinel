/**
 * Network model — the dev-lifecycle axis (devnet → testnet → mainnet).
 *
 * Network is DERIVED from the contract address via `@secondlayer/stacks` (SP/SM = mainnet, ST/SN =
 * testnet) — never a hand-kept field that can drift from the address. Devnet shares testnet's address
 * space, so it is NEVER inferred; it's an explicit target reached by a local devnet node URL.
 *
 * The node URL per network is deployment config (no package provides it): `STACKS_NODE_URL` is the
 * mainnet default (back-compat with the single-node setup); `STACKS_NODE_URL_TESTNET` /
 * `STACKS_NODE_URL_DEVNET` point at the other chains. Unconfigured → undefined (an honest null read,
 * per the credibility rules — never a silent fallback to the wrong chain).
 */
import {
  AddressVersion,
  addressToVersion,
  isClarityName,
  parseContractId,
  validateStacksAddress,
} from "@secondlayer/stacks/utils";
import { z } from "zod";

export const Network = z.enum(["mainnet", "testnet", "devnet"]);
export type Network = z.infer<typeof Network>;

const MAINNET_VERSIONS = new Set<number>([
  AddressVersion.MainnetSingleSig,
  AddressVersion.MainnetMultiSig,
]);

/**
 * The address-derived network of a contract — mainnet | testnet — via `@secondlayer/stacks`
 * (`addressToVersion`), NOT a stored field. Devnet is never returned here (it is address-indistinct
 * from testnet); pass `network: "devnet"` explicitly where a local devnet node is meant.
 */
export function networkOf(contractId: string): "mainnet" | "testnet" {
  const [address] = parseContractId(contractId);
  return MAINNET_VERSIONS.has(addressToVersion(address)) ? "mainnet" : "testnet";
}

/**
 * Resolve the Stacks node URL for a network from env. Mainnet falls back to `STACKS_NODE_URL` (the
 * existing single-node var); testnet/devnet use `STACKS_NODE_URL_{TESTNET,DEVNET}`. Returns undefined
 * when unconfigured — callers surface that as a null read, never a wrong-chain fallback.
 */
export function resolveNodeUrl(network: Network): string | undefined {
  const explicit = process.env[`STACKS_NODE_URL_${network.toUpperCase()}`];
  if (explicit) return explicit;
  return network === "mainnet" ? process.env.STACKS_NODE_URL : undefined;
}

/**
 * Real c32-checksum validation of an `address.contract-name` via `@secondlayer/stacks` — validates the
 * actual address checksum + Clarity name, not a prefix/length regex. The backend's ingress guard.
 */
export function isValidContractId(id: string): boolean {
  try {
    const [address, name] = parseContractId(id.trim());
    return validateStacksAddress(address) && isClarityName(name);
  } catch {
    return false;
  }
}
