/**
 * Findings-contract tests — pin the shape the audit output must satisfy, especially the pocSubstrate
 * field that makes a fork proof distinguishable from an airgapped one. The zod `Finding` in
 * adjudication.ts is the validation source of truth (audit.ts parses through it), so we assert against
 * it; the JSON `FINDINGS_SCHEMA` is checked for structural agreement.
 */
import { describe, expect, test } from "bun:test";
import { Finding } from "../monitoring/adjudication";
import { FINDINGS_SCHEMA } from "./findings";

const base = {
  title: "x",
  severity: "high",
  class: "bug",
  verifierVerdict: "confirmed",
  pocStatus: "green",
  blastRadius: "b",
  recommendedAction: "r",
} as const;

describe("Finding accepts pocSubstrate", () => {
  test("a fork-substrate green parses", () => {
    const p = Finding.safeParse({ ...base, pocSubstrate: "fork" });
    expect(p.success).toBe(true);
    expect(p.success && p.data.pocSubstrate).toBe("fork");
  });

  test("an airgapped-substrate green parses", () => {
    expect(Finding.safeParse({ ...base, pocSubstrate: "airgapped" }).success).toBe(true);
  });

  test("pocSubstrate is optional — a finding with no PoC omits it", () => {
    const p = Finding.safeParse({ ...base, pocStatus: "na" });
    expect(p.success).toBe(true);
    expect(p.success && p.data.pocSubstrate).toBeUndefined();
  });

  test("an unknown substrate is rejected", () => {
    expect(Finding.safeParse({ ...base, pocSubstrate: "mainnet" }).success).toBe(false);
  });
});

describe("FINDINGS_SCHEMA structural agreement", () => {
  test("declares pocSubstrate with the same enum, and does not require it", () => {
    const props = FINDINGS_SCHEMA.properties.findings.items.properties as Record<
      string,
      { enum?: readonly string[] }
    >;
    expect(props.pocSubstrate?.enum).toEqual(["airgapped", "fork"]);
    expect(FINDINGS_SCHEMA.properties.findings.items.required).not.toContain("pocSubstrate");
  });
});
