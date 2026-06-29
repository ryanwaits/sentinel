/**
 * adjudicate-run (M4) — the entrypoint that closes the loop: a finished run → verdict → alert.
 *
 * Reads a finished audit run's report + token usage off the durable stream (run-reader), pulls the
 * trigger→session metadata (trigger-state) and the contract's accepted waivers (KB), adjudicates,
 * routes one human-gated alert (notify), and reconciles the reserved spend estimate against the
 * actual cost. M5 / a poller calls `adjudicateSession`; the CLI also adjudicates a local report
 * file for offline/dry runs.
 *
 *   bun run monitoring/adjudicate-run.ts <sessionId>                       # read finished run, adjudicate
 *   bun run monitoring/adjudicate-run.ts <sessionId> --report-file r.md --cost 1.8   # offline
 *   bun run monitoring/adjudicate-run.ts --all                             # every ledgered session
 */
import { readFileSync } from "node:fs";
import { type Adjudication, adjudicate } from "./adjudication";
import { loadRecord } from "./kb";
import { type NotifyResult, notify } from "./notify";
import { readRun } from "./run-reader";
import { reconcile, TIER_ESTIMATE_USD } from "./spend-ceiling";
import { getRecord, listRecords } from "./trigger-state";

export type AdjudicateOutcome = {
  adjudication: Adjudication;
  notifyResult: NotifyResult;
  status: "completed" | "running" | "failed";
};

/**
 * Adjudicate one session. `report`/`costUsd` can be injected (offline/dry); otherwise the finished
 * run is read off the durable stream. Reconciles the reserved estimate against the actual cost.
 */
export async function adjudicateSession(
  sessionId: string,
  opts: { report?: string; costUsd?: number } = {},
): Promise<AdjudicateOutcome> {
  const trigger = getRecord(sessionId);

  let report: string;
  let costUsd: number;
  let status: "completed" | "running" | "failed" = "completed";
  if (opts.report !== undefined) {
    report = opts.report;
    costUsd = opts.costUsd ?? 0;
  } else {
    const run = await readRun(sessionId);
    report = run.report;
    costUsd = run.usage.costUsd;
    status = run.status;
  }

  const contractId = trigger?.contractId ?? "(unknown)";
  const kb = contractId !== "(unknown)" ? loadRecord(contractId) : null;

  const adjudication = adjudicate({
    sessionId,
    contractId,
    report,
    usage: { costUsd },
    waivers: kb?.waivers ?? [],
    trigger,
  });

  // A still-running session has no final report yet — don't alert on a partial.
  if (status === "running") {
    return { adjudication, notifyResult: { sent: false, reason: "run still in progress" }, status };
  }

  const notifyResult = await notify(adjudication);

  // True-up the daily spend accumulator: replace the reserved estimate with the real cost.
  if (trigger && costUsd > 0) reconcile(TIER_ESTIMATE_USD[trigger.tier], costUsd);

  return { adjudication, notifyResult, status };
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const sessionId = argv.find((a) => !a.startsWith("--"));

  if (argv.includes("--all")) {
    const sessions = listRecords().map((r) => r.sessionId);
    if (sessions.length === 0) console.log("no ledgered sessions");
    for (const id of sessions) {
      const out = await adjudicateSession(id);
      console.log(
        `${id}: ${out.adjudication.alertLevel} ${out.adjudication.severity} — ${out.notifyResult.reason}`,
      );
    }
  } else if (sessionId) {
    const reportIdx = argv.indexOf("--report-file");
    const costIdx = argv.indexOf("--cost");
    const opts: { report?: string; costUsd?: number } = {};
    if (reportIdx >= 0) opts.report = readFileSync(argv[reportIdx + 1], "utf8");
    if (costIdx >= 0) opts.costUsd = Number(argv[costIdx + 1]);
    const out = await adjudicateSession(sessionId, opts);
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.error("usage: adjudicate-run.ts <sessionId> [--report-file r.md --cost N] | --all");
    process.exit(1);
  }
}
