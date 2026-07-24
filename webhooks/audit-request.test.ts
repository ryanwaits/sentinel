/**
 * POST /audit + GET /audit/:id (the on-demand front door). The audit runner is injected (a canned
 * adjudication), so the 202 → store → status path is exercised WITHOUT firing a real audit / spend.
 * Validation + reserve run for real; state isolated via SENTINEL_SINK_DIR (test script).
 */
import { describe, expect, test } from "bun:test";
import type { Finding } from "../monitoring/adjudication";
import { type Adjudication, adjudicateFindings } from "../monitoring/adjudication";
import type { AuditRequest } from "../monitoring/audit-pipeline";
import { handleAuditRequest, handleAuditStatus } from "./secondlayer-webhook";

const VAULT = "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc";

/** A runner returning a canned adjudication — no model, no spend. */
const runWith =
  (findings: Finding[] = []): ((r: AuditRequest) => Promise<Adjudication>) =>
  async (r) =>
    adjudicateFindings({ sessionId: "test", contractId: r.contractId, findings, tokenCostUsd: 0 });

/** Stub renderer — deterministic, no model/subprocess (the real renderSummary is exercised elsewhere). */
const renderStub = async (): Promise<string> => "stub house-voice summary";

const bug: Finding = {
  title: "socialize-debt forces unbounded LP loss",
  severity: "critical",
  class: "bug",
  verifierVerdict: "confirmed",
  pocStatus: "green",
  origin: "audit",
};

function post(body: unknown): Request {
  return new Request("http://worker/audit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function poll(requestId: string, tries = 40): Promise<Record<string, unknown>> {
  let s: Record<string, unknown> = { status: "running" };
  for (let i = 0; i < tries && s.status === "running"; i++) {
    await new Promise((r) => setTimeout(r, 5));
    s = (await handleAuditStatus(requestId).json()) as Record<string, unknown>;
  }
  return s;
}

describe("handleAuditRequest", () => {
  test("a valid contract → 202 running (derived network) with CORS", async () => {
    const res = await handleAuditRequest(post({ contractId: VAULT }), runWith(), renderStub);
    expect(res.status).toBe(202);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.status).toBe("running");
    expect(json.network).toBe("mainnet"); // derived from the SP address
    expect(json.tier).toBe("monitor");
    expect(typeof json.sessionId).toBe("string");
  });

  test("the result is pollable to done, with the public findings + house-voice summary", async () => {
    const res = await handleAuditRequest(
      post({ contractId: VAULT, tier: "deep" }),
      runWith([bug]),
      renderStub,
    );
    const { sessionId } = (await res.json()) as { sessionId: string };
    const final = await poll(sessionId);
    expect(final.status).toBe("done");
    const result = final.result as { severity: string; summary: string; findings: unknown[] };
    expect(result.severity).toBe("critical");
    expect(result.findings).toHaveLength(1);
    expect(result.summary).toBe("stub house-voice summary"); // rendered summary flows into the verdict
  });

  test("an invalid contractId → 400 (no dispatch)", async () => {
    let dispatched = false;
    const res = await handleAuditRequest(post({ contractId: "not-a-contract" }), async (r) => {
      dispatched = true;
      return runWith()(r);
    });
    expect(res.status).toBe(400);
    expect(dispatched).toBe(false);
  });

  test("bad JSON → 400", async () => {
    expect((await handleAuditRequest(post("{not json"), runWith())).status).toBe(400);
  });
});

describe("handleAuditStatus", () => {
  test("an unknown request id → 404", async () => {
    const res = handleAuditStatus("req-does-not-exist");
    expect(res.status).toBe(404);
  });
});
