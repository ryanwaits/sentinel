/**
 * PoX-5 bond-ops monitor config — exercised against a FAKE contractId + fixture events (no live
 * deploy). Asserts: the plan covers every one-way-door topic/fn, keys are disjoint + scoped, and
 * fixture print_event / contract_call events match the intended subs. Pure (ruleKey helpers only).
 */
import { describe, expect, test } from "bun:test";
import {
  type FixtureEvent,
  matchesEvent,
  POX5_ADMIN_FNS,
  POX5_PRINT_TOPICS,
  pox5BondOpsPlan,
} from "./pox5-bond-ops";

// A deliberately FAKE boot id — pox-5 isn't deployed; the monitor is config-only until testnet.
const FAKE = "SP000000000000000000002Q6VF78.pox-5-fake-devnet";

describe("pox5BondOpsPlan — desired subscription set", () => {
  test("full plan = one print_event per topic + one contract_call per admin fn", () => {
    const plan = pox5BondOpsPlan(FAKE);
    expect(plan.length).toBe(POX5_PRINT_TOPICS.length + POX5_ADMIN_FNS.length);
    expect(plan.filter((p) => p.spec.kind === "print_event").length).toBe(POX5_PRINT_TOPICS.length);
    expect(plan.filter((p) => p.spec.kind === "contract_call").length).toBe(POX5_ADMIN_FNS.length);
  });

  test("every ruleKey is unique and scoped to the contract's sentinel prefix", () => {
    const plan = pox5BondOpsPlan(FAKE);
    const keys = plan.map((p) => p.ruleKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k.startsWith(`sentinel:${FAKE}:`)).toBe(true);
  });

  test("print-topic and contract_call keys are disjoint even for same-named actions (pause-rewards)", () => {
    const plan = pox5BondOpsPlan(FAKE);
    const printKey = plan.find(
      (p) => p.spec.kind === "print_event" && p.spec.topic === "pause-rewards",
    )?.ruleKey;
    const callKey = plan.find(
      (p) => p.spec.kind === "contract_call" && p.spec.functionName === "pause-rewards",
    )?.ruleKey;
    expect(printKey).toBe(`sentinel:${FAKE}:print:pause-rewards`);
    expect(callKey).toBe(`sentinel:${FAKE}:pause-rewards`);
    expect(printKey).not.toBe(callKey);
  });

  test("priorityOnly narrows to P1 (one-way-door) subs only", () => {
    const all = pox5BondOpsPlan(FAKE);
    const p1 = pox5BondOpsPlan(FAKE, { priorityOnly: true });
    expect(p1.length).toBeLessThan(all.length);
    expect(p1.every((p) => p.priority === 1)).toBe(true);
    // The brief's page-worthy set must survive the narrowing.
    const p1Topics = p1.filter((p) => p.spec.kind === "print_event").map((p) => p.rationale);
    for (const topic of [
      "pause-rewards",
      "announce-l1-early-exit",
      "set-bond-admin",
      "set-pause-admin",
    ]) {
      expect(p1.some((p) => p.spec.kind === "print_event" && p.spec.topic === topic)).toBe(true);
    }
    void p1Topics;
  });

  test("adminKeys add a caller-scoped contract_call watch per key", () => {
    const key = "SP2ADMIN000000000000000000000000000000ABC";
    const plan = pox5BondOpsPlan(FAKE, { adminKeys: [key] });
    const watch = plan.find(
      (p) =>
        p.spec.kind === "contract_call" &&
        p.spec.caller === key &&
        p.spec.functionName === undefined,
    );
    expect(watch).toBeDefined();
    expect(watch?.priority).toBe(1);
  });

  test("all 20 reviewed print topics + 5 admin fns are present (pinned to the reviewed source)", () => {
    const plan = pox5BondOpsPlan(FAKE);
    for (const { topic } of POX5_PRINT_TOPICS) {
      expect(plan.some((p) => p.spec.kind === "print_event" && p.spec.topic === topic)).toBe(true);
    }
    for (const { fn } of POX5_ADMIN_FNS) {
      expect(plan.some((p) => p.spec.kind === "contract_call" && p.spec.functionName === fn)).toBe(
        true,
      );
    }
  });
});

describe("matchesEvent — fixture events fire the intended subs", () => {
  const plan = pox5BondOpsPlan(FAKE, { adminKeys: ["SP2ADMINKEY00000000000000000000000000DEAD"] });

  test("a pause-rewards print fixture matches exactly the pause-rewards print sub", () => {
    const ev: FixtureEvent = { type: "print_event", contractId: FAKE, topic: "pause-rewards" };
    const hits = matchesEvent(plan, ev);
    expect(hits.length).toBe(1);
    expect(hits[0]?.spec.kind).toBe("print_event");
    expect(hits[0]?.ruleKey).toBe(`sentinel:${FAKE}:print:pause-rewards`);
  });

  test("an announce-l1-early-exit call by an arbitrary staker matches the fn sub (caller wildcard)", () => {
    const ev: FixtureEvent = {
      type: "contract_call",
      contractId: FAKE,
      functionName: "announce-l1-early-exit",
      caller: "SP3RANDOMSTAKER0000000000000000000000BEEF",
    };
    const hits = matchesEvent(plan, ev);
    expect(
      hits.some(
        (h) => h.spec.kind === "contract_call" && h.spec.functionName === "announce-l1-early-exit",
      ),
    ).toBe(true);
  });

  test("a set-bond-admin call by the watched admin key matches BOTH the fn sub and the admin-key watch", () => {
    const ev: FixtureEvent = {
      type: "contract_call",
      contractId: FAKE,
      functionName: "set-bond-admin",
      caller: "SP2ADMINKEY00000000000000000000000000DEAD",
    };
    const hits = matchesEvent(plan, ev);
    const kinds = hits.map((h) => h.spec).filter((s) => s.kind === "contract_call");
    // one keyed on functionName, one keyed on caller-only
    expect(
      hits.some((h) => h.spec.kind === "contract_call" && h.spec.functionName === "set-bond-admin"),
    ).toBe(true);
    expect(
      hits.some(
        (h) =>
          h.spec.kind === "contract_call" &&
          h.spec.functionName === undefined &&
          h.spec.caller === "SP2ADMINKEY00000000000000000000000000DEAD",
      ),
    ).toBe(true);
    expect(kinds.length).toBe(2);
  });

  test("an event on a DIFFERENT contract never matches (contract-scoped)", () => {
    const ev: FixtureEvent = {
      type: "print_event",
      contractId: "SP.other.contract",
      topic: "pause-rewards",
    };
    expect(matchesEvent(plan, ev)).toEqual([]);
  });

  test("a print topic the contract never emits does not match (no phantom coverage)", () => {
    const ev: FixtureEvent = { type: "print_event", contractId: FAKE, topic: "self-destruct" };
    expect(matchesEvent(plan, ev)).toEqual([]);
  });

  test("a non-privileged fn call matches nothing (we only watch the admin/exit fns via contract_call)", () => {
    const ev: FixtureEvent = {
      type: "contract_call",
      contractId: FAKE,
      functionName: "stake",
      caller: "SP4LP0000000000000000000000000000000CAFE",
    };
    // no admin-fn sub, and the caller isn't a watched admin key
    expect(matchesEvent(plan, ev)).toEqual([]);
  });
});
