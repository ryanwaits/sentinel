/**
 * Jev (TypeSafe System One) — typed decisions, not generated text.
 *
 * Impure edge. Callers keep post-processing pure and fall back when a classifier returns null
 * (no key, SENTINEL_AUDIT_MOCK, SENTINEL_JEV=0, or request failure).
 *
 * Confidence floors scale with blast radius:
 *  - overlay (severity / archetype / priority): SENTINEL_JEV_CONFIDENCE, default 0.6
 *  - waive a finding (drop an alert): SENTINEL_JEV_WAIVE_CONFIDENCE, default 0.75
 *  - drop a fail-safe event (skip spend): SENTINEL_JEV_DROP_CONFIDENCE, default 0.85
 */
import {
  choice,
  type EntryType,
  noul,
  type Questions,
  type SystemOneResult,
  TypeSafeClient,
} from "@typesafe-ai/sdk";
import type { Severity } from "./adjudication";
import type { Archetype, CentralizationWaiver, TriggerClass } from "./config";

const SEVERITY_OPTIONS = {
  critical:
    "Active drain or unbounded loss in progress — far beyond any historical outflow, unknown recipient, matches an exploit pattern.",
  high: "Anomalous vs baseline: exceeds historical max, well above p99, or a brand-new recipient on a large outflow.",
  medium:
    "Notable but consistent with baseline (at or under p99, known recipient) or a fail-safe with no baseline to judge against.",
  low: "Barely notable; likely routine authorized activity.",
  info: "Informational only; no anomaly signal.",
} as const;

const ARCHETYPE_OPTIONS = {
  "governance-dao": "DAO / ExecutorDAO / proposal-driven governance or extension system.",
  vault: "Lending vault, yield vault, or share-accounting pool that takes deposits.",
  amm: "Swap / liquidity pool / AMM.",
  treasury: "Treasury or protocol-owned value sitting behind a spending controller.",
  token: "Fungible or NFT token contract (mint/transfer/burn), not a vault.",
  other: "None of the above, or not enough to tell.",
} as const satisfies Record<Archetype, string>;

const TIER_OPTIONS = {
  deep: "High attack-surface or governance/treasury — full-panel Opus audit.",
  monitor: "Lower attack-surface — Sonnet/monitor tier is enough until something triggers.",
} as const;

const SURFACE_OPTIONS = {
  high: "Privileged mutators, share accounting, or governance execution — large blast radius.",
  medium: "Some privileged surface, typical DeFi.",
  low: "Mostly token plumbing or a thin wrapper.",
} as const;

function apiKey(): string | undefined {
  const k = process.env.TYPESAFE_API_KEY?.trim() || process.env.JEV_API_KEY?.trim();
  return k || undefined;
}

export function jevEnabled(): boolean {
  if (process.env.SENTINEL_AUDIT_MOCK) return false;
  if (process.env.SENTINEL_JEV === "0") return false;
  return Boolean(apiKey());
}

