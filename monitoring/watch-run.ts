/**
 * Watch a dispatched audit run to completion, then (optionally) adjudicate it.
 *
 * The bridge dispatches asynchronously; this is the seam that knows WHEN a run finished so the loop
 * can close. It polls the durable, replayable stream (run-reader) until the turn reaches a terminal
 * boundary (completed/failed) or a timeout, then returns the final RunResult. A production poller /
 * the M5 demo call `watchRun` and hand the result to adjudicate-run.
 *
 *   bun run monitoring/watch-run.ts <sessionId>               # watch, print final status
 *   bun run monitoring/watch-run.ts <sessionId> --adjudicate  # watch then adjudicate + notify
 */
import { adjudicateSession } from "./adjudicate-run";
import { type RunResult, readRun } from "./run-reader";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll until the run leaves "running" (or timeout); returns the last-known result regardless. */
export async function watchRun(
  sessionId: string,
  opts: { baseUrl?: string; intervalMs?: number; timeoutMs?: number } = {},
): Promise<RunResult> {
  const intervalMs = opts.intervalMs ?? 5000;
  const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60 * 1000);
  let last = await readRun(sessionId, { baseUrl: opts.baseUrl, timeoutMs: 8000 });
  while (last.status === "running" && Date.now() < deadline) {
    await sleep(intervalMs);
    last = await readRun(sessionId, { baseUrl: opts.baseUrl, timeoutMs: 8000 });
  }
  return last;
}

if (import.meta.main) {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("usage: watch-run.ts <sessionId> [--adjudicate]");
    process.exit(1);
  }
  const run = await watchRun(sessionId);
  console.log(
    `[watch] ${sessionId}: ${run.status} | $${run.usage.costUsd} | ${run.report.length} chars`,
  );
  if (process.argv.includes("--adjudicate") && run.status !== "running") {
    const out = await adjudicateSession(sessionId, {
      report: run.report,
      costUsd: run.usage.costUsd,
    });
    console.log(
      `[watch] adjudicated: ${out.adjudication.alertLevel} ${out.adjudication.severity} — ${out.notifyResult.reason}`,
    );
  }
}
