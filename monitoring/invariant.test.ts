/**
 * Pure-core tests for the conservation-invariant primitive. No chain: `evaluateInvariant` takes
 * hand-supplied observations + prior snapshot, so every branch (monotonic / conservation equal+floor /
 * delta-explained / unreadable / bootstrap) is exercised deterministically. Also covers the
 * `adjudicateFindings` bridge end-to-end (a violation → a kept incident WARN that stays human-gated).
 */
import { describe, expect, test } from "bun:test";
import { adjudicateFindings } from "./adjudication";
import {
  evaluateAndRecord,
  evaluateInvariant,
  type Invariant,
  type InvariantSnapshot,
  type ObservationReader,
  type ObservationSource,
  type Observations,
  violationToFinding,
} from "./invariant";
import { POX5_INVARIANTS } from "./pox5-bond-ops";

/** In-memory reader: hands back canned observations (omit a key to simulate a failed read). */
class StubReader implements ObservationReader {
  constructor(private readonly values: Record<string, bigint>) {}
  async read(sources: ObservationSource[]): Promise<Observations> {
    const out: Observations = {};
    for (const s of sources) if (s.key in this.values) out[s.key] = this.values[s.key];
    return out;
  }
}

const OBS = { key: "q", kind: "data-var-uint", contractId: "SP.c", varName: "v" } as const;

const monotonic = (dir: "non-decreasing" | "non-increasing"): Invariant => ({
  id: "m",
  contractId: "SP.c",
  description: "d",
  kind: "monotonic",
  quantity: "q",
  direction: dir,
  severity: "high",
  findingClass: "centralization",
  observe: [OBS],
});

const priorOf = (obs: Record<string, string>): InvariantSnapshot => ({
  invariantId: "m",
  observations: obs,
  computedAt: "2026-07-20T00:00:00Z",
});

describe("monotonic", () => {
  test("bootstrap (no prior) never violates", () => {
    expect(evaluateInvariant(monotonic("non-decreasing"), { q: 100n }, null)).toEqual([]);
  });

  test("non-decreasing: a drop violates and reports the delta", () => {
    const v = evaluateInvariant(monotonic("non-decreasing"), { q: 90n }, priorOf({ q: "100" }));
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("monotonic");
    expect(v[0].delta).toBe("-10");
  });

  test("non-decreasing: equal or higher holds", () => {
    expect(
      evaluateInvariant(monotonic("non-decreasing"), { q: 100n }, priorOf({ q: "100" })),
    ).toEqual([]);
    expect(
      evaluateInvariant(monotonic("non-decreasing"), { q: 101n }, priorOf({ q: "100" })),
    ).toEqual([]);
  });

  test("non-increasing: an increase violates", () => {
    const v = evaluateInvariant(monotonic("non-increasing"), { q: 5n }, priorOf({ q: "1" }));
    expect(v).toHaveLength(1);
    expect(v[0].delta).toBe("4");
  });

  test("a missing read is 'unreadable', not a false break", () => {
    const v = evaluateInvariant(monotonic("non-decreasing"), {}, priorOf({ q: "100" }));
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("unreadable");
  });
});

describe("conservation", () => {
  const floor: Invariant = {
    id: "c",
    contractId: "SP.c",
    description: "d",
    kind: "conservation",
    total: "bal",
    parts: ["reserve"],
    tolerance: 0n,
    mode: "floor",
    severity: "critical",
    findingClass: "bug",
    observe: [OBS],
  };

  test("floor holds when total ≥ Σparts (excess is fine)", () => {
    expect(evaluateInvariant(floor, { bal: 150n, reserve: 100n }, null)).toEqual([]);
    expect(evaluateInvariant(floor, { bal: 100n, reserve: 100n }, null)).toEqual([]);
  });

  test("floor breaks when total < Σparts", () => {
    const v = evaluateInvariant(floor, { bal: 80n, reserve: 100n }, null);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("conservation");
    expect(v[0].delta).toBe("-20");
  });

  test("equal mode: any drift beyond tolerance breaks (both directions)", () => {
    const equal: Invariant = { ...floor, id: "e", mode: "equal", tolerance: 5n };
    expect(evaluateInvariant(equal, { bal: 103n, reserve: 100n }, null)).toEqual([]); // within tol
    expect(evaluateInvariant(equal, { bal: 110n, reserve: 100n }, null)).toHaveLength(1); // over
    expect(evaluateInvariant(equal, { bal: 90n, reserve: 100n }, null)).toHaveLength(1); // under
  });
});

