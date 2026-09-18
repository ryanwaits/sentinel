/**
 * Live Jev vs heuristic comparison across the four overlay points.
 *
 *   bun run monitoring/jev-spike.ts
 *
 * Does not notify or write state. Needs TYPESAFE_API_KEY or JEV_API_KEY.
 * SENTINEL_AUDIT_MOCK must be unset.
 */
import { resolveWaivers } from "./adjudication";
import type { MonitoringConfig } from "./config";
import { refineAnomaly, type TriageContext, triageFindings } from "./incident-triage";
import { classifyArchetype, classifyPriority, jevEnabled } from "./jev";
import { type ChainEventBody, classifyMaybe, type PrefilterVerdict } from "./prefilter";

const C = "SP.x.vault";
const config = (): MonitoringConfig => ({
  client: "spike",
  contractId: C,
  network: "mainnet",
  archetype: "vault",
  tier: "monitor",
  sensitiveFns: [],
  signatures: [],
  outflowBaselines: [
    {
      asset: "stx",
      count: 100,
      p99: "1000000000",
      max: "2000000000",
      recipients: ["SP.known"],
    },
  ],
  waivers: [],
  closure: [],
  route: "default",
  baselineAudited: true,
});

const ctx = (event: ChainEventBody, verdict: PrefilterVerdict): TriageContext => ({
  config: config(),
  contractId: C,
  fnLabel: "outflow:stx",
  triggerClass: "transfer.outflow",
  event,
  verdict,
  dedupKey: "spike",
});

const cases: { name: string; ctx: TriageContext }[] = [
  {
    name: "amount >> historical max (heuristic HIGH)",
    ctx: ctx(
      { type: "stx_transfer", sender: C, amount: "5000000000000", recipient: "SP.attacker" },
      {
        notable: true,
        suspicious: false,
        amount: 5000000000000n,
        reason: "outflow 5000000000000 >= threshold 1000000000000 — audit",
      },
    ),
  },
  {
    name: "within baseline, known recipient (heuristic MEDIUM)",
    ctx: ctx(
      { type: "stx_transfer", sender: C, amount: "500000000", recipient: "SP.known" },
      { notable: true, suspicious: false, amount: 500000000n, reason: "outflow >= threshold" },
    ),
  },
  {
    name: "new recipient, amount within p99 (heuristic HIGH)",
    ctx: ctx(
      { type: "stx_transfer", sender: C, amount: "500000000", recipient: "SP.brand-new" },
      { notable: true, suspicious: false, amount: 500000000n, reason: "outflow >= threshold" },
    ),
  },
  {
    name: "fail-safe, no amount (heuristic MEDIUM)",
    ctx: ctx(
      { type: "stx_transfer", sender: C, recipient: "SP.unknown" },
      {
        notable: true,
        suspicious: false,
        amount: null,
        reason: "no outflow threshold configured — audit (fail-safe)",
      },
    ),
  },
];

if (!jevEnabled()) {
  console.error(
    "jev disabled — unset SENTINEL_AUDIT_MOCK / SENTINEL_JEV=0 and set TYPESAFE_API_KEY or JEV_API_KEY",
  );
  process.exit(1);
}

const started = Date.now();
for (const c of cases) {
  const heuristic = triageFindings(c.ctx);
  const h = heuristic.find((f) => f.class === "info");
  const t0 = Date.now();
  const refined = await refineAnomaly(c.ctx, heuristic);
  const ms = Date.now() - t0;
  const j = refined.find((f) => f.class === "info");
  const tag = j?.recommendedAction?.match(/Jev.*$/)?.[0] ?? "(no jev tag)";
  console.log(`\n${c.name}`);
  console.log(`  heuristic  ${h?.severity}  conf=${h?.confidence}`);
  console.log(`  applied    ${j?.severity}  conf=${j?.confidence}  ${ms}ms`);
  console.log(`  ${tag}`);
}
console.log(`\n${cases.length} anomaly cases in ${Date.now() - started}ms`);

console.log("\n--- archetype ---");
for (const id of [
  "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc",
  "SP000000000000000000002Q6VF78.pox-4",
]) {
  const t0 = Date.now();
  const a = await classifyArchetype({ contractId: id, prior: "other" });
  console.log(
    `  ${id}\n    prior=other  jev=${a?.archetype ?? "null"} conf=${a?.confidence?.toFixed(2) ?? "—"} ${Date.now() - t0}ms tokens=${a?.inputTokens ?? "—"}`,
  );
}

console.log("\n--- waiver ---");
{
  const finding = {
    title: "The vault owner can pause deposits",
    class: "centralization" as const,
    blastRadius: "deposits halt; existing LP still withdraws",
  };
  const waivers = [
    {
      finding: "admin pause is an accepted trust assumption",
      label: "centralization" as const,
    },
  ];
  const t0 = Date.now();
  const flags = await resolveWaivers(
    [
      {
        title: finding.title,
        severity: "medium",
        class: "centralization",
        verifierVerdict: "confirmed",
        pocStatus: "na",
        origin: "audit",
        blastRadius: finding.blastRadius,
      },
    ],
    waivers,
  );
  console.log(`  substring miss, semantic pause-waiver → waived=${flags[0]}  ${Date.now() - t0}ms`);
}

console.log("\n--- fail-safe ---");
{
  const fn = {
    name: "withdraw-ft",
    triggerClass: "transfer.outflow" as const,
    callerAllowlist: [] as string[],
  };
  const t0 = Date.now();
  const v = await classifyMaybe(fn, {
    type: "ft_transfer",
    sender: C,
    amount: "not-a-uint",
    recipient: "SP.known",
  });
  console.log(
    `  undecodable amount  heuristic=notable  applied.notable=${v.notable}  ${v.reason}  ${Date.now() - t0}ms`,
  );
}

console.log("\n--- discover priority ---");
{
  const t0 = Date.now();
  const p = await classifyPriority([
    {
      contractId: "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc",
      usdAtRisk: 2_400_000,
      holdings: [{ symbol: "sBTC", amount: "25000000", usd: 2_400_000 }],
    },
    {
      contractId: "SP.x.token",
      usdAtRisk: 1200,
      holdings: [{ symbol: "STX", amount: "1000000", usd: 1200 }],
    },
  ]);
  console.log(`  ${Date.now() - t0}ms tokens=${p?.inputTokens ?? "—"}`);
  for (const [id, o] of Object.entries(p?.byId ?? {})) {
    console.log(`  ${id}  tier=${o.tier} surface=${o.surface} conf=${o.confidence.toFixed(2)}`);
  }
}
