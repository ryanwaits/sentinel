/**
 * network model — address-derived network (via @secondlayer/stacks) + per-network node URL resolution.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { networkOf, resolveNodeUrl } from "./network";

describe("networkOf (derived from the address, not a stored field)", () => {
  test("mainnet single-sig (SP) and multi-sig (SM)", () => {
    expect(networkOf("SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc")).toBe("mainnet");
    expect(networkOf("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token")).toBe("mainnet");
    expect(networkOf("SP000000000000000000002Q6VF78.pox-5")).toBe("mainnet"); // boot address
  });

  test("testnet single-sig (ST)", () => {
    expect(networkOf("ST000000000000000000002AMW42H.pox-5")).toBe("testnet");
    expect(networkOf("ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.thing")).toBe("testnet");
  });

  test("an invalid id throws (caller surfaces a null read)", () => {
    expect(() => networkOf("not-a-contract")).toThrow();
  });
});

describe("resolveNodeUrl (deployment env, per network)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  test("mainnet falls back to STACKS_NODE_URL (the existing single-node var)", () => {
    process.env.STACKS_NODE_URL = "http://main.example";
    delete process.env.STACKS_NODE_URL_MAINNET;
    expect(resolveNodeUrl("mainnet")).toBe("http://main.example");
  });

  test("an explicit per-network var wins over the fallback", () => {
    process.env.STACKS_NODE_URL = "http://main.example";
    process.env.STACKS_NODE_URL_MAINNET = "http://main-explicit.example";
    process.env.STACKS_NODE_URL_TESTNET = "http://test.example";
    expect(resolveNodeUrl("mainnet")).toBe("http://main-explicit.example");
    expect(resolveNodeUrl("testnet")).toBe("http://test.example");
  });

  test("unconfigured network → undefined (honest null, never a wrong-chain fallback)", () => {
    delete process.env.STACKS_NODE_URL_TESTNET;
    delete process.env.STACKS_NODE_URL_DEVNET;
    expect(resolveNodeUrl("testnet")).toBeUndefined();
    expect(resolveNodeUrl("devnet")).toBeUndefined();
  });
});