describe("delta-explained", () => {
  const de: Invariant = {
    id: "de",
    contractId: "SP.c",
    description: "d",
    kind: "delta-explained",
    quantity: "bal",
    explainedBy: "claimed",
    direction: "outflow",
    severity: "critical",
    findingClass: "bug",
    observe: [OBS],
  };
  const prior = (bal: string): InvariantSnapshot => ({
    invariantId: "de",
    observations: { bal },
    computedAt: "t",
  });

  test("outflow fully covered by announced movement holds", () => {
    // balance dropped 100, claim prints announced 100 → explained.
    expect(evaluateInvariant(de, { bal: 900n, claimed: 100n }, prior("1000"))).toEqual([]);
  });

  test("outflow exceeding announced movement violates by the unexplained remainder", () => {
    const v = evaluateInvariant(de, { bal: 800n, claimed: 100n }, prior("1000"));
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("delta-explained");
    expect(v[0].delta).toBe("100"); // 200 out − 100 announced
  });

  test("an inflow (benign direction) never violates an outflow check", () => {
    expect(evaluateInvariant(de, { bal: 1200n, claimed: 0n }, prior("1000"))).toEqual([]);
  });

  test("bootstrap without a prior never violates", () => {
    expect(evaluateInvariant(de, { bal: 800n, claimed: 0n }, null)).toEqual([]);
  });
});

describe("adjudication bridge", () => {
  test("a violation becomes a kept, human-gated incident WARN — never an auto-action", () => {
    const inv = monotonic("non-decreasing");
    const [v] = evaluateInvariant(inv, { q: 90n }, priorOf({ q: "100" }));
    const finding = violationToFinding(inv, v);
    expect(finding.origin).toBe("incident");
    expect(finding.verifierVerdict).toBe("uncertain"); // a correlation, needs a human
    expect(finding.class).toBe("centralization"); // honest label carried from the invariant

    const adj = adjudicateFindings({
      sessionId: "s",
      contractId: inv.contractId,
      findings: [finding],
      tokenCostUsd: 0,
    });
    expect(adj.alertLevel).toBe("warn");
    expect(adj.needsHuman).toBe(true);
    expect(adj.origin).toBe("incident");
    expect(adj.recommendedAction).toContain("human-gated");
  });

  test("an unreadable read degrades to an info finding (no false critical)", () => {
    const inv = monotonic("non-decreasing");
    const [v] = evaluateInvariant(inv, {}, priorOf({ q: "100" }));
    const finding = violationToFinding(inv, v);
    expect(finding.class).toBe("info");
    expect(finding.severity).toBe("medium");
  });
});

describe("evaluateAndRecord (reader → evaluate → finding)", () => {
  const inv: Invariant = { ...monotonic("non-decreasing"), id: "ear-test" };

  test("a complete read bootstraps clean (no prior → no violation)", async () => {
    const { violations, findings } = await evaluateAndRecord(
      inv,
      new StubReader({ q: 100n }),
      "t0",
    );
    expect(violations).toEqual([]);
    expect(findings).toEqual([]);
  });

  test("an absent observation yields an unreadable incident finding, not a silent pass", async () => {
    const { violations, findings } = await evaluateAndRecord(inv, new StubReader({}), "t1");
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe("unreadable");
    expect(findings[0].origin).toBe("incident");
    expect(findings[0].class).toBe("info"); // degraded read is info, never a fabricated critical
  });
});

describe("pox-5 registry", () => {
  test("declares the two reserve invariants against the boot contract", () => {
    const ids = POX5_INVARIANTS.map((i) => i.id);
    expect(ids).toContain("pox5-reserve-monotonic");
    expect(ids).toContain("pox5-sbtc-backing-floor");
    for (const inv of POX5_INVARIANTS) {
      // every quantity referenced by the check must be produced by an observation source
      const keys = new Set(inv.observe.map((o) => o.key));
      const refs =
        inv.kind === "monotonic"
          ? [inv.quantity]
          : inv.kind === "conservation"
            ? [inv.total, ...inv.parts]
            : [inv.quantity, inv.explainedBy];
      for (const r of refs) expect(keys.has(r)).toBe(true);
    }
  });
});
