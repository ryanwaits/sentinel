/**
 * Bridge orchestration tests — the NO-DISPATCH branches (no eve, no spend): rollback, no-contract,
 * unmonitored, and benign-below-threshold all return without reserving budget or POSTing to eve.
 * Signature verification is skipped here (no secret in KV / env), so these exercise routing only.
 * The notable → dispatch → readRun path is covered by the M3b live smoke.
 */
import { describe, expect, test } from "bun:test";
import { Cl } from "@secondlayer/stacks/clarity";
import { handle } from "./secondlayer-webhook";

const TREASURY = "SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd002-treasury-mia-mining-v3";
const DAO = "SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.base-dao";

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/test-rule-key", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("bridge no-dispatch branches", () => {
  test("rollback (reorg) → 204, no dispatch", async () => {
    const res = await handle(
      post(
        { action: "rollback", tx_id: "0xabc", block_height: 5 },
        { "webhook-id": "wh-rollback" },
      ),
    );
    expect(res.status).toBe(204);
  });

  test("no contract/fn in event → 200 no-op", async () => {
    const res = await handle(
      post({ action: "apply", event: { type: "x" } }, { "webhook-id": "wh-empty" }),
    );
    expect(res.status).toBe(200);
  });

  test("unmonitored contract (no KB record) → 204", async () => {
    const res = await handle(
      post(
        {
          action: "apply",
          event: { contract_id: "SP000000000000000000002Q6VF78.unknown", function_name: "foo" },
        },
        { "webhook-id": "wh-unmonitored" },
      ),
    );
    expect(res.status).toBe(204);
  });

  test("benign outflow below threshold → 204, no spend", async () => {
    const res = await handle(
      post(
        {
          action: "apply",
          tx_id: "0xbenign",
          block_height: 10,
          event: {
            contract_id: TREASURY,
            function_name: "withdraw-stx",
            sender: DAO,
            // withdraw-stx(amount, recipient): 1 < 1e12 threshold ⇒ benign
            function_args: [
              Cl.serialize(Cl.uint(1n)),
              Cl.serialize(Cl.standardPrincipal("SP000000000000000000002Q6VF78")),
            ],
          },
        },
        { "webhook-id": "wh-benign" },
      ),
    );
    expect(res.status).toBe(204);
  });

  // Type-2: a TRANSFER event (no function_name; sender = the watched contract) routes to incident
  // triage, gated by the same outflow threshold. ccd002 withdraw-stx threshold = 1e12.
  test("Type-2 stx outflow over threshold → 202 (triage queued, no audit)", async () => {
    const res = await handle(
      post(
        {
          action: "apply",
          tx_id: "0xout",
          block_height: 20,
          event: {
            type: "stx_transfer",
            sender: TREASURY,
            amount: "5000000000000",
            recipient: DAO,
          },
        },
        { "webhook-id": "wh-outflow" },
      ),
    );
    expect(res.status).toBe(202);
  });

  test("Type-2 stx outflow below threshold → 204 (benign, no spend)", async () => {
    const res = await handle(
      post(
        {
          action: "apply",
          tx_id: "0xsmall",
          block_height: 21,
          event: { type: "stx_transfer", sender: TREASURY, amount: "1", recipient: DAO },
        },
        { "webhook-id": "wh-small" },
      ),
    );
    expect(res.status).toBe(204);
  });

  // The REAL secondlayer envelope (captured from a live DLMM stx_transfer delivery, 2026-07-01):
  // { type:"chain.stx_transfer.apply", data:{ action, tx_id, block_height, trigger:"stx_transfer",
  //   event:{ type:"stx_transfer_event", data:{ amount, sender, recipient } } } }. The bridge unwraps
  // `data` + the double-nested `event.data` + strips the `_event` suffix. Must route to triage.
  test("Type-2 transfer via the REAL nested envelope (data wrapper + event.data) → 202", async () => {
    const res = await handle(
      post(
        {
          type: "chain.stx_transfer.apply",
          data: {
            action: "apply",
            tx_id: "0xreal",
            block_height: 8445086,
            trigger: "stx_transfer",
            event: {
              type: "stx_transfer_event",
              data: { memo: "", amount: "5000000000000", sender: TREASURY, recipient: DAO },
            },
          },
        },
        { "webhook-id": "wh-real" },
      ),
    );
    expect(res.status).toBe(202);
  });

  // The bug: one tx emits many transfer events (a swap → N outflows), each with a distinct event_index.
  // Before the fix the dedup key was `tx:contract:outflow:<asset>` — identical for all → we triaged the
  // first and DROPPED the rest. Now the key carries event_index, so all three dispatch.
  test("Type-2: 3 same-tx outflows with distinct event_index → 3 triggers (not collapsed to 1)", async () => {
    const outflow = (eventIndex: number, whId: string) =>
      handle(
        post(
          {
            action: "apply",
            tx_id: "0xmulti",
            block_height: 30,
            event: {
              type: "stx_transfer",
              sender: TREASURY,
              amount: "5000000000000", // > 1e12 threshold ⇒ notable
              recipient: DAO,
              event_index: eventIndex,
            },
          },
          { "webhook-id": whId },
        ),
      );
    expect((await outflow(2220, "wh-m1")).status).toBe(202);
    expect((await outflow(2230, "wh-m2")).status).toBe(202); // was dropped as a dup before the fix
    expect((await outflow(2240, "wh-m3")).status).toBe(202);
    // a genuine re-delivery of the FIRST event (same event_index, new webhook-id) still dedups
    expect((await outflow(2220, "wh-m1-redeliver")).status).toBe(200);
  });

  // event_index lives on the event object in the REAL nested envelope (event.event_index, not
  // event.data.event_index) — normalizeEvent must read it there for the fix to work on live deliveries.
  test("Type-2: nested-envelope outflows are distinguished by event_index", async () => {
    const nested = (eventIndex: number, whId: string) =>
      handle(
        post(
          {
            type: "chain.stx_transfer.apply",
            data: {
              action: "apply",
              tx_id: "0xnested-multi",
              block_height: 31,
              trigger: "stx_transfer",
              event: {
                type: "stx_transfer_event",
                event_index: eventIndex,
                data: { amount: "5000000000000", sender: TREASURY, recipient: DAO },
              },
            },
          },
          { "webhook-id": whId },
        ),
      );
    expect((await nested(2220, "wh-n1")).status).toBe(202);
    expect((await nested(2230, "wh-n2")).status).toBe(202); // distinct event_index from the nested shape
  });
});
