/**
 * Discovery (v1, Index-based) — the INTERNAL "aim it at the ecosystem" capability: rank value-holding
 * Clarity contracts by real $-at-risk so we know what to baseline-audit + watch. NOT a client feature.
 *
 * Approach (self-host-aligned, zero standing infra): candidates come from the Index (recent sBTC
 * transfer recipients that are contract principals) + our KB contracts; each candidate's REAL balance
 * is read live off the node (`get-balance` read-only for FT, `/v2/accounts` for STX), priced by the
 * curated `agent/pricing.ts` map, and ranked by summed USD. The exhaustive whole-chain version is a
 * later upgrade (Streams → own Postgres balance table, i.e. the asset-holdings subgraph's handlers run
 * on our own box), NOT the hosted subgraph.
 *
 * HONEST MODES (credibility rule — never a silent stub):
 *  - "index"     : candidates from the live Index, balances read live, ranked by curated USD.
 *  - "seed-stub" : Index unreachable → ranks ONLY known KB contracts (labelled; this is not discovery).
 *
 *   . ./.env.local && bun run discover [limit]
 */
import { SecondLayer } from "@secondlayer/sdk";
import { PRICED_AS_OF, symbol, usd } from "../agent/pricing";
import type { Tier } from "../monitoring/config";
import { SecondLayerObservationReader } from "../monitoring/invariant";
import { type ClassifyPriority, classifyPriority, jevConfidenceFloor } from "../monitoring/jev";
import { listRecords } from "../monitoring/kb";
import { networkOf, resolveNodeUrl } from "../monitoring/network";

/** sBTC — the wedge's flagship value-bearing asset. Its token contract + canonical asset id. */
const SBTC_CONTRACT = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const SBTC_ASSET = `${SBTC_CONTRACT}::sbtc-token`;

export type DiscoverMode = "index" | "seed-stub";
export type AssetHolding = { asset: string; symbol: string; amount: string; usd: number | null };
export type Target = {
  contractId: string;
  usdAtRisk: number;
  holdings: AssetHolding[];
  /** Jev annotation — never reorders the USD rank. */
  tier?: Tier;
  attackSurface?: "high" | "medium" | "low";
};
export type DiscoverResult = {
  mode: DiscoverMode;
  pricedAsOf: string;
  candidates: number;
  targets: Target[];
  note: string;
};

function slClient(): SecondLayer {
  const baseUrl = process.env.SECONDLAYER_API_URL;
  const apiKey = process.env.SECONDLAYER_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("SECONDLAYER_API_URL + SECONDLAYER_API_KEY required");
  return new SecondLayer({ baseUrl, apiKey, origin: "session" });
}

/** Recent sBTC transfer recipients that are CONTRACT principals — the live value-receiving candidates. */
async function sbtcRecipients(sl: SecondLayer, window: number): Promise<Set<string>> {
  const { events } = await sl.index.ftTransfers.list({ contractId: SBTC_CONTRACT, limit: window });
  const out = new Set<string>();
  for (const e of events as Array<{ recipient?: string }>) {
    if (e.recipient?.includes(".")) out.add(e.recipient);
  }
  return out;
}

/** A contract's STX balance via the node `/v2/accounts` RPC (the secondlayer node path), or null. */
async function stxBalance(contractId: string): Promise<bigint | null> {
  const node = resolveNodeUrl(networkOf(contractId));
  if (!node) return null;
  try {
    const res = await fetch(`${node}/v2/accounts/${contractId}?proof=0`);
    if (!res.ok) return null;
    const data = (await res.json()) as { balance?: string };
    return data.balance ? BigInt(data.balance) : null; // hex string
  } catch {
    return null;
  }
}

/** Read one candidate's priced holdings (sBTC via get-balance, STX via /v2/accounts). */
async function holdingsOf(
  contractId: string,
  reader: SecondLayerObservationReader,
): Promise<AssetHolding[]> {
  const holdings: AssetHolding[] = [];
  const { observations } = await reader.readVerbose([
    {
      key: "sbtc",
      kind: "read-only-uint",
      contractId: SBTC_CONTRACT,
      fn: "get-balance",
      args: [{ principal: contractId }],
    },
  ]);
  const sbtc = observations.sbtc;
  if (sbtc && sbtc > 0n) {
    holdings.push({
      asset: SBTC_ASSET,
      symbol: symbol(SBTC_ASSET),
      amount: sbtc.toString(),
      usd: usd(SBTC_ASSET, sbtc),
    });
  }
  const stx = await stxBalance(contractId);
  if (stx && stx > 0n) {
    holdings.push({ asset: "STX", symbol: "STX", amount: stx.toString(), usd: usd("STX", stx) });
  }
  return holdings;
}

