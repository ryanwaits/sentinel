/**
 * Persona walkthrough — example KB contracts × real Jev.
 *   bun run examples:personas
 */
import { type Finding, resolveWaivers } from "./adjudication";
import { routeForTriggerClass, type SensitiveFn } from "./config";
import { fetchSourceById } from "./contract-source";
import { refineAnomaly, type TriageContext, triageFindings } from "./incident-triage";
import { classifyArchetype, classifyPriority, jevEnabled } from "./jev";
import { deriveConfig } from "./kb";
import { type ChainEventBody, classify, classifyMaybe } from "./prefilter";

const ZEST = "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc";
const CITY = "SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd002-treasury-mia-mining-v3";
const DLMM = "SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-usdcx-v-1-bps-10";

function fn(config: ReturnType<typeof deriveConfig>, name: string): SensitiveFn {
  const f = config.sensitiveFns.find((s) => s.name === name);
  if (!f) throw new Error(`no fn ${name} on ${config.contractId}`);
  return f;
}

function finding(over: Partial<Finding> & Pick<Finding, "title" | "class">): Finding {
  return {
    severity: "medium",
    verifierVerdict: "confirmed",
    pocStatus: "na",
    origin: "audit",
    ...over,
  };
}

async function scene(title: string, run: () => Promise<void>) {
  const t0 = Date.now();
  console.log(`\n  ▸ ${title}`);
  await run();
  console.log(`    ${Date.now() - t0}ms`);
}

if (!jevEnabled()) {
  console.error("jev disabled — need JEV_API_KEY / TYPESAFE_API_KEY, unset SENTINEL_AUDIT_MOCK");
  process.exit(1);
}

const zest = deriveConfig(ZEST);
const city = deriveConfig(CITY);
const dlmm = deriveConfig(DLMM);

console.log("=== personas against live KB + live Jev ===");
console.log(
  `zest  ${zest.archetype}/${zest.tier}  sigs=${zest.signatures.length}  waivers=${zest.waivers.length}`,
);
console.log(
  `city  ${city.archetype}/${city.tier}  fns=${city.sensitiveFns.length}  waivers=${city.waivers.length}`,
);
console.log(
  `dlmm  ${dlmm.archetype}/${dlmm.tier}  fns=${dlmm.sensitiveFns.length}  waivers=${dlmm.waivers.length}`,
);

console.log("\n######## MAYA — Head of Protocol, Zest (vault, Finding 1 already shipped)");
console.log("buyer: continuous watch after a reproduced bug. enemy: stale PDF audit.");

await scene(
  "onboarding: audit forgot kbCandidate (prior=other) — recover archetype from source",
  async () => {
    const src = await fetchSourceById(ZEST);
    const excerpt = src?.source.slice(0, 4000);
    console.log(
      `    source ${src ? `${src.origin} ${src.lineCount} lines` : "UNAVAILABLE — id only"}`,
    );
    const a = await classifyArchetype({
      contractId: ZEST,
      sourceExcerpt: excerpt,
      prior: "other",
    });
    console.log(`    before  archetype=other → tier=monitor (missed vault, cheap panel)`);
    console.log(
      `    jev     ${a?.archetype} conf=${a?.confidence?.toFixed(2)} tokens=${a?.inputTokens}`,
    );
    console.log(
      `    after   ${a && a.confidence >= 0.6 ? `${a.archetype} → tier=${a.archetype === "vault" ? "monitor" : "?"} (human still promotes KB)` : "abstain, kept other"}`,
    );
  },
);

await scene(
  "honesty: socialize-debt is in KB as governance.proxy_upgrade, NO Type-2 signature",
  async () => {
    const f = fn(zest, "socialize-debt");
    console.log(
      `    kb      triggerClass=${f.triggerClass} route=${routeForTriggerClass(f.triggerClass)} signatures=${zest.signatures.length}`,
    );
    console.log(
      "    before  a socialize-debt CALL fires a Type-1 re-audit (~$2), not a detection page",
    );
    console.log(
      "    jev     not consulted (triggerClass overlay is deferred — wrong class silently flips lanes)",
    );
    console.log(
      "    after   same. gap: Finding 1 never distilled a signature, so monitoring cannot correlate the exploit",
    );
  },
);

