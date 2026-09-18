/**
 * Incident-triage tests — the deterministic Type-2 producers (no chain, no model). signature-match is
 * a CORRELATION (uncertain/0.6 → needsHuman), never a confirmed exploit; the verdict-passthrough always
 * fires (covers threshold/new-counterparty/fail-safe) as class "info".
 */
import { describe, expect, test } from "bun:test";
import { adjudicateFindings } from "./adjudication";
import type { MonitoringConfig } from "./config";
import { refineAnomaly, type TriageContext, triageFindings } from "./incident-triage";
import type { AnomalyDecision, ClassifyAnomaly } from "./jev";
import type { ChainEventBody, PrefilterVerdict } from "./prefilter";

const C = "SP.x.vault";
const config = (over: Partial<MonitoringConfig> = {}): MonitoringConfig => ({
  client: "t",
  contractId: C,
  network: "mainnet",
  archetype: "vault",
  tier: "monitor",
  sensitiveFns: [],
  signatures: [],
  outflowBaselines: [],
  waivers: [],
  closure: [],
  route: "default",
  baselineAudited: true,
  ...over,
});
const stxOutflow: ChainEventBody = {
  type: "stx_transfer",
  sender: C,
  amount: "5000000000000",
  recipient: "SP.attacker",
};
const notable: PrefilterVerdict = {
  notable: true,
  suspicious: false,
  amount: 5000000000000n,
  reason: "outflow 5000000000000 >= threshold 1000000000000 — audit",
};
const ctx = (over: Partial<TriageContext>): TriageContext => ({
  config: config(),
  contractId: C,
  fnLabel: "outflow:stx",
  triggerClass: "transfer.outflow",
  event: stxOutflow,
  verdict: notable,
  dedupKey: "k",
  ...over,
});
const adj = (fs: ReturnType<typeof triageFindings>) =>
  adjudicateFindings({ sessionId: "s", contractId: C, findings: fs, tokenCostUsd: 0 });

describe("triageFindings", () => {
  test("signature-match (asset leaving) → correlational bug (uncertain/0.6) → WARN, needsHuman", () => {
    const fs = triageFindings(
      ctx({
        config: config({
          signatures: [
            {
              title: "socialize-debt unbounded loss",
              fn: "socialize-debt",
              asset: "stx",
              severity: "high",
              precondition: "amount uncapped",
            },
          ],
        }),
      }),
    );
    const sig = fs.find((f) => f.class === "bug");
    expect(sig?.verifierVerdict).toBe("uncertain"); // correlation, NOT confirmed
    expect(sig?.confidence).toBe(0.6);
    expect(sig?.origin).toBe("incident");
    expect(sig?.title).toContain("socialize-debt");
    const a = adj(fs);
    expect(a.alertLevel).toBe("warn");
    expect(a.origin).toBe("incident");
    expect(a.needsHuman).toBe(true);
  });

  test("no signature → only the generic verdict-passthrough (info) → INFO, not WARN", () => {
    const fs = triageFindings(ctx({}));
    expect(fs.every((f) => f.class === "info")).toBe(true);
    expect(adj(fs).alertLevel).toBe("info");
  });

  test("suspicious verdict → passthrough high → WARN even with no signature", () => {
    const fs = triageFindings(
      ctx({ verdict: { notable: true, suspicious: true, amount: null, reason: "x" } }),
    );
    expect(adj(fs).alertLevel).toBe("warn");
  });

  test("fail-safe: no-threshold verdict still surfaces (needsHuman), never dropped", () => {
    const fs = triageFindings(
      ctx({
        verdict: {
          notable: true,
          suspicious: false,
          amount: null,
          reason: "no outflow threshold configured — audit (fail-safe)",
        },
      }),
    );
    expect(fs.length).toBeGreaterThan(0);
    const a = adj(fs);
    expect(a.needsHuman).toBe(true);
    expect(a.alertLevel).not.toBe("none");
  });

  test("signature-match by fn (contract_call event, e.g. counterparty.new)", () => {
    const fs = triageFindings(
      ctx({
        config: config({ signatures: [{ title: "priv fn", fn: "register", severity: "high" }] }),
        triggerClass: "counterparty.new",
        event: {
          type: "contract_call",
          contract_id: C,
          function_name: "register",
          sender: "SP.new",
        },
      }),
    );
    expect(fs.some((f) => f.class === "bug" && f.targetFn === "register")).toBe(true);
  });
});

