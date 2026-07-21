/**
 * POST /audit ingress (the on-demand front door). The audit dispatch is injected (a no-op runner), so
 * the 202 path is exercised WITHOUT firing a real audit / spend. Validation + reserve run for real.
 */
import { describe, expect, test } from "bun:test";
import { handleAuditRequest } from "./secondlayer-webhook";

const VAULT = "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc";
const noopRun = async () => undefined;

function post(body: unknown): Request {
  return new Request("http://worker/audit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("handleAuditRequest", () => {
  test("a valid contract → 202 running, with derived network", async () => {
    const res = await handleAuditRequest(post({ contractId: VAULT }), noopRun);
    expect(res.status).toBe(202);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.status).toBe("running");
    expect(json.contractId).toBe(VAULT);
    expect(json.network).toBe("mainnet"); // derived from the SP address, not passed in
    expect(json.tier).toBe("monitor"); // default
  });

  test("tier=deep is honored", async () => {
    const res = await handleAuditRequest(post({ contractId: VAULT, tier: "deep" }), noopRun);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.tier).toBe("deep");
  });

  test("an invalid contractId → 400 (no dispatch)", async () => {
    let dispatched = false;
    const res = await handleAuditRequest(post({ contractId: "not-a-contract" }), async () => {
      dispatched = true;
    });
    expect(res.status).toBe(400);
    expect(dispatched).toBe(false);
  });

  test("bad JSON → 400", async () => {
    const res = await handleAuditRequest(post("{not json"), noopRun);
    expect(res.status).toBe(400);
  });
});
