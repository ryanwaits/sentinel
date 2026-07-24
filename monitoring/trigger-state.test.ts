/**
 * dedupKey tests — the load-bearing dedup discriminator. The transfer bug: one tx emits many transfer
 * events (a swap → N outflows), so the key MUST distinguish them by event_index or same-tx outflows
 * collapse to one key and we drop all but the first. Also pins the optional block_hash (reorg re-mine).
 * Pure string building — no state, no chain.
 */
import { describe, expect, test } from "bun:test";
import { dedupKey } from "./trigger-state";

describe("dedupKey", () => {
  test("distinct event_index (in the fn component) → distinct keys — same-tx outflows don't collapse", () => {
    const tx = "0xswap";
    const c = "SP1.pool";
    const k1 = dedupKey(tx, c, "outflow:stx:2220");
    const k2 = dedupKey(tx, c, "outflow:stx:2230");
    const k3 = dedupKey(tx, c, "outflow:stx:2240");
    expect(new Set([k1, k2, k3]).size).toBe(3);
  });

  test("the SAME event (same event_index) → the SAME key — a re-delivery still dedups", () => {
    expect(dedupKey("0xswap", "SP1.pool", "outflow:stx:2220")).toBe(
      dedupKey("0xswap", "SP1.pool", "outflow:stx:2220"),
    );
  });

  test("block_hash, when present, is folded in — same tx in a new block (reorg) → distinct key", () => {
    const a = dedupKey("0xtx", "SP1.pool", "withdraw-stx", "0xblockA");
    const b = dedupKey("0xtx", "SP1.pool", "withdraw-stx", "0xblockB");
    expect(a).not.toBe(b);
    // same tx + same block → same key (a re-delivery in the same block still dedups)
    expect(dedupKey("0xtx", "SP1.pool", "withdraw-stx", "0xblockA")).toBe(a);
  });

  test("absent block_hash → the key is unchanged (backward compatible)", () => {
    expect(dedupKey("0xtx", "SP1.pool", "fn")).toBe("0xtx:SP1.pool:fn");
    expect(dedupKey(undefined, "SP1.pool", "fn")).toBe("no-tx:SP1.pool:fn");
  });
});
