/**
 * Credibility-gate tests — the structural enforcement of verify + PoC. Pure function, no chain/model:
 * every branch (unverified downgrade, verifier-present pass-through, introspection-gap benefit-of-doubt,
 * PoC-attempt coercion, ordering) is exercised deterministically.
 */
import { describe, expect, test } from "bun:test";
import type { Finding } from "../monitoring/adjudication";
import { enforceGates, verifierRan } from "./gates";

const f = (over: Partial<Finding> = {}): Finding => ({
  title: "finding",
  severity: "high",
  class: "bug",
  verifierVerdict: "confirmed",
  pocStatus: "green",
  origin: "audit",
  ...over,
});

const ev = (
  subagentTasks: number,
  types: string[] = [],
): { subagentTasks: number; subagentTypes: Set<string> } => ({
  subagentTasks,
  subagentTypes: new Set(types),
});

describe("verifierRan", () => {
  test("no delegation → not verified", () => {
    expect(verifierRan(ev(0))).toBe(false);
  });
  test("delegated, verifier among the subagents → verified", () => {
    expect(verifierRan(ev(3, ["auditor-access-control", "verifier"]))).toBe(true);
  });
  test("delegated, verifier demonstrably absent → not verified", () => {
    expect(verifierRan(ev(2, ["auditor-access-control", "auditor-reentrancy"]))).toBe(false);
  });
  test("delegated but types uncaptured (introspection gap) → benefit of the doubt", () => {
    expect(verifierRan(ev(2, []))).toBe(true);
  });
});

describe("Gate 1 — verify is structural", () => {
  test("unverified run downgrades a self-labelled confirmed to uncertain", () => {
    const r = enforceGates([f({ verifierVerdict: "confirmed" })], ev(0));
    expect(r.verified).toBe(false);
    expect(r.findings[0].verifierVerdict).toBe("uncertain");
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].rule).toBe("unverified-downgrade");
  });

  test("verified run leaves a confirmed alone", () => {
    const r = enforceGates(
      [f({ verifierVerdict: "confirmed", pocStatus: "green" })],
      ev(4, ["verifier"]),
    );
    expect(r.verified).toBe(true);
    expect(r.findings[0].verifierVerdict).toBe("confirmed");
    expect(r.actions).toHaveLength(0);
  });

  test("a refuted finding is untouched even on an unverified run", () => {
    const r = enforceGates([f({ verifierVerdict: "refuted" })], ev(0));
    expect(r.findings[0].verifierVerdict).toBe("refuted");
    expect(r.actions).toHaveLength(0);
  });
});

describe("Gate 2 — PoC attempt required", () => {
  test("a confirmed bug high/critical with na PoC is forced to pending", () => {
    const r = enforceGates(
      [f({ severity: "critical", class: "bug", pocStatus: "na" })],
      ev(4, ["verifier"]),
    );
    expect(r.findings[0].pocStatus).toBe("pending");
    expect(r.actions[0].rule).toBe("poc-required");
  });

  test("a centralization finding at high with na PoC is untouched (no reproduction expected)", () => {
    const r = enforceGates([f({ class: "centralization", pocStatus: "na" })], ev(4, ["verifier"]));
    expect(r.findings[0].pocStatus).toBe("na");
    expect(r.actions).toHaveLength(0);
  });

  test("a bug at medium with na PoC is untouched (not high/critical)", () => {
    const r = enforceGates([f({ severity: "medium", pocStatus: "na" })], ev(4, ["verifier"]));
    expect(r.findings[0].pocStatus).toBe("na");
  });

  test("a green PoC is left alone", () => {
    const r = enforceGates([f({ pocStatus: "green" })], ev(4, ["verifier"]));
    expect(r.findings[0].pocStatus).toBe("green");
    expect(r.actions).toHaveLength(0);
  });
});

describe("ordering — an unverified bug is downgraded, NOT poc-forced", () => {
  test("Gate 1 downgrade makes Gate 2 inapplicable (uncertain, not confirmed)", () => {
    // unverified run + confirmed bug crit + na PoC: Gate 1 downgrades to uncertain, so Gate 2 (which
    // requires confirmed) does not fire — only one action, the downgrade.
    const r = enforceGates([f({ severity: "critical", class: "bug", pocStatus: "na" })], ev(0));
    expect(r.findings[0].verifierVerdict).toBe("uncertain");
    expect(r.findings[0].pocStatus).toBe("na"); // untouched by Gate 2
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].rule).toBe("unverified-downgrade");
  });
});
