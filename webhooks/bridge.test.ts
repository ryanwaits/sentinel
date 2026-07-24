/**
 * Bridge orchestration tests — routing over the REAL secondlayer chain-webhook envelope (decoded by
 * the sdk's `decodeChainWebhook`). Exercises the no-dispatch branches (rollback, test-ping, malformed,
 * no-fn, unmonitored, benign) plus the Type-2 transfer path incl. the per-event_index dedup. No spend:
 * the transfer path routes to triage (no reserve); signature verify is skipped (no secret in env).
 */
import { describe, expect, test } from "bun:test";
import { Cl } from "@secondlayer/stacks/clarity";
import { handle } from "./secondlayer-webhook";

const TREASURY = "SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd002-treasury-mia-mining-v3";
const DAO = "SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.base-dao";
const TS = "2026-07-24T00:00:00.000Z";

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/test-rule-key", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Build a real `chain.<trigger>.apply` delivery around an event. */
function applyPost(
  trigger: string,
  event: unknown,
  opts: { tx_id?: string; block_height?: number; block_hash?: string; whId: string },
): Request {
  return post(
    {
      type: `chain.${trigger}.apply`,
      timestamp: TS,
      data: {
        action: "apply",
        block_hash: opts.block_hash ?? "0xblock",
        block_height: opts.block_height ?? 100,
        tx_id: opts.tx_id ?? "0xtx",
        canonical: true,
        trigger,
        event,
      },
    },
    { "webhook-id": opts.whId },
  );
}

/** A transfer-family event (nested `data`, carries `event_index`). */
const transferEvent = (amount: string, eventIndex: number, tx_id = "0xtx") => ({
  tx_id,
  type: "stx_transfer_event",
  event_index: eventIndex,
  data: { sender: TREASURY, recipient: DAO, amount, memo: "" },
});

/** A tx-level `contract_call` event (flat, no `event_index`). */
const contractCallEvent = (
  contract_id: string | null,
  function_name: string | null,
  function_args: string[] | null,
  tx_id = "0xtx",
) => ({
  tx_id,
  type: "contract_call",
  sender: DAO,
  status: "success",
  contract_id,
  function_name,
  function_args,
  result_hex: null,
});

describe("bridge — decode + no-dispatch branches", () => {
  test("reorg rollback → 204, no dispatch", async () => {
    const res = await handle(
      post(
        {
          type: "chain.reorg.rollback",
          timestamp: TS,
          data: { action: "rollback", fork_point_height: 5, orphaned: [], truncated: false },
        },
        { "webhook-id": "wh-rollback" },
      ),
    );
    expect(res.status).toBe(204);
  });

  test("subscription test ping (chain.test.apply) → 200 acked, no dispatch", async () => {
    const res = await handle(
      post(
        {
          type: "chain.test.apply",
          timestamp: TS,
          data: { test: true, message: "ping", subscription_id: "sub-1", sent_at: TS },
        },
        { "webhook-id": "wh-test" },
      ),
    );
    expect(res.status).toBe(200);
  });

  test("malformed body (not a chain-webhook delivery) → 400", async () => {
    const res = await handle(post({ foo: "bar" }, { "webhook-id": "wh-bad" }));
    expect(res.status).toBe(400);
  });

  test("contract_deploy (no function_name) → 200 no-op", async () => {
    const ev = contractCallEvent("SP000000000000000000002Q6VF78.thing", null, null);
    const res = await handle(applyPost("contract_deploy", ev, { whId: "wh-deploy" }));
    expect(res.status).toBe(200);
  });

  test("unmonitored contract (no KB record) → 204", async () => {
    const ev = contractCallEvent("SP000000000000000000002Q6VF78.unknown", "foo", []);
    const res = await handle(applyPost("contract_call", ev, { whId: "wh-unmonitored" }));
    expect(res.status).toBe(204);
  });

  test("benign contract_call below threshold → 204, no spend", async () => {
    // withdraw-stx(amount=1, recipient): 1 < 1e12 threshold ⇒ benign
    const ev = contractCallEvent(TREASURY, "withdraw-stx", [
      Cl.serialize(Cl.uint(1n)),
      Cl.serialize(Cl.standardPrincipal("SP000000000000000000002Q6VF78")),
    ]);
    const res = await handle(
      applyPost("contract_call", ev, { tx_id: "0xbenign", whId: "wh-benign" }),
    );
    expect(res.status).toBe(204);
  });
});

describe("bridge — Type-2 transfer (outflow) routing", () => {
  test("stx outflow over threshold → 202 (triage queued, no audit)", async () => {
    const res = await handle(
      applyPost("stx_transfer", transferEvent("5000000000000", 1, "0xout"), {
        tx_id: "0xout",
        whId: "wh-outflow",
      }),
    );
    expect(res.status).toBe(202);
  });

  test("stx outflow below threshold → 204 (benign, no spend)", async () => {
    const res = await handle(
      applyPost("stx_transfer", transferEvent("1", 1, "0xsmall"), {
        tx_id: "0xsmall",
        whId: "wh-small",
      }),
    );
    expect(res.status).toBe(204);
  });

  // The bug: one tx emits many transfer events (a swap → N outflows), each a distinct event_index. The
  // dedup key now carries it, so all three dispatch (before the fix, #2/#3 were dropped as duplicates).
  test("3 same-tx outflows with distinct event_index → 3 triggers (not collapsed to 1)", async () => {
    const outflow = (eventIndex: number, whId: string) =>
      handle(
        applyPost("stx_transfer", transferEvent("5000000000000", eventIndex, "0xmulti"), {
          tx_id: "0xmulti",
          whId,
        }),
      );
    expect((await outflow(2220, "wh-m1")).status).toBe(202);
    expect((await outflow(2230, "wh-m2")).status).toBe(202); // dropped as a dup before the fix
    expect((await outflow(2240, "wh-m3")).status).toBe(202);
    // a genuine re-delivery of the FIRST event (same event_index, new webhook-id) still dedups
    expect((await outflow(2220, "wh-m1-redeliver")).status).toBe(200);
  });
});
