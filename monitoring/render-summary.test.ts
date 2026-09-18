/**
 * House-voice summary tests — the deterministic `templateSummary` fallback (the LLM path is
 * nondeterministic and covered via an injected stub in webhooks/audit-request.test.ts). Asserts the
 * summary opens with the right verdict, names the finding worth acting on, surfaces uncertain caveats
 * honestly, and states the PoC line.
 */
import { describe, expect, test } from "bun:test";
import { adjudicateFindings, type Finding } from "./adjudication";
import { templateSummary } from "./render-summary";

const C = "SP1FAKE.pool-v1";
const adj = (findings: Finding[]) =>
  adjudicateFindings({ sessionId: "t", contractId: C, findings, tokenCostUsd: 0.55 });

describe("templateSummary", () => {
  test("clean / centralization-only opens with 'no exploitable bug' and names the risk", () => {
    const s = templateSummary(
      adj([
        {
          title: "set-core-address mutable by core",
          severity: "medium",
          class: "centralization",
          verifierVerdict: "confirmed",
          pocStatus: "na",
          origin: "audit",
          recommendedAction: "Timelock or multisig on core migrations.",
        },
      ]),
    );
    expect(s).toContain(C);
    expect(s.toLowerCase()).toContain("no exploitable bug");
    expect(s).toContain("set-core-address mutable by core");
    expect(s).toContain("Timelock or multisig");
    expect(s).toContain("No PoC");
  });

  test("a confirmed bug leads with the bug and reports a green PoC", () => {
    const s = templateSummary(
      adj([
        {
          title: "socialize-debt forces unbounded LP loss",
          severity: "critical",
          class: "bug",
          verifierVerdict: "confirmed",
          pocStatus: "green",
          origin: "audit",
        },
      ]),
    );
    expect(s).toContain("socialize-debt forces unbounded LP loss");
    expect(s).toContain("critical");
    expect(s).toContain("PoC reproduces green");
  });

  test("an uncertain finding is surfaced honestly, not smoothed into clean", () => {
    const s = templateSummary(
      adj([
        {
          title: "empty-bin swap freeze",
          severity: "low",
          class: "bug",
          verifierVerdict: "uncertain",
          pocStatus: "na",
          origin: "audit",
        },
      ]),
    );
    expect(s.toLowerCase()).toContain("uncertain");
    expect(s).toContain("empty-bin swap freeze");
  });

  test("incident origin is DETECTION copy — correlation, precondition, not a confirmed exploit", () => {
    const s = templateSummary(
      adj([
        {
          title: 'Possible exploitation of "socialize-debt forces unbounded LP loss"',
          severity: "high",
          class: "bug",
          verifierVerdict: "uncertain",
          pocStatus: "na",
          origin: "incident",
          precondition: "amount uncapped / total-assets collapsing",
        },
      ]),
    );
    expect(s).toMatch(/^DETECTION — already on-chain/);
    expect(s.toLowerCase()).toContain("correlation");
    expect(s).toContain("amount uncapped");
    expect(s).not.toContain("PoC reproduces green");
  });
});
