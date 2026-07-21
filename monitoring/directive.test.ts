/**
 * Directive builder tests — tier routing + audit_targets[] + [SENTINEL-TRIGGER] shape. Pure: no
 * STACKS_NODE_URL is set in test, so the live closure walk is skipped (proposal + watched + KB
 * closure only) — exactly the graceful-degradation path.
 */
import { describe, expect, test } from "bun:test";
import { Cl } from "@secondlayer/stacks/clarity";
import type { MonitoringConfig, SensitiveFn } from "./config";
import { buildAuditTargets, buildDirective, tierFor } from "./directive";
import type { ChainEventBody, PrefilterVerdict } from "./prefilter";

const ADDR = "SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH";
const TREASURY = `${ADDR}.ccd002-treasury`;
const DAO = `${ADDR}.base-dao`;
const PROPOSAL = `${ADDR}.evil-proposal`;

const treasuryConfig: MonitoringConfig = {
  client: "test",
  contractId: TREASURY,
  network: "mainnet",
  archetype: "treasury",
  tier: "deep",
  sensitiveFns: [],
  signatures: [],
  outflowBaselines: [],
  waivers: [],
  closure: [DAO],
  route: "default",
  baselineAudited: true,
};

const ammConfig: MonitoringConfig = {
  ...treasuryConfig,
  contractId: `${ADDR}.amm`,
  archetype: "amm",
  tier: "monitor",
  closure: [],
};

const execute: SensitiveFn = {
  name: "execute",
  triggerClass: "governance.proposal_submitted",
  callerAllowlist: [DAO],
};
const swap: SensitiveFn = { name: "swap", triggerClass: "counterparty.new", callerAllowlist: [] };

describe("tierFor — stricter of class and contract tier", () => {
  test("governance always deep", () => {
    expect(tierFor("governance.proposal_submitted", "monitor")).toBe("deep");
  });
  test("transfer/counterparty on a deep contract stays deep", () => {
    expect(tierFor("counterparty.new", "deep")).toBe("deep");
  });
  test("counterparty on a monitor contract is monitor", () => {
    expect(tierFor("counterparty.new", "monitor")).toBe("monitor");
  });
});

describe("buildAuditTargets", () => {
  test("governance: decoded proposal is first, watched + KB closure unioned", async () => {
    const ev: ChainEventBody = {
      function_args: [Cl.serialize(Cl.contractPrincipal(ADDR, "evil-proposal"))],
    };
    const { targets, proposal } = await buildAuditTargets(treasuryConfig, execute, ev);
    expect(proposal).toBe(PROPOSAL);
    expect(targets[0]).toBe(PROPOSAL); // proposal subject first
    expect(targets).toContain(TREASURY);
    expect(targets).toContain(DAO);
    expect(new Set(targets).size).toBe(targets.length); // no dupes
  });

  test("non-governance: just the watched contract + closure, no proposal", async () => {
    const { targets, proposal } = await buildAuditTargets(ammConfig, swap, { sender: "SPx" });
    expect(proposal).toBeNull();
    expect(targets).toEqual([`${ADDR}.amm`]);
  });
});

describe("buildDirective", () => {
  const verdict: PrefilterVerdict = {
    notable: true,
    suspicious: true,
    amount: null,
    reason: "test",
  };

  test("emits a parseable [SENTINEL-TRIGGER] block with deep tier + proposal target", async () => {
    const ev: ChainEventBody = {
      sender: "SPattacker",
      function_args: [Cl.serialize(Cl.contractPrincipal(ADDR, "evil-proposal"))],
    };
    const { message, directive, tier } = await buildDirective(
      treasuryConfig,
      execute,
      ev,
      verdict,
      { txId: "0xtx", blockHeight: 100 },
    );

    expect(tier).toBe("deep");
    expect(directive.proposal_target).toBe(PROPOSAL);
    expect(directive.audit_targets[0]).toBe(PROPOSAL);
    expect(directive.suspicious).toBe(true);
    expect(directive.tx_id).toBe("0xtx");

    const open = message.indexOf("[SENTINEL-TRIGGER]");
    const close = message.indexOf("[/SENTINEL-TRIGGER]");
    expect(open).toBeGreaterThanOrEqual(0);
    expect(close).toBeGreaterThan(open);
    const json = message.slice(open + "[SENTINEL-TRIGGER]".length, close).trim();
    expect(JSON.parse(json).contract_id).toBe(TREASURY);
  });
});