await scene(
  "Type-2: system-borrow fail-safe (no outflowThreshold) + 50k sBTC-shaped amount",
  async () => {
    const f = fn(zest, "system-borrow");
    const event: ChainEventBody = {
      type: "contract_call",
      contract_id: ZEST,
      function_name: "system-borrow",
      sender: "SP.authorized-market",
      amount: "50000000000000",
      recipient: "SP.unknown-borrower",
    };
    const heuristic = classify(f, event);
    const maybe = await classifyMaybe(f, event);
    const ctx: TriageContext = {
      config: zest,
      contractId: ZEST,
      fnLabel: "system-borrow",
      triggerClass: f.triggerClass,
      event,
      verdict: maybe,
      dedupKey: "maya",
    };
    const before = triageFindings(ctx);
    const after = maybe.notable ? await refineAnomaly(ctx, before) : before;
    const infoB = before.find((x) => x.class === "info");
    const infoA = after.find((x) => x.class === "info");
    console.log(`    classify ${heuristic.reason}`);
    console.log(
      `    fail-safe before notable=${heuristic.notable}  after notable=${maybe.notable}  (${maybe.reason})`,
    );
    console.log(
      `    triage   before ${infoB?.severity}/${infoB?.confidence}  after ${infoA?.severity}/${infoA?.confidence}`,
    );
  },
);

console.log("\n######## ANDRE — DAO operator, CityCoins (treasury, one by-design waiver)");
console.log("buyer: don't re-page known trust assumptions; do page a real proposal / drain.");

await scene("proposal execute from base-dao — exact match, Jev must not run", async () => {
  const f = fn(city, "execute");
  const v = await classifyMaybe(f, {
    function_name: "execute",
    sender: "SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.base-dao",
  });
  console.log(`    ${v.reason}  notable=${v.notable} suspicious=${v.suspicious} route=type1`);
  console.log(
    "    before=after  Jev skipped (not a fail-safe). spends ~$2 Deep audit during timelock.",
  );
});

await scene("execute from an unexpected principal — still exact, flagged suspicious", async () => {
  const f = fn(city, "execute");
  const v = await classifyMaybe(f, {
    function_name: "execute",
    sender: "SP000000000000000000002Q6VF78.attacker",
  });
  console.log(`    ${v.reason}  notable=${v.notable} suspicious=${v.suspicious}`);
  console.log("    Jev skipped. suspicious is a code bit, not a model guess.");
});

await scene("withdraw-stx 5e12 (≥ 1e12 threshold) — notable, Jev scores the anomaly", async () => {
  const f = fn(city, "withdraw-stx");
  const event: ChainEventBody = {
    type: "stx_transfer",
    sender: CITY,
    amount: "5000000000000",
    recipient: "SP.attacker",
  };
  const v = await classifyMaybe(f, event);
  const ctx: TriageContext = {
    config: city,
    contractId: CITY,
    fnLabel: "outflow:stx",
    triggerClass: "transfer.outflow",
    event,
    verdict: v,
    dedupKey: "andre",
  };
  const before = triageFindings(ctx);
  const after = await refineAnomaly(ctx, before);
  const b = before.find((x) => x.class === "info");
  const a = after.find((x) => x.class === "info");
  console.log(`    ${v.reason}`);
  console.log(`    before ${b?.severity}/${b?.confidence} (no baseline → medium/0.4)`);
  console.log(
    `    after  ${a?.severity}/${a?.confidence}  ${a?.recommendedAction?.match(/Jev.*$/)?.[0]}`,
  );
});

await scene(
  "withdraw-ft fail-safe (KB has no threshold) — only place Jev may drop spend",
  async () => {
    const f = fn(city, "withdraw-ft");
    const event: ChainEventBody = {
      type: "ft_transfer",
      sender: CITY,
      amount: "1",
      recipient: "SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.base-dao",
    };
    const h = classify(f, event);
    const v = await classifyMaybe(f, event);
    console.log(`    before notable=${h.notable}  ${h.reason}`);
    console.log(`    after  notable=${v.notable}  ${v.reason}`);
  },
);