function floorOf(env: string, fallback: number): number {
  const n = Number(process.env[env] ?? String(fallback));
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

export function jevConfidenceFloor(): number {
  return floorOf("SENTINEL_JEV_CONFIDENCE", 0.6);
}

export function jevWaiveFloor(): number {
  return floorOf("SENTINEL_JEV_WAIVE_CONFIDENCE", 0.75);
}

export function jevDropFloor(): number {
  return floorOf("SENTINEL_JEV_DROP_CONFIDENCE", 0.85);
}

function json(v: unknown): EntryType {
  return JSON.parse(JSON.stringify(v)) as EntryType;
}

export async function systemOne<Q extends Questions>(req: {
  state: unknown;
  questions: Q;
}): Promise<SystemOneResult<Q> | null> {
  if (!jevEnabled()) return null;
  try {
    const client = new TypeSafeClient({ apiKey: apiKey() });
    return await client.systemOne({ state: json(req.state), questions: req.questions });
  } catch (err) {
    console.warn(`[jev] systemOne failed — fallback: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// --- Type-2 anomaly severity ------------------------------------------------

export type AnomalyState = {
  contractId: string;
  triggerClass: string;
  event: {
    type?: string;
    amount?: string;
    recipient?: string;
    asset?: string;
    function_name?: string;
    sender?: string;
  };
  verdict: { reason: string; suspicious: boolean; amount: string | null };
  baseline: {
    asset: string;
    count: number;
    p99: string;
    max: string;
    recipients: string[];
  } | null;
  heuristic: { severity: Severity; confidence: number };
};

export type AnomalyDecision = {
  severity: Severity;
  confidence: number;
  likelyExploit: number;
  probabilities: Record<string, number>;
  inputTokens: number;
};

export type ClassifyAnomaly = (state: AnomalyState) => Promise<AnomalyDecision | null>;

export const classifyAnomaly: ClassifyAnomaly = async (state) => {
  const res = await systemOne({
    state,
    questions: {
      severity: choice(
        "How severe is this on-chain event as a security incident, judging `event` against `baseline`? Treat `heuristic` as a prior only.",
        SEVERITY_OPTIONS,
      ),
      likely_exploit: noul(
        "Is `event` more consistent with an active exploit than with a routine authorized operation?",
        {
          true: "Looks like exploitation of a vulnerability or unauthorized drain.",
          false: "Looks like a routine, authorized, or in-policy operation.",
        },
      ),
    },
  });
  if (!res) return null;
  const sev = res.answers.severity;
  return {
    severity: sev.choice,
    confidence: sev.confidence,
    likelyExploit: res.answers.likely_exploit.noul,
    probabilities: { ...sev.probabilities },
    inputTokens: res.usage.input_tokens,
  };
};

// --- KB archetype -----------------------------------------------------------

export type ArchetypeState = {
  contractId: string;
  sourceExcerpt?: string;
  prior?: Archetype;
};

export type ArchetypeDecision = {
  archetype: Archetype;
  confidence: number;
  inputTokens: number;
};

export type ClassifyArchetype = (state: ArchetypeState) => Promise<ArchetypeDecision | null>;

export const classifyArchetype: ClassifyArchetype = async (state) => {
  const res = await systemOne({
    state,
    questions: {
      archetype: choice(
        "What archetype is this Clarity contract? Judge from `contractId` and `sourceExcerpt` (if present). Treat `prior` as a guess only.",
        ARCHETYPE_OPTIONS,
      ),
    },
  });
  if (!res) return null;
  const a = res.answers.archetype;
  return {
    archetype: a.choice,
    confidence: a.confidence,
    inputTokens: res.usage.input_tokens,
  };
};

// --- Waiver coverage --------------------------------------------------------

export type WaiverOpinion = { covers: boolean; confidence: number };

export type MatchWaivers = (
  findings: Array<{ title: string; class: string; blastRadius?: string }>,
  waivers: Array<Pick<CentralizationWaiver, "finding" | "label" | "note">>,
) => Promise<{ byIndex: Record<number, WaiverOpinion>; inputTokens: number } | null>;

export const matchWaivers: MatchWaivers = async (findings, waivers) => {
  const eligible = findings.map((f, i) => ({ f, i })).filter(({ f }) => f.class !== "bug");
  if (eligible.length === 0 || waivers.length === 0) return null;
  const criteria: Record<string, string> = {
    none: "Not covered by any accepted waiver — keep the finding.",
  };
  for (const [i, w] of waivers.entries()) {
    criteria[`w${i}`] = `${w.finding}${w.note ? ` — ${w.note}` : ""} [${w.label}]`;
  }
  const questions: Questions = {};
  for (const { i } of eligible) {
    questions[`f${i}`] = choice(
      `Which accepted waiver, if any, covers finding f${i}? Pick none if it is a new issue.`,
      criteria,
    );
  }
  const res = await systemOne({
    state: {
      findings: findings.map((f, i) => ({
        id: `f${i}`,
        title: f.title,
        class: f.class,
        blastRadius: f.blastRadius ?? null,
      })),
      waivers: waivers.map((w, i) => ({
        id: `w${i}`,
        finding: w.finding,
        label: w.label,
        note: w.note ?? null,
      })),
    },
    questions,
  });
  if (!res) return null;
  const byIndex: Record<number, WaiverOpinion> = {};
  for (const { i } of eligible) {
    const ans = res.answers[`f${i}`];
    if (ans?.type !== "choice") continue;
    byIndex[i] = { covers: ans.choice !== "none", confidence: ans.confidence };
  }
  return { byIndex, inputTokens: res.usage.input_tokens };
};

// --- Prefilter fail-safe ----------------------------------------------------

export type FailSafeState = {
  triggerClass: TriggerClass | string;
  reason: string;
  fnName: string;
  hasThreshold: boolean;
  event: {
    type?: string;
    amount?: string;
    recipient?: string;
    sender?: string;
    function_name?: string;
  };
};

export type FailSafeDecision = {
  notable: boolean;
  confidence: number;
  inputTokens: number;
};

export type ClassifyFailSafe = (state: FailSafeState) => Promise<FailSafeDecision | null>;

export const classifyFailSafe: ClassifyFailSafe = async (state) => {
  const res = await systemOne({
    state,
    questions: {
      action: choice(
        "This event was fail-safed to notable because amount/threshold was missing or undecodable. Should Sentinel spend attention on it?",
        {
          notable: "Could be a drain or unauthorized outflow — keep it (audit or triage).",
          benign: "Routine or harmless; safe to drop with no spend.",
        },
      ),
    },
  });
  if (!res) return null;
  const a = res.answers.action;
  return {
    notable: a.choice === "notable",
    confidence: a.confidence,
    inputTokens: res.usage.input_tokens,
  };
};

// --- Discover priority (annotation only; does not reorder USD rank) ---------

export type PriorityTarget = {
  contractId: string;
  usdAtRisk: number;
  holdings: Array<{ symbol: string; amount: string; usd: number | null }>;
};

export type PriorityOpinion = {
  tier: "deep" | "monitor";
  surface: "high" | "medium" | "low";
  confidence: number;
};

export type ClassifyPriority = (
  targets: PriorityTarget[],
) => Promise<{ byId: Record<string, PriorityOpinion>; inputTokens: number } | null>;

export const classifyPriority: ClassifyPriority = async (targets) => {
  if (targets.length === 0) return null;
  const questions: Questions = {};
  for (const [i, t] of targets.entries()) {
    questions[`t${i}_tier`] = choice(
      `What audit tier for target t${i} (${t.contractId}), given $-at-risk and holdings mix?`,
      TIER_OPTIONS,
    );
    questions[`t${i}_surface`] = choice(
      `Attack-surface of target t${i} (${t.contractId})? Infer from the contract id and holdings.`,
      SURFACE_OPTIONS,
    );
  }
  const res = await systemOne({
    state: {
      targets: targets.map((t, i) => ({
        id: `t${i}`,
        contractId: t.contractId,
        usdAtRisk: t.usdAtRisk,
        holdings: t.holdings,
      })),
    },
    questions,
  });
  if (!res) return null;
  const byId: Record<string, PriorityOpinion> = {};
  for (const [i, t] of targets.entries()) {
    const tier = res.answers[`t${i}_tier`];
    const surface = res.answers[`t${i}_surface`];
    if (tier?.type !== "choice" || surface?.type !== "choice") continue;
    byId[t.contractId] = {
      tier: tier.choice === "deep" ? "deep" : "monitor",
      surface: surface.choice === "high" || surface.choice === "low" ? surface.choice : "medium",
      confidence: Math.min(tier.confidence, surface.confidence),
    };
  }
  return { byId, inputTokens: res.usage.input_tokens };
};
