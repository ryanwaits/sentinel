/**
 * Adjudication tests — deterministic verdict from a report's [SENTINEL-FINDINGS] block. No spend.
 */
import { describe, expect, test } from "bun:test";
import {
  adjudicate,
  adjudicateFindings,
  extractFindings,
  type Finding,
  resolveWaivers,
} from "./adjudication";

describe("rollup: severity + class both come from the worst-severity kept finding", () => {
  const f = (over: Partial<Finding>): Finding => ({
    title: "f",
    severity: "low",
    class: "bug",
    verifierVerdict: "confirmed",
    pocStatus: "na",
    ...over,
    origin: over.origin ?? "audit",
  });
  test("high centralization + low bug → severity high, class centralization (low bug doesn't hijack class)", () => {
    const a = adjudicateFindings({
      sessionId: "s",
      contractId: "x",
      tokenCostUsd: 0,
      findings: [
        f({ title: "drain", severity: "high", class: "centralization" }),
        f({ title: "nit", severity: "low", class: "bug" }),
      ],
    });
    expect(a.severity).toBe("high");
    expect(a.class).toBe("centralization");
  });
  test("tie at same severity → bug outranks centralization", () => {
    const a = adjudicateFindings({
      sessionId: "s",
      contractId: "x",
      tokenCostUsd: 0,
      findings: [
        f({ severity: "high", class: "centralization" }),
        f({ severity: "high", class: "bug" }),
      ],
    });
    expect(a.class).toBe("bug");
  });
});

const WAIVER = [
  {
    finding: "Any extension can register new extensions -> privilege escalation",
    label: "by-design" as const,
  },
];

function report(findings: Partial<Finding>[], prose = "Audit complete."): string {
  return `${prose}\n\n[SENTINEL-FINDINGS]\n${JSON.stringify({ findings })}\n[/SENTINEL-FINDINGS]\n`;
}

const base = { sessionId: "s1", contractId: "SP.x", usage: { costUsd: 1.5 } };

describe("extractFindings", () => {
  test("parses a well-formed block", () => {
    const r = report([
      {
        title: "t",
        severity: "high",
        class: "bug",
        verifierVerdict: "confirmed",
        pocStatus: "green",
      },
    ]);
    expect(extractFindings(r)?.findings).toHaveLength(1);
  });
  test("returns null when absent", () => {
    expect(extractFindings("no block here")).toBeNull();
  });
});

