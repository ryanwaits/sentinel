/**
 * runAuditRequest — the on-demand "bring your contract" audit path. The auditor is injected (a stub),
 * so this exercises audit → adjudicate → notify WITHOUT real model spend. State (notify warn-once,
 * spend ledger) isolated via SENTINEL_SINK_DIR (test script).
 */
import { describe, expect, test } from "bun:test";
import type { audit as realAudit } from "../engine/audit";
import type { Finding } from "./adjudication";
import { runAuditRequest } from "./audit-pipeline";

/** A stub matching `typeof audit`: returns canned findings + cost, no chain, no model. */
function stubAudit(findings: Finding[], costUsd = 0, sessionId = "stub-session"): typeof realAudit {
  return (async () => ({
    findings,
    metrics: { costUsd },
    sessionId,
  })) as unknown as typeof realAudit;
}

const bug = (over: Partial<Finding> = {}): Finding => ({
  title: "test bug",
  severity: "high",
  class: "bug",
  verifierVerdict: "confirmed",
  pocStatus: "green",
  origin: "audit",
  ...over,
});

describe("runAuditRequest", () => {
  test("a clean audit → no actionable alert", async () => {
    const adj = await runAuditRequest(
      { contractId: "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc" },
      { audit: stubAudit([]) },
    );
    expect(adj.alertLevel).toBe("none");
    expect(adj.findings).toHaveLength(0);
  });

  test("a confirmed high bug → WARN, kept, human-gated", async () => {
    const adj = await runAuditRequest(
      { contractId: "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc", tier: "deep" },
      { audit: stubAudit([bug()], 4.2, "audit-req-warn") },
    );
    expect(adj.alertLevel).toBe("warn");
    expect(adj.severity).toBe("high");
    expect(adj.findings.filter((f) => f.kept)).toHaveLength(1);
    expect(adj.recommendedAction).toContain("human-gated");
  });

  test("a refuted finding is dropped", async () => {
    const adj = await runAuditRequest(
      { contractId: "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc" },
      { audit: stubAudit([bug({ verifierVerdict: "refuted" })], 1, "audit-req-refuted") },
    );
    expect(adj.alertLevel).toBe("none");
    expect(adj.findings.every((f) => !f.kept)).toBe(true);
  });
});