describe("triageFindings — baseline-aware anomaly severity", () => {
  const withBaseline = config({
    outflowBaselines: [
      { asset: "stx", count: 100, p99: "1000000000", max: "2000000000", recipients: ["SP.known"] },
    ],
  });
  const small = (recipient: string): Partial<TriageContext> => ({
    config: withBaseline,
    event: { type: "stx_transfer", sender: C, amount: "500000000", recipient },
    verdict: {
      notable: true,
      suspicious: false,
      amount: 500000000n,
      reason: "outflow >= threshold",
    },
  });
  const passthrough = (fs: ReturnType<typeof triageFindings>) => fs.find((f) => f.class === "info");

  test("amount above historical max → HIGH → WARN (big and weird)", () => {
    const fs = triageFindings(ctx({ config: withBaseline })); // default amount 5e12 >> max 2e9
    expect(passthrough(fs)?.severity).toBe("high");
    expect(passthrough(fs)?.recommendedAction).toContain("ANOMALY");
    expect(adj(fs).alertLevel).toBe("warn");
  });

  test("within baseline (<= p99, known recipient) → MEDIUM → INFO (big but normal)", () => {
    const fs = triageFindings(ctx(small("SP.known")));
    expect(passthrough(fs)?.severity).toBe("medium");
    expect(adj(fs).alertLevel).toBe("info");
  });

  test("new recipient (even within amount) → HIGH → WARN", () => {
    const fs = triageFindings(ctx(small("SP.brand-new")));
    expect(passthrough(fs)?.severity).toBe("high");
    expect(passthrough(fs)?.recommendedAction).toContain("not among");
    expect(adj(fs).alertLevel).toBe("warn");
  });
});

describe("refineAnomaly — Jev overlay, heuristic fallback", () => {
  const stub =
    (over: Partial<AnomalyDecision>, conf = 0.9): ClassifyAnomaly =>
    async () => ({
      severity: "low",
      confidence: conf,
      likelyExploit: 0.1,
      probabilities: {},
      inputTokens: 12,
      ...over,
    });

  test("high-confidence Jev overrides passthrough severity", async () => {
    const heuristic = triageFindings(ctx({}));
    expect(heuristic.find((f) => f.class === "info")?.severity).toBe("medium");
    const fs = await refineAnomaly(
      ctx({}),
      heuristic,
      stub({ severity: "high", confidence: 0.91 }),
    );
    const info = fs.find((f) => f.class === "info");
    expect(info?.severity).toBe("high");
    expect(info?.confidence).toBe(0.91);
    expect(info?.recommendedAction).toContain("Jev: high");
    expect(adj(fs).alertLevel).toBe("warn");
  });

  test("below confidence floor → keep heuristic, annotate abstain", async () => {
    const heuristic = triageFindings(ctx({}));
    const fs = await refineAnomaly(
      ctx({}),
      heuristic,
      stub({ severity: "critical", confidence: 0.4 }),
    );
    const info = fs.find((f) => f.class === "info");
    expect(info?.severity).toBe("medium");
    expect(info?.recommendedAction).toContain("Jev abstained");
    expect(info?.recommendedAction).toContain("said critical");
  });

  test("classify null → unchanged (no network / mock / failure)", async () => {
    const heuristic = triageFindings(ctx({}));
    const fs = await refineAnomaly(ctx({}), heuristic, async () => null);
    expect(fs).toEqual(heuristic);
  });

  test("does not touch signature-match (class:bug) findings", async () => {
    const c = ctx({
      config: config({
        signatures: [{ title: "priv fn", fn: "socialize-debt", asset: "stx", severity: "high" }],
      }),
    });
    const heuristic = triageFindings(c);
    const fs = await refineAnomaly(c, heuristic, stub({ severity: "info", confidence: 0.99 }));
    const bug = fs.find((f) => f.class === "bug");
    expect(bug?.severity).toBe("high");
    expect(bug?.confidence).toBe(0.6);
    expect(bug?.recommendedAction).not.toContain("Jev:");
  });
});