describe("adjudicate", () => {
  test("confirmed high + green PoC → kept, WARN, bug", () => {
    const r = report([
      {
        title: "drain",
        severity: "high",
        class: "bug",
        verifierVerdict: "confirmed",
        pocStatus: "green",
      },
    ]);
    const a = adjudicate({ ...base, report: r });
    expect(a.alertLevel).toBe("warn");
    expect(a.severity).toBe("high");
    expect(a.class).toBe("bug");
    expect(a.provisional).toBe(false);
    expect(a.findings[0].kept).toBe(true);
    expect(a.tokenCostUsd).toBe(1.5);
  });

  test("refuted finding is dropped", () => {
    const r = report([
      {
        title: "noise",
        severity: "critical",
        class: "bug",
        verifierVerdict: "refuted",
        pocStatus: "na",
      },
    ]);
    const a = adjudicate({ ...base, report: r });
    expect(a.alertLevel).toBe("none");
    expect(a.findings[0].kept).toBe(false);
    expect(a.findings[0].disposition).toBe("refuted");
  });

  test("centralization finding matching a KB waiver is suppressed (no alert)", () => {
    const r = report([
      {
        title: "Any extension can register new extensions",
        severity: "medium",
        class: "centralization",
        verifierVerdict: "confirmed",
        pocStatus: "na",
      },
    ]);
    const a = adjudicate({ ...base, report: r, waivers: WAIVER });
    expect(a.suppressed).toContain("Any extension can register new extensions");
    expect(a.alertLevel).toBe("none");
  });

  test("a real BUG is never waived even if text overlaps", () => {
    const r = report([
      {
        title: "Any extension can register new extensions",
        severity: "high",
        class: "bug",
        verifierVerdict: "confirmed",
        pocStatus: "green",
      },
    ]);
    const a = adjudicate({ ...base, report: r, waivers: WAIVER });
    expect(a.suppressed).toHaveLength(0);
    expect(a.alertLevel).toBe("warn");
  });

  test("provisional-critical: confirmed critical + pending PoC → provisional WARN", () => {
    const r = report([
      {
        title: "race",
        severity: "critical",
        class: "bug",
        verifierVerdict: "confirmed",
        pocStatus: "pending",
      },
    ]);
    const a = adjudicate({ ...base, report: r });
    expect(a.provisional).toBe(true);
    expect(a.alertLevel).toBe("warn");
    expect(a.pocStatus).toBe("pending");
    expect(a.recommendedAction).toContain("PROVISIONAL");
  });

  test("uncertain high → needsHuman + WARN", () => {
    const r = report([
      {
        title: "maybe",
        severity: "high",
        class: "bug",
        verifierVerdict: "uncertain",
        pocStatus: "na",
      },
    ]);
    const a = adjudicate({ ...base, report: r });
    expect(a.needsHuman).toBe(true);
    expect(a.alertLevel).toBe("warn");
  });

  test("missing findings block → degraded human-review WARN", () => {
    const a = adjudicate({ ...base, report: "free text, no block" });
    expect(a.alertLevel).toBe("warn");
    expect(a.needsHuman).toBe(true);
  });

  test("clean (empty findings) → no alert", () => {
    const a = adjudicate({ ...base, report: report([]) });
    expect(a.alertLevel).toBe("none");
  });

  test("waived[] overlay suppresses even when substring would miss", () => {
    const a = adjudicateFindings({
      sessionId: "s",
      contractId: "x",
      tokenCostUsd: 0,
      findings: [
        {
          title: "owner can pause",
          severity: "medium",
          class: "centralization",
          verifierVerdict: "confirmed",
          pocStatus: "na",
          origin: "audit",
        },
      ],
      waived: [true],
    });
    expect(a.findings[0]?.disposition).toBe("waived");
    expect(a.alertLevel).toBe("none");
  });
});

describe("resolveWaivers", () => {
  const centralization: Finding = {
    title: "admin can set the fee",
    severity: "medium",
    class: "centralization",
    verifierVerdict: "confirmed",
    pocStatus: "na",
    origin: "audit",
  };
  const waivers = [{ finding: "owner pause is by design", label: "by-design" as const }];

  test("null Jev → substring heuristic", async () => {
    const flags = await resolveWaivers([centralization], waivers, async () => null);
    expect(flags).toEqual([false]);
  });

  test("high-conf covers → waive (semantic match substring missed)", async () => {
    const flags = await resolveWaivers([centralization], waivers, async () => ({
      byIndex: { 0: { covers: true, confidence: 0.9 } },
      inputTokens: 8,
    }));
    expect(flags).toEqual([true]);
  });

  test("low-conf covers → keep heuristic (do not drop an alert cheaply)", async () => {
    const flags = await resolveWaivers([centralization], waivers, async () => ({
      byIndex: { 0: { covers: true, confidence: 0.4 } },
      inputTokens: 8,
    }));
    expect(flags).toEqual([false]);
  });

  test("high-conf does-not-cover un-waives a substring false-positive", async () => {
    const overlapping: Finding = {
      ...centralization,
      title: "owner pause is by design extra words",
    };
    const flags = await resolveWaivers([overlapping], waivers, async () => ({
      byIndex: { 0: { covers: false, confidence: 0.9 } },
      inputTokens: 8,
    }));
    expect(flags).toEqual([false]);
  });

  test("bugs stay unwaived even if Jev says covers", async () => {
    const bug: Finding = { ...centralization, class: "bug", title: "drain" };
    const flags = await resolveWaivers([bug], waivers, async () => ({
      byIndex: { 0: { covers: true, confidence: 0.99 } },
      inputTokens: 8,
    }));
    expect(flags).toEqual([false]);
  });
});

describe("adjudicate (rest)", () => {
  test("recommendedAction always notes disclosure is human-gated", () => {
    const r = report([
      {
        title: "x",
        severity: "high",
        class: "bug",
        verifierVerdict: "confirmed",
        pocStatus: "green",
      },
    ]);
    expect(adjudicate({ ...base, report: r }).recommendedAction).toContain("human-gated");
  });
});
