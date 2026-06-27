/**
 * Durable run reader — retrieve a FINISHED eve run's final report + token usage, by session id,
 * any time after the run completes, with no live connection held during the run.
 *
 * Why this shape (M0 durable-sink spike conclusion):
 *  - eve's event stream is DURABLE and REPLAYABLE. `GET /eve/v1/session/:id/stream?startIndex=0`
 *    re-serves the whole recorded stream from durable storage for a finished session — verified.
 *    (The build-doc premise "SSE degrades to 0 bytes / doesn't replay" was a tooling
 *    misdiagnosis: the external `timeout` command silently drops off PATH and yields 0 bytes;
 *    with `curl --max-time` / fetch the replay is complete. See memory `eve-run-observability`.)
 *  - The two in-process emit hooks the docs point at — channel `events` and agent `hooks/` — do
 *    NOT fire in the headless built server (`node .output/server/index.mjs`): both are
 *    discovered+compiled yet never invoked for the agent turn, with or without a stream
 *    consumer. So eager server-side persistence via those is unavailable here (logged as
 *    eve-feedback). The replayable stream is the authoritative, documented source of truth.
 *
 * The report = the last terminal `message.completed.data.message`. Usage = the sum of
 * `step.completed.data.usage` across the turn. Status from `turn.completed` / `turn.failed` /
 * `session.failed` / `session.waiting`.
 */

import { eveAuthEnabled, mintEveSessionToken } from "./eve-jwt";

const DEFAULT_BASE_URL = process.env.EVE_BASE_URL ?? "http://127.0.0.1:3000";

/** Opus 4.8 token rates (USD per 1M tokens). Cache write = 5-min TTL (1.25x input). */
const RATES = {
  inputPerM: 5.0,
  outputPerM: 25.0,
  cacheReadPerM: 0.5,
  cacheWritePerM: 6.25,
} as const;

export type RunUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  steps: number;
  /** Raw token counts above are authoritative; costUsd is the derived cost meter. */
  costUsd: number;
};

export type RunStatus = "running" | "completed" | "failed";

export type RunResult = {
  sessionId: string;
  status: RunStatus;
  /** Final assistant text = the audit report (last terminal message.completed). */
  report: string;
  usage: RunUsage;
  error?: { code?: string; message?: string };
};

export function computeCostUsd(u: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}): number {
  const c =
    (u.inputTokens * RATES.inputPerM +
      u.outputTokens * RATES.outputPerM +
      u.cacheReadTokens * RATES.cacheReadPerM +
      u.cacheWriteTokens * RATES.cacheWritePerM) /
    1_000_000;
  return Math.round(c * 1_000_000) / 1_000_000;
}

type StreamEvent = { type: string; data?: Record<string, unknown> };

function emptyUsage(): RunUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    steps: 0,
    costUsd: 0,
  };
}

/** Fold an ordered list of stream events into a RunResult. */
export function foldEvents(sessionId: string, events: StreamEvent[]): RunResult {
  const res: RunResult = { sessionId, status: "running", report: "", usage: emptyUsage() };
  for (const ev of events) {
    const d = (ev.data ?? {}) as Record<string, unknown>;
    switch (ev.type) {
      case "message.completed": {
        const m = d.message;
        // Last terminal assistant message wins (finishReason !== "tool-calls"-style narration).
        if (typeof m === "string" && m.trim()) res.report = m;
        break;
      }
      case "step.completed": {
        const u = (d.usage ?? {}) as Record<string, number>;
        res.usage.steps += 1;
        res.usage.inputTokens += u.inputTokens ?? 0;
        res.usage.outputTokens += u.outputTokens ?? 0;
        res.usage.cacheReadTokens += u.cacheReadTokens ?? 0;
        res.usage.cacheWriteTokens += u.cacheWriteTokens ?? 0;
        break;
      }
      case "turn.completed":
        if (res.status !== "failed") res.status = "completed";
        break;
      case "session.waiting":
        // turn parked awaiting next message => the turn finished cleanly.
        if (res.status === "running") res.status = "completed";
        break;
      case "turn.failed":
      case "session.failed":
        res.status = "failed";
        res.error = {
          code: d.code as string | undefined,
          message: d.message as string | undefined,
        };
        break;
    }
  }
  res.usage.costUsd = computeCostUsd(res.usage);
  return res;
}

/**
 * Read a finished run by session id off the durable, replayable event stream.
 * `auth` (optional bearer) is sent once the session endpoint is authed (M0 item 2).
 * `timeoutMs` bounds the read — the stream stays open after `session.waiting`, so we fold
 * what is buffered and return; for a still-running session, status comes back "running".
 */
export async function readRun(
  sessionId: string,
  opts: { baseUrl?: string; auth?: string; timeoutMs?: number } = {},
): Promise<RunResult> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/eve/v1/session/${encodeURIComponent(sessionId)}/stream?startIndex=0`;
  // Auth: explicit token wins; else auto-mint when a session secret is configured.
  const auth = opts.auth ?? (eveAuthEnabled() ? mintEveSessionToken() : undefined);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);
  const events: StreamEvent[] = [];
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: auth ? { authorization: `Bearer ${auth}` } : {},
    });
    if (!resp.ok || !resp.body) {
      throw new Error(`stream read failed: HTTP ${resp.status}`);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let sawTurnBoundary = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      while (true) {
        const nl = buf.indexOf("\n");
        if (nl === -1) break;
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line) as StreamEvent;
          events.push(ev);
          if (
            ev.type === "turn.completed" ||
            ev.type === "session.waiting" ||
            ev.type === "session.failed"
          ) {
            sawTurnBoundary = true;
          }
        } catch {
          // skip a partial/garbled line
        }
      }
      // Once we've folded a terminal turn boundary, the rest of the (still-open) stream is
      // just the park — stop reading rather than block until timeoutMs.
      if (sawTurnBoundary) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") throw err;
  } finally {
    clearTimeout(timer);
  }
  return foldEvents(sessionId, events);
}

// CLI: `bun run monitoring/run-reader.ts <sessionId>` — the external reader, zero SSE held.
if (import.meta.main) {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("usage: bun run monitoring/run-reader.ts <sessionId>");
    process.exit(1);
  }
  readRun(sessionId)
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
    })
    .catch((e) => {
      console.error("read failed:", e);
      process.exit(1);
    });
}
