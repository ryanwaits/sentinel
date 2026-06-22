import { defineSchedule } from "eve/schedules";

/**
 * Monthly Clarity-drift check. 1st of the month, 09:00 UTC (Vercel Cron).
 * Keeps the Clarity built-in knowledge current (see docs/staying-current.md).
 *
 * Drives check_clarity_drift (live docs vs the baked clarity-baseline.ts). REPORT-ONLY
 * — Vercel's runtime filesystem is read-only, so it summarizes drift for human review
 * and does NOT write agent/knowledge/*.md.
 *
 * Incident-sweep automation is intentionally NOT here — deferred (see docs/backlog.md).
 * Until then, refresh the incident corpus on demand with the Claude Code
 * stacks-hacks-research workflow (research -> adversarial verify -> synthesize).
 */
export default defineSchedule({
  cron: "0 9 1 * *",
  markdown: [
    "Run the monthly Clarity-drift check (see docs/staying-current.md). REPORT-ONLY —",
    "do NOT write files; summarize for human review.",
    "",
    "Call check_clarity_drift. Compare the live functions/keywords/types text against the",
    "returned baseline. Report NEW built-ins, version CHANGES, and any newly deprecated/",
    "removed/disabled entries (with the Clarity version), and note which agent/knowledge",
    "files + clarity-baseline.ts a human should update. Do not claim no drift unless every",
    "baseline entry was confirmed against the live text.",
  ].join("\n"),
});
