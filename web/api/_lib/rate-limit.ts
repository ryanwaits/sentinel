// Minimal fixed-window rate limiter over the Upstash Redis REST API (no SDK dependency — two plain
// fetch calls). Vercel Functions are multi-instance/stateless per invocation, so this must be an
// external store, not an in-memory counter.
//
// Fails OPEN (allowed: true) when Upstash isn't configured or the check itself errors, but always
// says so via `degraded` — never silently pretend a request was capped when it wasn't.
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

export interface RateLimitResult {
  allowed: boolean
  degraded?: string
}

async function upstash(path: string): Promise<{ result: number }> {
  const res = await fetch(`${UPSTASH_URL}/${path}`, {
    headers: { authorization: `Bearer ${UPSTASH_TOKEN}` },
  })
  if (!res.ok) throw new Error(`upstash ${path} failed: ${res.status}`)
  return (await res.json()) as { result: number }
}

/** INCR a fixed-window counter for `key`; allowed while count <= limit within windowSeconds. */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return { allowed: true, degraded: "rate limiting unavailable (no KV configured) — request allowed uncapped" }
  }
  try {
    const { result: count } = await upstash(`incr/${encodeURIComponent(key)}`)
    if (count === 1) await upstash(`expire/${encodeURIComponent(key)}/${windowSeconds}`)
    return { allowed: count <= limit }
  } catch {
    return { allowed: true, degraded: "rate limit check failed — request allowed uncapped" }
  }
}
