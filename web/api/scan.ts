// Public "Scan" endpoint — cheap, zero-LLM static read of a Stacks contract's real source. No Agent
// SDK, no subprocess, so it needs no container (unlike engine/audit.ts) and is safe to run as an
// ordinary Vercel Function. See docs plan: the real (paid, multi-agent) audit is a separate, later
// piece gated on the Phase 6 container host — this endpoint never calls it.
import { parseContractId } from "@secondlayer/stacks/utils"
import { isValidContractId } from "../src/lib/stacks-id"
import type { ScanResult } from "../src/lib/scan"
import { runStaticScan } from "./_lib/static-scan"
import { checkRateLimit } from "./_lib/rate-limit"

const NODE_URL = process.env.STACKS_NODE_URL
const MAX_LINES = 2000
const FETCH_TIMEOUT_MS = 5000
const PER_IP_LIMIT = 10
const PLATFORM_LIMIT = 500
const DAY_SECONDS = 24 * 60 * 60

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
}

type FetchOutcome = { ok: true; source: string } | { ok: false; reason: "not-configured" | "not-found" }

/**
 * Node-RPC source fetch, mirroring monitoring/contract-source.ts's node path. Re-implemented (not
 * imported) — that file is root-repo/bun code, not reachable from web/'s separate Vite/Vercel build.
 * STACKS_NODE_URL/Hiro is a spike fallback repo-wide (CLAUDE.md); this inherits that TODO on day one.
 *
 * "not configured" (STACKS_NODE_URL unset) is distinguished from "not found" (a real lookup that
 * came back empty) — conflating them would make a broken deploy look identical to a bad address.
 */
async function fetchSource(contractId: string): Promise<FetchOutcome> {
  if (!NODE_URL) return { ok: false, reason: "not-configured" }
  let address: string
  let contractName: string
  try {
    ;[address, contractName] = parseContractId(contractId)
  } catch {
    return { ok: false, reason: "not-found" }
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${NODE_URL}/v2/contracts/source/${address}/${contractName}`, {
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false, reason: "not-found" }
    const data = (await res.json()) as { source: string }
    return { ok: true, source: data.source }
  } catch {
    return { ok: false, reason: "not-found" }
  } finally {
    clearTimeout(timeout)
  }
}

function json(body: ScanResult): Response {
  const status = body.status === "rate-limited" ? 429 : body.status === "ok" ? 200 : 200
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ contractId: "", status: "error", lineCount: 0, signals: [], degraded: "method not allowed" })
  }

  let contractId = ""
  try {
    const body = (await req.json()) as { contractId?: string }
    contractId = (body.contractId ?? "").trim()
  } catch {
    return json({ contractId: "", status: "invalid-id", lineCount: 0, signals: [] })
  }

  if (!isValidContractId(contractId)) {
    return json({ contractId, status: "invalid-id", lineCount: 0, signals: [] })
  }

  const ip = clientIp(req)
  const [ipLimit, platformLimit] = await Promise.all([
    checkRateLimit(`scan:ip:${ip}`, PER_IP_LIMIT, DAY_SECONDS),
    checkRateLimit("scan:platform", PLATFORM_LIMIT, DAY_SECONDS),
  ])
  if (!ipLimit.allowed || !platformLimit.allowed) {
    return json({ contractId, status: "rate-limited", lineCount: 0, signals: [] })
  }
  const rateLimitDegraded = ipLimit.degraded ?? platformLimit.degraded

  const fetched = await fetchSource(contractId)
  if (!fetched.ok) {
    if (fetched.reason === "not-configured") {
      return json({
        contractId,
        status: "error",
        lineCount: 0,
        signals: [],
        degraded: "STACKS_NODE_URL is not configured — the scan service can't reach a Stacks node",
      })
    }
    return json({ contractId, status: "not-found", lineCount: 0, signals: [], degraded: rateLimitDegraded })
  }

  const lines = fetched.source.split("\n")
  const truncated = lines.length > MAX_LINES
  const scanned = truncated ? lines.slice(0, MAX_LINES).join("\n") : fetched.source
  const signals = runStaticScan(scanned)
  const degraded = truncated ? `source truncated to ${MAX_LINES} lines` : rateLimitDegraded

  return json({ contractId, status: "ok", lineCount: lines.length, signals, degraded })
}
