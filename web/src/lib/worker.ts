// Client for the Sentinel worker's on-demand audit API (the "bring your contract" front door).
// Points at VITE_SENTINEL_WORKER_URL (prod: the claude-mini ts.net URL); defaults to the local worker.
// Every call fails soft: if the worker is unreachable, callers fall back to the demo flow, so the
// deployed marketing site keeps working without a worker wired up.

const WORKER_URL = import.meta.env.VITE_SENTINEL_WORKER_URL ?? "http://localhost:3011"

export type PublicFinding = {
  title: string
  severity: string
  class: string
  verdict: string
  poc: string
}

export type PublicResult = {
  severity: string
  class: string
  alertLevel: string
  provisional: boolean
  needsHuman: boolean
  pocStatus: string
  findings: PublicFinding[]
  recommendedAction: string
  tokenCostUsd: number
}

export type AuditStatus =
  | { status: "running"; contractId: string; tier: string; startedAt: string }
  | { status: "done"; contractId: string; tier: string; result: PublicResult }
  | { status: "error"; contractId: string; tier: string; error: string }

/** Start an audit. Returns the requestId to poll, or an error (validation, spend ceiling, unreachable). */
export async function startAudit(
  contractId: string,
  tier: string,
): Promise<{ sessionId: string } | { error: string }> {
  try {
    const res = await fetch(`${WORKER_URL}/audit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contractId, tier }),
    })
    const json = (await res.json()) as { sessionId?: string; error?: string }
    if (!res.ok || !json.sessionId) return { error: json.error ?? `worker returned ${res.status}` }
    return { sessionId: json.sessionId }
  } catch {
    return { error: "worker unreachable" }
  }
}

/** Poll one audit request's status. */
export async function getAuditStatus(sessionId: string): Promise<AuditStatus | { error: string }> {
  try {
    const res = await fetch(`${WORKER_URL}/audit/${encodeURIComponent(sessionId)}`)
    if (!res.ok) return { error: `status ${res.status}` }
    return (await res.json()) as AuditStatus
  } catch {
    return { error: "worker unreachable" }
  }
}

/** Is a worker reachable? Gates whether onboarding runs a real audit or the demo animation. */
export async function workerReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${WORKER_URL}/health`)
    return res.ok
  } catch {
    return false
  }
}
