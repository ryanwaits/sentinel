/**
 * Distiller tests — the deterministic findings→KB logic (no chain/model). closure resolves to []
 * here (STACKS_NODE_URL unset → fetchSourceById returns null), so these isolate waivers /
 * priorFindings / class-aware sanitisation.
 */
import { describe, expect, test } from "bun:test";
import type { Finding } from "../monitoring/adjudication";
import { buildKBCandidate } from "./kb-distill";

const f = (over: Partial<Finding>): Finding => ({
  title: "f",
  severity: "high",
  class: "bug",
  verifierVerdict: "confirmed",
  pocStatus: "na",
  ...over,
  origin: over.origin ?? "audit",
});

const opts = { client: "acme", auditedAt: "2026-06-30" };

describe("buildKBCandidate", () => {
  test("confirmed centralization → waiver; confirmed high/crit bug → priorFinding; refuted/low dropped", async () => {
    const findings: Finding[] = [
      f({ title: "drain", severity: "high", class: "bug", verifierVerdict: "confirmed" }),
      f({
        title: "owner pause",
        severity: "medium",
        class: "centralization",
        verifierVerdict: "confirmed",
      }),
      f({ title: "low nit", severity: "low", class: "bug", verifierVerdict: "confirmed" }), // too low for priorFinding
      f({ title: "hallucinated", severity: "critical", class: "bug", verifierVerdict: "refuted" }), // dropped
    ];
    const r = await buildKBCandidate(
      "SP.x",
      findings,
      { archetype: "vault", sensitiveFns: [] },
      opts,
    );
    expect(r.archetype).toBe("vault");
    expect(r.priorFindings.map((p) => p.title)).toEqual(["drain"]);
    expect(r.waivers.map((w) => w.finding)).toEqual(["owner pause"]);
    expect(r.baselineAudited).toBe(true);
  });

  test("class-aware sanitisation: counterparty allowlist cleared, outflowThreshold dropped, governance kept", async () => {
    const kbCandidate = {
      archetype: "amm" as const,
      sensitiveFns: [
        {
          name: "swap",
          triggerClass: "counterparty.new" as const,
          callerAllowlist: ["SP.guessed"],
        },
        {
          name: "withdraw",
          triggerClass: "transfer.outflow" as const,
          callerAllowlist: [],
          outflowThreshold: { asset: "stx", amount: "1" },
        },
        {
          name: "execute",
          triggerClass: "governance.proposal_submitted" as const,
          callerAllowlist: ["SP.dao"],
        },
      ],
    };
    const r = await buildKBCandidate("SP.y", [], kbCandidate, opts);
    const byName = Object.fromEntries(r.sensitiveFns.map((s) => [s.name, s]));
    expect(byName.swap.callerAllowlist).toEqual([]); // counterparty allowlist NOT auto-populated
    expect(byName.withdraw.outflowThreshold).toBeUndefined(); // threshold dropped
    expect(byName.execute.callerAllowlist).toEqual(["SP.dao"]); // governance allowlist kept (provenance)
  });

  test("no kbCandidate → archetype 'other', empty sensitiveFns", async () => {
    const r = await buildKBCandidate("SP.z", [], undefined, opts);
    expect(r.archetype).toBe("other");
    expect(r.sensitiveFns).toEqual([]);
  });
});

describe("buildKBCandidate — audit generates the monitoring scope", () => {
  const kbc = {
    archetype: "vault" as const,
    sensitiveFns: [
      {
        name: "socialize-debt",
        triggerClass: "governance.proxy_upgrade" as const,
        callerAllowlist: [],
      },
      {
        name: "withdraw",
        triggerClass: "transfer.outflow" as const,
        callerAllowlist: [],
        suggestedOutflowThreshold: { asset: "stx", amount: "1000000" },
        outflowThreshold: { asset: "stx", amount: "5" }, // audit must NOT set the live gate
      },
    ],
  };

  test("confirmed bug whose targetFn ∈ sensitiveFns → emits a Type-2 signature", async () => {
    const r = await buildKBCandidate(
      "SP.v",
      [
        f({
          title: "unbounded loss",
          severity: "high",
          verifierVerdict: "confirmed",
          targetFn: "socialize-debt",
          targetAsset: "sbtc",
          precondition: "amount uncapped",
        }),
      ],
      kbc,
      opts,
    );
    const sig = r.priorFindings[0]?.signature;
    expect(sig?.fn).toBe("socialize-debt");
    expect(sig?.asset).toBe("sbtc");
    expect(sig?.precondition).toBe("amount uncapped");
    expect(sig?.triggerClass).toBe("transfer.outflow"); // targetAsset present ⇒ outflow signature
  });

  test("targetFn NOT in sensitiveFns → no signature (context-only, never fabricated)", async () => {
    const r = await buildKBCandidate(
      "SP.v",
      [
        f({
          title: "ghost",
          severity: "high",
          verifierVerdict: "confirmed",
          targetFn: "not-a-watched-fn",
        }),
      ],
      kbc,
      opts,
    );
    expect(r.priorFindings[0]?.signature).toBeUndefined();
  });

  test("audit SUGGESTS thresholds but never sets the LIVE gate", async () => {
    const r = await buildKBCandidate("SP.v", [], kbc, opts);
    const withdraw = r.sensitiveFns.find((s) => s.name === "withdraw");
    expect(withdraw?.suggestedOutflowThreshold).toEqual({ asset: "stx", amount: "1000000" });
    expect(withdraw?.outflowThreshold).toBeUndefined(); // human promotes; prefilter only reads live
  });
});
