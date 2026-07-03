// Types for the public "Scan" teaser — deliberately NOT the `Finding` shape in lib/audit.ts.
// No severity, verdict, or PoC fields: a scan signal is surface area we found via static pattern
// matching, never a verified finding. Keeping the shapes distinct stops a teaser result from ever
// being mistaken for (or rendered like) a real adjudicated finding.

export type ScanDimension = "access-control" | "asset-transfer" | "external-call" | "admin-surface"

export interface ScanSignal {
  label: string
  dimension: ScanDimension
  count: number
  sampleLines: { line: number; text: string }[]
}

export type ScanStatus = "ok" | "not-found" | "invalid-id" | "rate-limited" | "error"

export interface ScanResult {
  contractId: string
  status: ScanStatus
  lineCount: number
  signals: ScanSignal[]
  /** Set (never silently omitted) whenever the result is partial or best-effort. */
  degraded?: string
}

export async function runScan(contractId: string): Promise<ScanResult> {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contractId }),
  })
  if (!res.ok && res.status !== 429) {
    throw new Error(`scan request failed: ${res.status}`)
  }
  return (await res.json()) as ScanResult
}
