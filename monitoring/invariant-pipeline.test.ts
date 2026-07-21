/**
 * invariant-pipeline tests — the invariant lane's evaluate → adjudicate → notify wiring. State
 * (notify warn-once) is isolated via SENTINEL_SINK_DIR (set by the test script); each test uses a
 * distinct invariant id / observation set so sessions don't collide across tests.
 */
import { describe, expect, test } from "bun:test";
import type { Invariant, ObservationReader, Observations } from "./invariant";
import { runInvariant } from "./invariant-pipeline";

/** In-memory reader: returns canned observations (omit a key to simulate a failed read). */
class StubReader implements ObservationReader {
  constructor(private readonly values: Record<string, bigint>) {}
  async read(sources: { key: string }[]): Promise<Observations> {
    const out: Observations = {};
    for (const s of sources) if (s.key in this.values) out[s.key] = this.values[s.key];
    return out;
  }
}

/** A backing-floor conservation invariant (sbtc balance must stay ≥ reserve). */
const floorInv = (id: string): Invariant => ({
  id,
  contractId: "SP.pox-test",
  description: "balance must stay ≥ reserve",
  kind: "conservation",
  total: "bal",
  parts: ["reserve"],
  tolerance: 0n,
  mode: "floor",
  severity: "critical",
  findingClass: "bug",
  observe: [
    { key: "bal", kind: "data-var-uint", contractId: "SP.pox-test", varName: "bal" },
    { key: "reserve", kind: "data-var-uint", contractId: "SP.pox-test", varName: "reserve" },
  ],
});

describe("runInvariant", () => {
  test("a holding invariant does not alert", async () => {
    const r = await runInvariant(
      floorInv("pipe-clean"),
      new StubReader({ bal: 150n, reserve: 100n }),
    );
    expect(r.violations).toBe(0);
    expect(r.alertLevel).toBe("none");
    expect(r.sent).toBe(false);
  });

  test("a breach adjudicates to a WARN and sends once", async () => {
    const r = await runInvariant(
      floorInv("pipe-breach"),
      new StubReader({ bal: 80n, reserve: 100n }),
    );
    expect(r.violations).toBe(1);
    expect(r.alertLevel).toBe("warn"); // critical bug → warn
    expect(r.sent).toBe(true);
  });

  test("an unchanged standing breach is warn-once (pages once)", async () => {
    const inv = floorInv("pipe-warn-once");
    const reader = new StubReader({ bal: 80n, reserve: 100n });
    expect((await runInvariant(inv, reader)).sent).toBe(true);
    const second = await runInvariant(inv, reader);
    expect(second.sent).toBe(false);
    expect(second.reason).toContain("warn-once");
  });

  test("a CHANGED breach re-pages (new observed state → new session)", async () => {
    const inv = floorInv("pipe-changed");
    expect((await runInvariant(inv, new StubReader({ bal: 80n, reserve: 100n }))).sent).toBe(true);
    // reserve drifts wider → different observations → fresh session → alerts again
    const worse = await runInvariant(inv, new StubReader({ bal: 60n, reserve: 100n }));
    expect(worse.sent).toBe(true);
  });

  test("a degraded read (missing observation) still reaches the alert path, not a silent pass", async () => {
    // omit 'reserve' → unreadable violation → info finding → an alert (needs-human), never sent:false-clean
    const r = await runInvariant(floorInv("pipe-unreadable"), new StubReader({ bal: 80n }));
    expect(r.violations).toBe(1);
    expect(r.sent).toBe(true);
  });
});
