import { defineSchedule } from "eve/schedules";

/**
 * Weekly asset-safety sweep. On Vercel this becomes a Vercel Cron Job (UTC).
 * Mon 09:00 UTC. Fire-and-forget markdown form — the agent drives the pipeline
 * via its tools/subagents and logs results. (A `run` handler can later route the
 * report to Slack/Linear via receive().)
 */
export default defineSchedule({
  cron: "0 9 * * 1",
  markdown:
    "Run the weekly asset-safety sweep: call find_value_contracts to get the top TVL targets, audit each via the auditor-* subagents, adversarially verify findings with the verifier, reproduce every confirmed high/critical with run_simnet_poc, and summarize confirmed findings (with PoC status) for review.",
});
