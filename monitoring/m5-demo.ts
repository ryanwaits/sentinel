/**
 * M5 — the prevention demo, end-to-end on REAL code (no mainnet writes).
 *
 * Narrative: a governance proposal that would drain a vault is caught in its timelock. We trigger a
 * synthetic-but-faithful `execute(proposal)` on the watched CCD002 treasury where the PROPOSAL is
 * the real, deployed, known-vulnerable Zest sBTC vault (audit Finding 1: socialize-debt forces
 * unbounded LP loss). The bridge decodes the proposal principal (proposal-by-indirection), resolves
 * its live closure, dispatches a DEEP audit; the agent fetches the REAL mainnet source, confirms the
 * finding, reproduces it green in the simnet sandbox, and reports. We adjudicate → human-gated WARN,
 * and show the WARN lands far inside `deadline_block` (the timelock window) — the time-guarantee.
 *
 * The webhook is injected in-process via the real bridge `handle()` (full orchestration: decode,
 * closure, pre-filter, budget, tier-route, dispatch, ledger). HMAC verification is the only skipped
 * step — it was proven live in M2. Everything else is the production path.
 *
 *   bun run monitoring/m5-demo.ts          # dry — print the plan, no spend
 *   bun run monitoring/m5-demo.ts --run    # BILLABLE (~$2 Deep sweep). Needs eve server on :3000.
 *
 * Prereqs for --run: eve server up (env loaded incl. EVE_SESSION_SECRET + AI_GATEWAY_API_KEY),
 * STACKS_NODE_URL set. Run reads its own env; this process must share EVE_SESSION_SECRET so the
 * bridge's minted JWT validates.
 */
import { Cl } from "@secondlayer/stacks/clarity";
import { handle } from "../webhooks/secondlayer-webhook";
import { adjudicateSession } from "./adjudicate-run";
import { listRecords } from "./trigger-state";
import { watchRun } from "./watch-run";

const CCD002 = "SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd002-treasury-mia-mining-v3";
const DAO = "SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.base-dao";
const ZEST_VAULT_ADDR = "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7";
const ZEST_VAULT_NAME = "v0-vault-sbtc";
const ZEST_VAULT = `${ZEST_VAULT_ADDR}.${ZEST_VAULT_NAME}`;

const NODE_URL = process.env.STACKS_NODE_URL;
const TIMELOCK_BLOCKS = Number(process.env.SENTINEL_TIMELOCK_BLOCKS ?? 144);

/** Current mainnet tip, so deadline_block (tip + timelock) is realistic. */
async function currentTip(): Promise<number> {
  if (!NODE_URL) return 0;
  try {
    const res = await fetch(`${NODE_URL}/v2/info`);
    const data = (await res.json()) as { stacks_tip_height?: number };
    return data.stacks_tip_height ?? 0;
  } catch {
    return 0;
  }
}

async function main() {
  const run = process.argv.includes("--run");
  const tip = await currentTip();
  const txId = `0xm5demo-${tip}`;

  console.log("=== M5 prevention demo ===");
  console.log(`watched contract : ${CCD002} (governance.execute → Deep)`);
  console.log(`proposal (target): ${ZEST_VAULT}  [real vulnerable mainnet vault — Finding 1]`);
  console.log(
    `trigger block    : ${tip}   deadline_block: ${tip ? tip + TIMELOCK_BLOCKS : "n/a"} (timelock ${TIMELOCK_BLOCKS})`,
  );
  if (!run) {
    console.log(
      "\n(dry run — re-run with --run to fire the BILLABLE Deep audit; needs eve server on :3000)",
    );
    return;
  }

  // execute(proposal <principal>, sender <principal>) — arg[0] is the proposal the bridge decodes.
  const event = {
    contract_id: CCD002,
    function_name: "execute",
    sender: DAO,
    function_args: [
      Cl.serialize(Cl.contractPrincipal(ZEST_VAULT_ADDR, ZEST_VAULT_NAME)),
      Cl.serialize(Cl.standardPrincipal(DAO)),
    ],
  };
  const req = new Request("http://localhost/m5", {
    method: "POST",
    headers: { "content-type": "application/json", "webhook-id": txId },
    body: JSON.stringify({ action: "apply", tx_id: txId, block_height: tip, event }),
  });

  const t0 = Date.now();
  const res = await handle(req);
  console.log(`\n[trigger] bridge → ${res.status} (${await res.text()})`);
  if (res.status !== 202) {
    console.error("dispatch did not queue — aborting demo");
    process.exit(1);
  }

  const record = listRecords().find((r) => r.txId === txId);
  if (!record) {
    console.error("no trigger ledger record — sessionId not captured");
    process.exit(1);
  }
  console.log(
    `[trigger] session ${record.sessionId} | tier ${record.tier} | targets ${record.auditTargets.length} | deadline_block ${record.deadlineBlock}`,
  );

  console.log("[watch] polling the run to completion (Deep sweep — minutes)...");
  const result = await watchRun(record.sessionId, { timeoutMs: 25 * 60 * 1000 });
  const elapsedMin = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`[watch] ${result.status} after ${elapsedMin} min | $${result.usage.costUsd}`);

  const out = await adjudicateSession(record.sessionId, {
    report: result.report,
    costUsd: result.usage.costUsd,
  });
  const a = out.adjudication;
  console.log("\n=== ADJUDICATION ===");
  console.log(
    `alert: ${a.alertLevel.toUpperCase()} | severity ${a.severity} | class ${a.class} | poc ${a.pocStatus}`,
  );
  console.log(
    `kept findings: ${
      a.findings
        .filter((f) => f.kept)
        .map((f) => f.title)
        .join("; ") || "(none)"
    }`,
  );
  console.log(`suppressed   : ${a.suppressed.join("; ") || "(none)"}`);
  console.log(
    `notify       : ${out.notifyResult.sent ? out.notifyResult.level : "not sent"} — ${out.notifyResult.reason}`,
  );

  // Time-guarantee: a Deep sweep takes minutes ⇒ ~0–2 blocks elapse, far inside the timelock window.
  const blocksElapsed = Math.ceil((Date.now() - t0) / 60000 / 10); // ~10 min/block
  console.log("\n=== TIME-GUARANTEE ===");
  console.log(
    `WARN at ~block ${tip + blocksElapsed} of deadline ${record.deadlineBlock} → ${tip + blocksElapsed < (record.deadlineBlock ?? Infinity) ? "INSIDE the timelock ✅" : "MISSED ❌"} (${elapsedMin} min, ~${blocksElapsed} blocks vs ${TIMELOCK_BLOCKS})`,
  );
}

main();
