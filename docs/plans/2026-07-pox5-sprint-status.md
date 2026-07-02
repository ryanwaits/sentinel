# PoX-5 Sprint — Status / Resume (paused Jul 2, resume ~Jul 8–9)

Companion to [2026-07-pox5-sprint-kickoff.md](./2026-07-pox5-sprint-kickoff.md). Read that for full
context. This is the resume handoff.

## What this is for (one line)
Sales wedge. Publish a pre-activation security review of `pox-5.clar` timed to the SIP-045 vote
(~Jul 10) → open two deals: jBTC one-time audit ($15–40k, runway) + Endowment scoped engagement;
monitoring retainer ($1–3k/mo) later. The brief is a public technical review, NOT product docs.

## Done (Jul 2) — durable, verified green (79/79 tests, typecheck + lint clean)
- **WS1 scope pinned.** Reviewed commit `d78f15a8f37b764e204b65c6faa211ee06ab21ed` on
  stacks-core branch `pox-wf-integration`. 20 print topics + 18 public fns enumerated.
- **WS1 one-way-door analysis — BOTH contracts, code-cited** — in
  `reports/pox-5-pre-activation-review.md`:
  - pox-5.clar: pause-rewards is permanent (no unpause, L484); reserve is write-only (draw fn
    private+uncalled, L2680); early-exit is staker-pinned to registration signer (L1193); two
    disjoint admin keys (L345/L350); tranche accounting T1→reserve→T2 (L2143).
  - signer-manager.clar: admin set can be emptied irreversibly (no floor, L424); fees retroactive
    (L7–11); fee-sweep accounting protects staker principal (L498, verify invariant). Reference
    contract wired to TESTNET addresses — pattern pools fork, not a mainnet artifact.
- **WS4 monitor config DONE** (success criterion #3): `monitoring/pox5-bond-ops.ts` (+ test, 12
  pass) — 25 subs (20 print-topic + 5 admin contract_call, priority-ranked), exercised vs a fake
  contractId. Extended the `SubSpec` seam for `print_event` + contract_call `caller` filter
  (`monitoring/sources/trigger-source.ts`), added `ruleKeyForPrint` (`sub-store.ts`). CLI:
  `bun run pox5:config <id>`.
- **Local-source engine path DONE** (prereq for the run + for jBTC): `SENTINEL_LOCAL_SOURCES`
  registry lets the engine audit pre-deployment `.clar` files via the single seam; reads tagged
  `origin:"local"`. Files: `monitoring/contract-source.ts` (+ test, 5 pass),
  `engine/tools/contract-source.ts`.
- **WS3 sales drafts DONE, not sent** — `docs/sales/pox5-thread-1-jbtc.md`,
  `docs/sales/pox5-thread-2-endowment.md`.

## Pending (do on resume ~Jul 8–9)
1. **[PAID] Run the audit/verify pipeline** over both contracts → fill the findings table.
   Timed to Jul 8–9 to minimize the stale-bytes window (contract changed once already; #7197
   active). Recipe below.
2. **Finish the brief** — paste verified findings into the table; write the web version; then
   publish (forum thread 18862, X, sentinel + secondlayer sites). Target ≤ Jul 10.
3. **Send the two WS3 threads** (after publish — the brief is the proof).

## THE RUN RECIPE (turnkey)
```bash
# 1) Re-pin: fresh clone, note the NEW head SHA (update the report's pinned SHA + pox5-bond-ops.ts).
cd /tmp && rm -rf stacks-core-pox5 && git clone --depth 1 --branch pox-wf-integration \
  https://github.com/stacks-network/stacks-core stacks-core-pox5
git -C /tmp/stacks-core-pox5 rev-parse HEAD

# 2) Build the local-source registry (contractId -> path + ref). Use whatever contractIds you want
#    the report to show (mainnet boot SP000000000000000000002Q6VF78.pox-5 is the eventual id).
cat > /tmp/pox5-sources.json <<'JSON'
{
  "SP000000000000000000002Q6VF78.pox-5": {
    "path": "/tmp/stacks-core-pox5/stackslib/src/chainstate/stacks/boot/pox-5.clar",
    "ref": "<NEW_SHA>"
  },
  "SP000000000000000000002Q6VF78.signer-manager": {
    "path": "/tmp/stacks-core-pox5/contrib/core-contract-tests/contracts/signer-manager.clar",
    "ref": "<NEW_SHA>"
  }
}
JSON

# 3) Run (engine is DIRECT to Anthropic — needs ANTHROPIC_API_KEY from .env.local).
set -a; . ./.env.local; set +a
SENTINEL_LOCAL_SOURCES=/tmp/pox5-sources.json bun run audit SP000000000000000000002Q6VF78.pox-5 deep
SENTINEL_LOCAL_SOURCES=/tmp/pox5-sources.json bun run audit SP000000000000000000002Q6VF78.signer-manager deep
```
Notes: closure fetch also routes through the local registry, so add any dependency contractIds you
want inlined. Clarity-6 parse choke → pipeline falls back to agent reading (expected). Consensus-
coupled findings ship as labeled analysis (simnet can't exercise burnchain semantics); pure-Clarity
findings get an airgapped PoC. Cost ≈ a few $ (vault deep sweep was $0.95/8min; pox-5 is larger).

## Open decisions for the human on resume
- **Fire the run?** (spends credits). Recommended ~Jul 8–9. Confirm first.
- **Is `pox-wf-integration` settled?** If major rewrites still landing, even the done analysis
  needs a refresh at run time. (Unknown as of Jul 2 — check #7197 churn.)
- Re-pin the SHA in BOTH `reports/pox-5-pre-activation-review.md` (header) and
  `monitoring/pox5-bond-ops.ts` (`POX5_REVIEW_SHA` + topic list, if topics changed).

## Working tree (uncommitted as of Jul 2 — nothing committed; commit if you want a checkpoint)
Modified: `engine/tools/contract-source.ts`, `monitoring/contract-source.ts`,
`monitoring/sources/trigger-source.ts`, `monitoring/sub-store.ts`, `package.json`.
New: `docs/plans/2026-07-pox5-sprint-*.md`, `docs/sales/`, `reports/pox-5-pre-activation-review.md`,
`monitoring/pox5-bond-ops.ts`, `monitoring/pox5-bond-ops.test.ts`, `monitoring/contract-source.test.ts`.
