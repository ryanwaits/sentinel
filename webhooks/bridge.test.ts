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

  // Robustness: the SDK event model uses `event_type` + a nested `payload` (Streams-shape). The bridge
  // normalizes both; a real delivery in that shape must still route to triage.
  test("Type-2 transfer via event_type + nested payload (SDK shape) → normalized → 202", async () => {
    const res = await handle(
      post(
        {
          action: "apply",
          tx_id: "0xnested",
          block_height: 22,
          event: {
            event_type: "stx_transfer",
            payload: { sender: TREASURY, amount: "5000000000000", recipient: DAO },
          },
        },
        { "webhook-id": "wh-nested" },
      ),
    );
    expect(res.status).toBe(202);
  });
});