/** Sum priced holdings into $-at-risk, drop empties, rank desc. Pure — the testable core. */
export function rankTargets(byContract: Map<string, AssetHolding[]>, limit: number): Target[] {
  const targets: Target[] = [];
  for (const [contractId, holdings] of byContract) {
    if (holdings.length === 0) continue;
    const usdAtRisk = holdings.reduce((s, h) => s + (h.usd ?? 0), 0);
    targets.push({ contractId, usdAtRisk, holdings });
  }
  targets.sort((a, b) => b.usdAtRisk - a.usdAtRisk);
  return targets.slice(0, limit);
}

/** Overlay Jev tier/surface onto a USD-ranked list. Rank order is unchanged. */
export async function annotateTargets(
  targets: Target[],
  classify: ClassifyPriority = classifyPriority,
): Promise<Target[]> {
  if (targets.length === 0) return targets;
  const jev = await classify(
    targets.map((t) => ({
      contractId: t.contractId,
      usdAtRisk: t.usdAtRisk,
      holdings: t.holdings.map((h) => ({ symbol: h.symbol, amount: h.amount, usd: h.usd })),
    })),
  );
  if (!jev) return targets;
  const floor = jevConfidenceFloor();
  return targets.map((t) => {
    const o = jev.byId[t.contractId];
    if (!o || o.confidence < floor) return t;
    return { ...t, tier: o.tier, attackSurface: o.surface };
  });
}

/**
 * Rank value-holding contracts by $-at-risk. `window` = how many recent sBTC transfers to scan for
 * candidates. Falls back to a labelled `seed-stub` (KB-only) if the Index is unreachable — never a
 * silent stub.
 */
export async function discoverTargets(
  opts: { limit?: number; window?: number } = {},
): Promise<DiscoverResult> {
  const limit = opts.limit ?? 10;
  const window = opts.window ?? 1000;
  const kbContracts = listRecords().map((r) => r.contractId);

  let candidates: string[];
  let mode: DiscoverMode;
  try {
    const recipients = await sbtcRecipients(slClient(), window);
    for (const c of kbContracts) recipients.add(c);
    candidates = [...recipients];
    mode = "index";
  } catch {
    // Index unreachable → rank only what we already know, LABELLED. This is not discovery.
    candidates = [...new Set(kbContracts)];
    mode = "seed-stub";
  }

  const reader = new SecondLayerObservationReader();
  const byContract = new Map<string, AssetHolding[]>();
  for (const contractId of candidates) {
    try {
      byContract.set(contractId, await holdingsOf(contractId, reader));
    } catch {
      byContract.set(contractId, []); // unreadable balance → no holdings (dropped from the rank)
    }
  }

  const targets = await annotateTargets(rankTargets(byContract, limit));
  const note =
    mode === "index"
      ? `${candidates.length} candidates (recent sBTC recipients + KB); balances read live; ranked by curated USD (as of ${PRICED_AS_OF}, ranking-grade, not an oracle).`
      : `SEED-STUB — the Index was unreachable, so this ranks only ${candidates.length} known KB contracts. NOT discovery; fix SECONDLAYER creds to widen.`;
  return { mode, pricedAsOf: PRICED_AS_OF, candidates: candidates.length, targets, note };
}

const fmtUsd = (n: number): string =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `$${(n / 1000).toFixed(1)}K`
      : `$${n.toFixed(0)}`;

// CLI: `. ./.env.local && bun run discover [limit]`
if (import.meta.main) {
  const limit = Number(process.argv[2] ?? 10);
  const r = await discoverTargets({ limit });
  console.log(`[discover] mode=${r.mode} · ${r.note}\n`);
  if (r.targets.length === 0) {
    console.log("  (no priced value-holding candidates found)");
  }
  for (const t of r.targets) {
    const holds = t.holdings
      .map((h) => `${h.symbol}${h.usd == null ? " (unpriced)" : ""}`)
      .join(", ");
    const jev = t.tier || t.attackSurface ? `  jev ${t.tier ?? "?"}/${t.attackSurface ?? "?"}` : "";
    console.log(
      `  ${fmtUsd(t.usdAtRisk).padStart(8)}  ${t.contractId}\n            ${holds}${jev}`,
    );
  }
}
