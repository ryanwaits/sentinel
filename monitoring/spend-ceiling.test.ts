/**
 * Spend-ceiling tests — the money-safety guard on the audit-on-trigger path. Pure + `now`-injectable:
 * every branch (reserve under ceiling, breach → pause+page, paused → deny, day rollover keeps the
 * pause, reconcile, clearPause) is exercised deterministically, no chain/model/network.
 *
 * NOTE: `spend-ceiling.ts` freezes STATE_DIR at import off SENTINEL_SINK_DIR (the suite sets a temp
 * dir), so state persists across tests in one process — beforeEach wipes spend.json + PAUSED. Keep
 * SENTINEL_PAGER_URL unset so page() makes no network call.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  clearPause,
  DAILY_CEILING_USD,
  getState,
  isPaused,
  reconcile,
  reserve,
  TIER_ESTIMATE_USD,
} from "./spend-ceiling";

const DIR = process.env.SENTINEL_SINK_DIR ?? join(process.cwd(), ".sentinel");

/** A day and the same clock one UTC day later — drives the rollover branch without real time. */
const DAY1 = new Date("2026-07-24T09:00:00.000Z");
const DAY2 = new Date("2026-07-25T09:00:00.000Z");

beforeEach(() => {
  // Reset the frozen-dir state between cases (STATE_DIR is a module const).
  rmSync(join(DIR, "spend.json"), { force: true });
  rmSync(join(DIR, "PAUSED"), { force: true });
  delete process.env.SENTINEL_PAGER_URL; // never page over the network in tests
});

describe("reserve — under the ceiling", () => {
  test("allows and accumulates the tier estimate", async () => {
    const r = await reserve("monitor", DAY1);
    expect(r.allowed).toBe(true);
    expect(r.estimateUsd).toBe(TIER_ESTIMATE_USD.monitor);
    expect(r.state.spentUsd).toBeCloseTo(TIER_ESTIMATE_USD.monitor, 6);
    expect(r.state.dispatches).toBe(1);
    expect(r.state.paused).toBe(false);
  });

  test("successive reserves add up and count dispatches", async () => {
    await reserve("monitor", DAY1);
    const r2 = await reserve("deep", DAY1);
    expect(r2.allowed).toBe(true);
    expect(r2.state.spentUsd).toBeCloseTo(TIER_ESTIMATE_USD.monitor + TIER_ESTIMATE_USD.deep, 6);
    expect(r2.state.dispatches).toBe(2);
  });
});

describe("reserve — breach", () => {
  test("denies, pauses, records a reason, and writes the PAUSED marker", async () => {
    // Fill to just under the ceiling with deep sweeps, then trip it.
    const perDeep = TIER_ESTIMATE_USD.deep;
    const n = Math.floor(DAILY_CEILING_USD / perDeep); // reserves that stay under
    for (let i = 0; i < n; i++) {
      const r = await reserve("deep", DAY1);
      expect(r.allowed).toBe(true);
    }
    const breach = await reserve("deep", DAY1);
    expect(breach.allowed).toBe(false);
    expect(breach.reason).toContain("daily ceiling reached");
    expect(breach.state.paused).toBe(true);
    expect(breach.state.pausedAt).toBeTruthy();
    expect(isPaused(DAY1)).toBe(true);
  });

  test("the breaching estimate is NOT counted (spend stays below the ceiling)", async () => {
    const n = Math.floor(DAILY_CEILING_USD / TIER_ESTIMATE_USD.deep);
    for (let i = 0; i < n; i++) await reserve("deep", DAY1);
    const before = getState(DAY1).spentUsd;
    await reserve("deep", DAY1); // breach — must not add
    expect(getState(DAY1).spentUsd).toBeCloseTo(before, 6);
  });
});

describe("reserve — already paused", () => {
  test("denies regardless of tier once paused", async () => {
    const n = Math.floor(DAILY_CEILING_USD / TIER_ESTIMATE_USD.deep);
    for (let i = 0; i < n; i++) await reserve("deep", DAY1);
    await reserve("deep", DAY1); // trips the pause
    const next = await reserve("monitor", DAY1); // cheapest tier still denied
    expect(next.allowed).toBe(false);
    expect(next.state.paused).toBe(true);
  });
});

describe("day rollover", () => {
  test("resets spend for the new day but keeps a human-unacked pause (fail-safe)", async () => {
    const n = Math.floor(DAILY_CEILING_USD / TIER_ESTIMATE_USD.deep);
    for (let i = 0; i < n; i++) await reserve("deep", DAY1);
    await reserve("deep", DAY1); // pause on DAY1

    const nextDay = getState(DAY2);
    expect(nextDay.spentUsd).toBe(0); // spend rolled over
    expect(nextDay.dispatches).toBe(0);
    expect(nextDay.paused).toBe(true); // pause persists across the rollover

    const r = await reserve("monitor", DAY2); // still denied until a human clears it
    expect(r.allowed).toBe(false);
  });
});

describe("reconcile", () => {
  test("replaces an estimate with the run's actual cost (delta applied)", async () => {
    await reserve("deep", DAY1); // spent = estimate (2.0)
    const s = reconcile(TIER_ESTIMATE_USD.deep, 3.5, DAY1); // actual over estimate
    expect(s.spentUsd).toBeCloseTo(3.5, 6);
  });

  test("never drives spend negative", async () => {
    await reserve("monitor", DAY1);
    const s = reconcile(TIER_ESTIMATE_USD.monitor, 0, DAY1); // actual under estimate, to 0
    expect(s.spentUsd).toBeGreaterThanOrEqual(0);
  });
});

describe("clearPause", () => {
  test("clears the flag + reason and leaves spend intact", async () => {
    const n = Math.floor(DAILY_CEILING_USD / TIER_ESTIMATE_USD.deep);
    for (let i = 0; i < n; i++) await reserve("deep", DAY1);
    await reserve("deep", DAY1); // paused
    const spentWhilePaused = getState(DAY1).spentUsd;

    const s = clearPause(DAY1);
    expect(s.paused).toBe(false);
    expect(s.pausedReason).toBeUndefined();
    expect(s.spentUsd).toBeCloseTo(spentWhilePaused, 6); // spend not reset by an ack
    expect(isPaused(DAY1)).toBe(false);
  });
});