await scene("restated centralization finding vs KB waiver (substring would miss)", async () => {
  const f = finding({
    title: "Extensions may add further extensions, escalating privilege",
    class: "centralization",
    blastRadius: "any installed extension can widen the extension set",
  });
  const hay = `${f.title} ${f.blastRadius}`.toLowerCase();
  const needle = city.waivers[0]?.finding.toLowerCase() ?? "";
  const substring = hay.includes(needle) || needle.includes(hay);
  const waived = await resolveWaivers([f], city.waivers);
  console.log(`    waiver  "${city.waivers[0]?.finding}"`);
  console.log(`    finding "${f.title}"`);
  console.log(`    before  substring=${substring} → ${substring ? "SUPPRESS" : "RE-PAGE"}`);
  console.log(`    after   waived=${waived[0]} → ${waived[0] ? "SUPPRESS (semantic)" : "keep"}`);
});

console.log("\n######## PRIYA — AMM lead, DLMM (swap noise + three verification waivers)");
console.log("buyer: stop paging on every swap; don't resurrect refuted share-accounting FPs.");

await scene("swap from a random trader — empty allowlist ⇒ every swap is notable", async () => {
  const f = fn(dlmm, "swap");
  const event: ChainEventBody = {
    type: "contract_call",
    contract_id: DLMM,
    function_name: "swap",
    sender: "SP.lp-alice",
  };
  const v = await classifyMaybe(f, event);
  const ctx: TriageContext = {
    config: dlmm,
    contractId: DLMM,
    fnLabel: "swap",
    triggerClass: f.triggerClass,
    event,
    verdict: v,
    dedupKey: "priya",
  };
  const before = triageFindings(ctx);
  const after = await refineAnomaly(ctx, before);
  const b = before.find((x) => x.class === "info");
  const a = after.find((x) => x.class === "info");
  console.log(`    ${v.reason}  notable=${v.notable} (Jev not asked — not fail-safe)`);
  console.log(
    `    triage before ${b?.severity}/${b?.confidence}  after ${a?.severity}/${a?.confidence}`,
  );
  console.log(
    "    product gap: volume cut belongs in the allowlist / subgraph, not Jev. Jev only scores the page.",
  );
});

await scene(
  "restated FP: 'LP drains across bins' vs waiver 'Cross-bin fungible LP redemption drain'",
  async () => {
    const f = finding({
      title: "LP can drain value across bins via share accounting",
      class: "info",
      blastRadius: "redemption path",
    });
    const hay = `${f.title} ${f.blastRadius}`.toLowerCase();
    const needle = (dlmm.waivers[0]?.finding ?? "").toLowerCase();
    const substring = hay.includes(needle) || needle.includes(hay);
    const waived = await resolveWaivers([f], dlmm.waivers);
    console.log(`    before substring=${substring} → RE-PAGE`);
    console.log(`    after  waived=${waived[0]}`);
  },
);

await scene(
  "restated FP: empty-bin freeze vs 'Empty-bin no-op active-bin walk -> swap freeze'",
  async () => {
    const f = finding({
      title: "Walking empty bins can freeze swaps",
      class: "info",
    });
    const waived = await resolveWaivers([f], dlmm.waivers);
    console.log(`    after waived=${waived[0]}`);
  },
);

console.log("\n######## INTERNAL — discover annotation on the three KB contracts");
await scene("priority overlay (illustrative USD; rank stays USD-desc)", async () => {
  const targets = [
    {
      contractId: ZEST,
      usdAtRisk: 2_400_000,
      holdings: [{ symbol: "sBTC", amount: "25", usd: 2_400_000 }],
    },
    {
      contractId: CITY,
      usdAtRisk: 850_000,
      holdings: [{ symbol: "STX", amount: "1", usd: 850_000 }],
    },
    {
      contractId: DLMM,
      usdAtRisk: 420_000,
      holdings: [
        { symbol: "STX", amount: "1", usd: 210_000 },
        { symbol: "USDC", amount: "1", usd: 210_000 },
      ],
    },
  ];
  const p = await classifyPriority(targets);
  console.log("    before  rank = USD only (honest). no Deep/Monitor hint.");
  for (const t of targets) {
    const o = p?.byId[t.contractId];
    console.log(
      `    ${t.contractId.split(".").pop()}  $${(t.usdAtRisk / 1e3).toFixed(0)}k  jev ${o?.tier}/${o?.surface} conf=${o?.confidence.toFixed(2) ?? "—"}`,
    );
  }
  console.log("    after   same order. vault→deep even if a bigger boring bag ranked higher.");
});
