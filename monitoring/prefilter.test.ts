/**
 * Pre-filter table tests — the "no spend on benign" gate, per trigger class. Pure, no chain/spend.
 */
import { describe, expect, test } from "bun:test";
import { Cl } from "@secondlayer/stacks/clarity";
import type { SensitiveFn } from "./config";
import {
  type ChainEventBody,
  classify,
  decodeArgs,
  firstContractPrincipal,
  firstUint,
} from "./prefilter";

const DAO = "SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.base-dao";
const ATTACKER = "SP000000000000000000002Q6VF78.attacker";
const PROPOSAL = "SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.evil-proposal";

/** Encode Clarity values to the hex `function_args` arrive as. */
function args(...cvs: Parameters<typeof Cl.serialize>[0][]): string[] {
  return cvs.map((cv) => Cl.serialize(cv));
}

describe("arg decoding", () => {
  test("decodes a contract principal + a uint", () => {
    const decoded = decodeArgs(
      args(
        Cl.contractPrincipal("SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH", "evil-proposal"),
        Cl.uint(42n),
      ),
    );
    expect(firstContractPrincipal(decoded)).toBe(PROPOSAL);
    expect(firstUint(decoded)).toBe(42n);
  });

  test("garbage arg never throws and yields no false principal/uint", () => {
    const decoded = decodeArgs(["nothex", "zzz"]);
    expect(decoded).toHaveLength(2);
    expect(firstContractPrincipal(decoded)).toBeNull();
    expect(firstUint(decoded)).toBeNull();
  });
});

describe("governance.* — always notable", () => {
  const execute: SensitiveFn = {
    name: "execute",
    triggerClass: "governance.proposal_submitted",
    callerAllowlist: [DAO],
  };

  test("authorized caller (DAO) — notable, not suspicious", () => {
    const ev: ChainEventBody = {
      function_name: "execute",
      sender: DAO,
      function_args: args(
        Cl.contractPrincipal("SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH", "evil-proposal"),
      ),
    };
    const v = classify(execute, ev);
    expect(v.notable).toBe(true);
    expect(v.suspicious).toBe(false);
  });

  test("caller outside allowlist — notable AND suspicious", () => {
    const ev: ChainEventBody = { function_name: "execute", sender: ATTACKER, function_args: [] };
    const v = classify(execute, ev);
    expect(v.notable).toBe(true);
    expect(v.suspicious).toBe(true);
  });
});

describe("transfer.outflow — threshold gate", () => {
  const withdrawStx: SensitiveFn = {
    name: "withdraw-stx",
    triggerClass: "transfer.outflow",
    callerAllowlist: [],
    outflowThreshold: { asset: "stx", amount: "1000000000000" },
  };
  const withdrawFt: SensitiveFn = {
    name: "withdraw-ft",
    triggerClass: "transfer.outflow",
    callerAllowlist: [],
  };

  test("below threshold — benign", () => {
    const ev: ChainEventBody = { sender: DAO, function_args: args(Cl.uint(999_999_999_999n)) };
    const v = classify(withdrawStx, ev);
    expect(v.notable).toBe(false);
    expect(v.amount).toBe(999_999_999_999n);
  });

  test("at/above threshold — notable", () => {
    const ev: ChainEventBody = { sender: DAO, function_args: args(Cl.uint(1_000_000_000_000n)) };
    expect(classify(withdrawStx, ev).notable).toBe(true);
  });

  test("no threshold configured — fail-safe notable", () => {
    const ev: ChainEventBody = { sender: DAO, function_args: args(Cl.uint(1n)) };
    expect(classify(withdrawFt, ev).notable).toBe(true);
  });

  test("undecodable amount — fail-safe notable", () => {
    const ev: ChainEventBody = { sender: DAO, function_args: ["nothex"] };
    expect(classify(withdrawStx, ev).notable).toBe(true);
  });
});

describe("counterparty.new — known-vs-new", () => {
  const swap: SensitiveFn = {
    name: "swap",
    triggerClass: "counterparty.new",
    callerAllowlist: [DAO],
  };

  test("known counterparty — benign", () => {
    expect(classify(swap, { sender: DAO }).notable).toBe(false);
  });

  test("new/unknown counterparty — notable", () => {
    expect(classify(swap, { sender: ATTACKER }).notable).toBe(true);
  });
});
