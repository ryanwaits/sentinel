/**
 * Scheduler tick tests — the testable core (`runScheduledTick`). The interval loop (`startScheduler`)
 * is a thin runtime shell over this and isn't timing-tested. State (notify warn-once) isolated via
 * SENTINEL_SINK_DIR (set by the test script).
 */
import { describe, expect, test } from "bun:test";
import type { Invariant, ObservationReader, Observations } from "./invariant";
import { runScheduledTick } from "./scheduler";

class StubReader implements ObservationReader {
  constructor(private readonly values: Record<string, bigint>) {}
  async read(sources: { key: string }[]): Promise<Observations> {
    const out: Observations = {};
    for (const s of sources) if (s.key in this.values) out[s.key] = this.values[s.key];
    return out;
  }
}

const floorInv = (id: string): Invariant => ({
  id,
  contractId: "SP.sched-test",
  description: "balance ≥ reserve",
  kind: "conservation",
  total: "bal",
  parts: ["reserve"],
  tolerance: 0n,
  mode: "floor",
  severity: "critical",
  findingClass: "bug",
  observe: [
    { key: "bal", kind: "data-var-uint", contractId: "SP.sched-test", varName: "bal" },
    { key: "reserve", kind: "data-var-uint", contractId: "SP.sched-test", varName: "reserve" },
  ],
});

describe("runScheduledTick", () => {
  test("summarises a clean pass (no violations, no alerts)", async () => {
    const r = await runScheduledTick({
      invariants: [floorInv("sched-clean")],
      reader: new StubReader({ bal: 200n, reserve: 100n }),
      now: "t0",
    });
    expect(r).toEqual({
      at: "t0",
      invariants: 1,
      violations: 0,
      alerted: 0,
      driftCheck: "not-wired",
    });
  });

  test("runs the registry and counts violations + alerts on a breach", async () => {
    const r = await runScheduledTick({
      invariants: [floorInv("sched-breach")],
      reader: new StubReader({ bal: 50n, reserve: 100n }),
      now: "t1",
    });
    expect(r.invariants).toBe(1);
    expect(r.violations).toBe(1);
    expect(r.alerted).toBe(1);
    expect(r.driftCheck).toBe("not-wired"); // honest: drift is planned (Tier 4), never a silent skip
  });
});
