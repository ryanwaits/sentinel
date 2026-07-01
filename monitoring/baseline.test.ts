/**
 * Baseline tests — the pure stats (percentile + per-asset distribution). No chain: fetchOutflows (the
 * live Index call) is validated via the CLI against a real contract.
 */
import { describe, expect, test } from "bun:test";
import { computeBaseline, type OutflowSample, percentile } from "./baseline";

describe("percentile (nearest-rank, bigint)", () => {
  const s = Array.from({ length: 100 }, (_, i) => BigInt(i + 1)).sort((a, b) => (a < b ? -1 : 1));
  test("p50 / p99 / p100 of 1..100", () => {
    expect(percentile(s, 50)).toBe(50n);
    expect(percentile(s, 99)).toBe(99n);
    expect(percentile(s, 100)).toBe(100n);
  });
  test("empty → 0", () => {
    expect(percentile([], 99)).toBe(0n);
  });
});

describe("computeBaseline", () => {
  const S = (asset: string, amount: bigint, recipient?: string): OutflowSample => ({
    asset,
    amount,
    recipient,
  });
  test("per-asset stats + p99 suggested threshold + distinct recipients, count-desc", () => {
    const b = computeBaseline([
      S("stx", 100n, "A"),
      S("stx", 200n, "B"),
      S("stx", 1000000n, "A"),
      S("SP.t::tok", 5n, "C"),
    ]);
    expect(b[0].asset).toBe("stx"); // sorted by count desc
    const stx = b.find((x) => x.asset === "stx");
    expect(stx?.count).toBe(3);
    expect(stx?.distinctRecipients).toBe(2);
    expect(stx?.max).toBe("1000000");
    expect(stx?.suggestedAmount).toBe(stx?.p99);
  });
  test("empty → []", () => {
    expect(computeBaseline([])).toEqual([]);
  });
});
