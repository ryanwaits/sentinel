/**
 * Distiller tests — the deterministic findings→KB logic (no chain/model). closure resolves to []
 * here (STACKS_NODE_URL unset → fetchSourceById returns null), so these isolate waivers /
 * priorFindings / class-aware sanitisation.
 */
import { describe, expect, test } from "bun:test";
import type { Finding } from "../monitoring/adjudication";
import { buildKBCandidate, distillBlocked, planAdvice, uniqueWatchedFn } from "./kb-distill";

const f = (over: Partial<Finding>): Finding => ({
  title: "f",
  severity: "high",
  class: "bug",
  verifierVerdict: "confirmed",
  pocStatus: "na",
  ...over,
  origin: over.origin ?? "audit",
});

const opts = {
  client: "acme",
  auditedAt: "2026-06-30",
  classifyArchetype: async () => null,
};

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
    expect(r.sensitiveFns.find((s) => s.name === "socialize-debt")?.triggerClass).toBe(
      "transfer.outflow",
    ); // dump-bin proxy_upgrade coerced off Type-1
  });

  test("signature on proxy_upgrade with no targetAsset → counterparty.new (still Type-2)", async () => {
    const r = await buildKBCandidate(
      "SP.v",
      [f({ title: "unbounded loss", targetFn: "socialize-debt", precondition: "no cap" })],
      kbc,
      opts,
    );
    expect(r.sensitiveFns.find((s) => s.name === "socialize-debt")?.triggerClass).toBe(
      "counterparty.new",
    );
  });

  test("proposal_submitted with a signature stays Type-1 (never steal the veto path)", async () => {
    const r = await buildKBCandidate(
      "SP.dao",
      [f({ title: "malicious execute", targetFn: "execute" })],
      {
        archetype: "treasury",
        sensitiveFns: [
          {
            name: "execute",
            triggerClass: "governance.proposal_submitted",
            callerAllowlist: ["SP.dao"],
          },
        ],
      },
      opts,
    );
    expect(r.priorFindings[0]?.signature?.fn).toBe("execute");
    expect(r.sensitiveFns[0]?.triggerClass).toBe("governance.proposal_submitted");
    expect(r.sensitiveFns[0]?.callerAllowlist).toEqual(["SP.dao"]);
  });

  test("proxy_upgrade WITHOUT a signature stays Type-1 (real upgrade fn)", async () => {
    const r = await buildKBCandidate("SP.v", [], kbc, opts);
    expect(r.sensitiveFns.find((s) => s.name === "socialize-debt")?.triggerClass).toBe(
      "governance.proxy_upgrade",
    );
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

describe("uniqueWatchedFn", () => {
  const names = ["socialize-debt", "system-borrow", "withdraw"];
  test("exactly one watched fn in the title → that fn", () => {
    expect(uniqueWatchedFn("socialize-debt forces unbounded LP loss", names)).toBe(
      "socialize-debt",
    );
  });
  test("zero or two hits → undefined (never fabricate)", () => {
    expect(uniqueWatchedFn("unbounded loss", names)).toBeUndefined();
    expect(uniqueWatchedFn("socialize-debt then withdraw", names)).toBeUndefined();
  });
});

describe("buildKBCandidate — keep live bugs / name the fn", () => {
  const live = {
    sensitiveFns: kbc.sensitiveFns,
    priorFindings: [
      {
        title: "socialize-debt forces unbounded LP loss",
        severity: "high" as const,
        class: "bug" as const,
        note: "missing precondition, not merely a trust assumption",
        pocFile: "poc/finding-1.ts",
      },
    ],
  };

  test("title names exactly one watched fn → signature without targetFn", async () => {
    const r = await buildKBCandidate(
      "SP.v",
      [f({ title: "socialize-debt forces unbounded LP loss", precondition: "no cap" })],
      kbc,
      opts,
    );
    expect(r.priorFindings[0]?.signature?.fn).toBe("socialize-debt");
    expect(r.sensitiveFns.find((s) => s.name === "socialize-debt")?.triggerClass).toBe(
      "counterparty.new",
    ); // coerced off proxy_upgrade; no targetAsset → not outflow
  });

  test("this run omits the live bug → still in the candidate, signed, coerced off Type-1", async () => {
    const r = await buildKBCandidate("SP.v", [], kbc, { ...opts, live });
    const bug = r.priorFindings.find((p) => p.title.startsWith("socialize-debt"));
    expect(bug?.class).toBe("bug");
    expect(bug?.pocFile).toBe("poc/finding-1.ts");
    expect(bug?.signature?.fn).toBe("socialize-debt");
    expect(r.sensitiveFns.find((s) => s.name === "socialize-debt")?.triggerClass).not.toBe(
      "governance.proxy_upgrade",
    );
    expect(planAdvice(r)).toMatch(/^TURN ON/);
  });

  test("this run relabels the live bug centralization → keep bug, do not waive", async () => {
    const r = await buildKBCandidate(
      "SP.v",
      [
        f({
          title: "socialize-debt forces unbounded LP loss",
          class: "centralization",
          severity: "high",
        }),
      ],
      kbc,
      { ...opts, live },
    );
    expect(r.priorFindings.some((p) => p.class === "bug")).toBe(true);
    expect(r.waivers.some((w) => w.finding.startsWith("socialize-debt"))).toBe(false);
  });

  test("this run REFUTES the live bug → dropped", async () => {
    const r = await buildKBCandidate(
      "SP.v",
      [
        f({
          title: "socialize-debt forces unbounded LP loss",
          verifierVerdict: "refuted",
        }),
      ],
      kbc,
      { ...opts, live },
    );
    expect(r.priorFindings).toEqual([]);
  });

  test("signature precondition falls back to the finding note", async () => {
    const r = await buildKBCandidate("SP.v", [], kbc, { ...opts, live });
    expect(r.priorFindings[0]?.signature?.precondition).toBe(live.priorFindings[0]?.note);
  });

  test("explicit precondition wins over note", async () => {
    const r = await buildKBCandidate(
      "SP.v",
      [
        f({
          title: "socialize-debt forces unbounded LP loss",
          targetFn: "socialize-debt",
          precondition: "no cap",
        }),
      ],
      kbc,
      opts,
    );
    expect(r.priorFindings[0]?.signature?.precondition).toBe("no cap");
  });
});

describe("distillBlocked", () => {
  test("unwatched high bug blocks", async () => {
    const r = await buildKBCandidate(
      "SP.v",
      [f({ title: "unbounded loss" })],
      { archetype: "vault", sensitiveFns: kbc.sensitiveFns },
      opts,
    );
    expect(distillBlocked(r)).toMatch(/not watched/);
  });

  test("signed live bug does not block", async () => {
    const r = await buildKBCandidate("SP.v", [], kbc, {
      ...opts,
      live: {
        sensitiveFns: kbc.sensitiveFns,
        priorFindings: [
          {
            title: "socialize-debt forces unbounded LP loss",
            severity: "high",
            class: "bug",
            note: "no cap",
          },
        ],
      },
    });
    expect(distillBlocked(r)).toBeNull();
  });

  test("NO PLAN / volume-only do not block (honest empty)", async () => {
    const empty = await buildKBCandidate("SP.z", [], undefined, opts);
    expect(distillBlocked(empty)).toBeNull();
    const vol = await buildKBCandidate(
      "SP.amm",
      [],
      {
        archetype: "amm",
        sensitiveFns: [{ name: "swap", triggerClass: "counterparty.new", callerAllowlist: [] }],
      },
      opts,
    );
    expect(distillBlocked(vol)).toBeNull();
  });
});

describe("planAdvice", () => {
  test("empty plan", async () => {
    const r = await buildKBCandidate("SP.z", [], undefined, opts);
    expect(planAdvice(r)).toMatch(/^NO PLAN/);
  });

  test("confirmed bug missing targetFn", async () => {
    const r = await buildKBCandidate(
      "SP.v",
      [f({ title: "unbounded loss" })],
      { archetype: "vault", sensitiveFns: kbc.sensitiveFns },
      opts,
    );
    expect(planAdvice(r)).toMatch(/not watched/);
  });

  test("volume-only watches", async () => {
    const r = await buildKBCandidate(
      "SP.amm",
      [],
      {
        archetype: "amm",
        sensitiveFns: [{ name: "swap", triggerClass: "counterparty.new", callerAllowlist: [] }],
      },
      opts,
    );
    expect(planAdvice(r)).toMatch(/^DON'T TURN ON/);
  });

  test("signature-bearing plan is turn-on", async () => {
    const r = await buildKBCandidate(
      "SP.v",
      [
        f({
          title: "unbounded loss",
          targetFn: "socialize-debt",
          targetAsset: "sbtc",
          precondition: "no cap",
        }),
      ],
      kbc,
      opts,
    );
    expect(planAdvice(r)).toMatch(/^TURN ON/);
    expect(planAdvice(r)).toContain("detection signature");
  });
});

describe("buildKBCandidate — Jev archetype overlay", () => {
  test("high-confidence Jev replaces LLM/other archetype", async () => {
    const r = await buildKBCandidate("SP.z", [], undefined, {
      ...opts,
      classifyArchetype: async () => ({
        archetype: "vault",
        confidence: 0.9,
        inputTokens: 10,
      }),
    });
    expect(r.archetype).toBe("vault");
  });

  test("below floor → keep prior (other)", async () => {
    const r = await buildKBCandidate("SP.z", [], undefined, {
      ...opts,
      classifyArchetype: async () => ({
        archetype: "vault",
        confidence: 0.2,
        inputTokens: 10,
      }),
    });
    expect(r.archetype).toBe("other");
  });
});
