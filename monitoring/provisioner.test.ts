/**
 * Provisioner mapping tests — sensitive fn → subscription kind/ruleKey. The SUBSCRIPTION kind keys on
 * triggerClass (NOT the Type-1/Type-2 response route): transfer.outflow → asset-outflow sub (watch the
 * asset leaving the contract); everything else → contract_call. Pure: only needs BRIDGE_BASE_URL.
 */
process.env.BRIDGE_BASE_URL = "https://bridge.test";

import { describe, expect, test } from "bun:test";
import type { SensitiveFn } from "./config";
import { desiredForFn } from "./provisioner";

const C = "SP.x.vault";

describe("desiredForFn — subscription kind by trigger class", () => {
  test("transfer.outflow + stx threshold → stx_outflow sub (sender = contract), per-asset ruleKey", () => {
    const fn: SensitiveFn = {
      name: "withdraw-stx",
      triggerClass: "transfer.outflow",
      callerAllowlist: [],
      suggestedOutflowThreshold: { asset: "stx", amount: "1000000" },
    };
    const d = desiredForFn(C, fn);
    expect(d.spec).toEqual({ kind: "stx_outflow", sender: C });
    expect(d.ruleKey).toBe("sentinel:SP.x.vault:outflow:stx");
    expect(d.fn).toBe("outflow:stx");
  });

  test("transfer.outflow + ft (live threshold wins) → ft_outflow sub scoped to the asset", () => {
    const fn: SensitiveFn = {
      name: "withdraw-ft",
      triggerClass: "transfer.outflow",
      callerAllowlist: [],
      outflowThreshold: { asset: "SP.t::tok", amount: "5" },
      suggestedOutflowThreshold: { asset: "stx", amount: "1" },
    };
    const d = desiredForFn(C, fn);
    expect(d.spec).toEqual({ kind: "ft_outflow", sender: C, assetIdentifier: "SP.t::tok" });
    expect(d.ruleKey).toBe("sentinel:SP.x.vault:outflow:SP.t::tok");
  });

  test("governance.proposal_submitted → contract_call sub on the function", () => {
    const fn: SensitiveFn = {
      name: "execute",
      triggerClass: "governance.proposal_submitted",
      callerAllowlist: [],
    };
    const d = desiredForFn(C, fn);
    expect(d.spec).toEqual({ kind: "contract_call", contractId: C, functionName: "execute" });
    expect(d.ruleKey).toBe("sentinel:SP.x.vault:execute");
  });

  test("counterparty.new is Type-2 but still subscribes via contract_call (NOT a transfer sub)", () => {
    const fn: SensitiveFn = {
      name: "register",
      triggerClass: "counterparty.new",
      callerAllowlist: [],
    };
    const d = desiredForFn(C, fn);
    expect(d.spec.kind).toBe("contract_call");
  });
});
