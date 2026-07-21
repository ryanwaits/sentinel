/**
 * Discovery ranking — the pure, testable core (`rankTargets`). The impure candidate/balance reads hit
 * the live Index + node and are exercised by the CLI (`bun run discover`), not here.
 */
import { describe, expect, test } from "bun:test";
import { type AssetHolding, rankTargets } from "./discover";

const h = (symbol: string, amount: string, usdV: number | null): AssetHolding => ({
  asset: symbol,
  symbol,
  amount,
  usd: usdV,
});

describe("rankTargets", () => {
  test("ranks by summed USD, descending", () => {
    const m = new Map<string, AssetHolding[]>([
      ["SP.a.vault", [h("sBTC", "1", 5000)]],
      ["SP.b.pool", [h("sBTC", "1", 20000), h("STX", "1", 500)]],
      ["SP.c.token", [h("STX", "1", 100)]],
    ]);
    const r = rankTargets(m, 10);
    expect(r.map((t) => t.contractId)).toEqual(["SP.b.pool", "SP.a.vault", "SP.c.token"]);
    expect(r[0].usdAtRisk).toBe(20500);
  });

  test("drops candidates with no holdings", () => {
    const m = new Map<string, AssetHolding[]>([
      ["SP.empty.x", []],
      ["SP.has.y", [h("sBTC", "1", 100)]],
    ]);
    const r = rankTargets(m, 10);
    expect(r.map((t) => t.contractId)).toEqual(["SP.has.y"]);
  });

  test("unpriced holdings count as 0 toward the rank (never invented)", () => {
    const m = new Map<string, AssetHolding[]>([
      ["SP.priced", [h("sBTC", "1", 300)]],
      ["SP.unpriced", [h("MYSTERY", "999999", null)]], // held, but no price → 0 at-risk
    ]);
    const r = rankTargets(m, 10);
    expect(r[0].contractId).toBe("SP.priced");
    expect(r.find((t) => t.contractId === "SP.unpriced")?.usdAtRisk).toBe(0);
  });

  test("respects the limit", () => {
    const m = new Map<string, AssetHolding[]>(
      Array.from({ length: 5 }, (_, i) => [`SP.c${i}`, [h("STX", "1", (i + 1) * 10)]]),
    );
    expect(rankTargets(m, 2)).toHaveLength(2);
  });
});
