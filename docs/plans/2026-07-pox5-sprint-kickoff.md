# Sprint Kickoff — PoX-5 Institutional Wedge (Jul 2–16, 2026)

Handoff doc. Full context included; assume no prior conversation. Source: secondlayer ultracode
strategy audit (Jul 1, 2026) — 33-agent workflow, adversarially verified. This sprint is
**Focus 2** of that strategy: audit-sentinel is the only artifact in the portfolio shaped like a
>$1k/mo contract; PoX-5 is the timing hook.

## Why now (ecosystem state, verified Jul 1)

- **SIP-045 "Bitcoin Staking" (PoX-5)** — stacksgov/sips **PR #270** (V2 markdown; the
  stacks.link/sip-pox5 PDF is the older V1). Status: Accepted draft, **community vote Jul 1–10
  (OPEN NOW)**, target hard fork **~Jul 29, 2026** (Epoch 4.0). The earlier 500 STX boost was
  removed ~Jun 12 after community pushback; long-term coinbase restored to 1,000 STX; sBTC-injection
  replaced dynamic issuance.
- **SIP-044 "Clarity 6"** — PR #267, Accepted Jun 26. New builtins: `get-bitcoin-tx-output?`,
  `verify-merkle-proof`, `ed25519-verify`, enhanced `get-burn-block-info?`, variadic `concat`.
  Post-conditions moved INTO SIP-045 (§3.4.3): two new PC wire types **0x03 Staking / 0x04 Pox**
  (condition codes 0x30/0x31/0x32) gating stake / register-for-bond / unstake /
  announce-l1-early-exit.
- **Implementation ahead of governance**: stacks-core PR #6908 merged (PoX-5 initial impl),
  umbrella "WIP: PoX-5 and Epoch 4" PR #7197 active. Contracts live on branch
  `pox-wf-integration`: **`pox-5.clar` (~3,829 lines, Clarity 6, replaces pox-4, auto-deploys at
  Epoch 4.0)** + reference **`signer-manager.clar`** for pools. ~20 print-event topics. Public fns
  incl. `setup-bond`, `register-for-bond`, `update-*`, `announce-l1-early-exit`, `pause-rewards`,
  admin setters. SPV proofs of the L1 time-lock land in `register-for-bond` print args — bond
  eligibility is provable Stacks-side, **no Bitcoin indexer needed**.
- **Mechanism**: BTC stays time-locked on Bitcoin L1 under holder keys; protocol bonds pair BTC
  with STX collateral; two-tranche yield (T1 fixed BTC-staker yield funded first, T2 residual for
  STX-only). Early Exit ~10 min. No slashing.
- **Demand**: UTXO Management (NASDAQ: NAKA) confirmed inaugural staker. jBTC LST publicly building
  on Tranche 1 and asking for risk data (forum thread 18834, user Rapha23). Xverse Earn 7k+
  stackers. Counter-signal: sBTC TVL fell 4,504→2,945 BTC YTD — institutional follow-through
  unproven; that's why pricing below is one-time-fee first, retainer later.

## One-way-door risks already identified (seed the review with these)

From the accepted draft — verify each against actual `pox-5.clar` code, they are the brief's spine:
1. **`pause-rewards` appears permanent/irreversible** — is there any unpause path? Who can call it?
2. **Reserve draw requires a hard fork** — reserve accounting/depletion paths in-contract.
3. **Early-exit signer set undefined** — who signs the L1 early-exit release? What happens if the
   signer set at exit time ≠ set at bond registration?
4. Admin paths: `set-*-admin` setters — enumerate what each admin can do unilaterally.
5. Tranche accounting: where T1/T2 yields are computed/recorded; rounding/ordering exploits;
   coverage-ratio + reserve-fund tracking is IN the contract (§3.6.1) — check its failure modes.

## Sprint goal

Ship a published pre-activation security review of `pox-5.clar` + `signer-manager.clar` timed to
vote close (**~Jul 10 — 8 days out**), and open exactly two sales threads off the back of it.
One confirmed finding on a consensus boot contract is ecosystem news; **zero findings is still a
credibility asset** ("we reviewed the contract institutions are about to lock BTC against").

## Workstreams

### WS1 — Review (days 1–6)
- Pull `pox-5.clar` + `signer-manager.clar` from stacks-core branch `pox-wf-integration`; pin the
  commit SHA in the report (contract already changed once — boost removal — and may change again;
  the brief must state exactly what bytes were reviewed).
- Read SIP-045 PR #270 V2 markdown as spec; diff spec vs implementation.
- Run the existing discover→audit→verify pipeline over both contracts + manual/agent deep-read of
  the five one-way-door paths above.
- **Constraint (adversarially verified): simnet CANNOT exercise burnchain-coupled consensus
  semantics** (reward cycles, burn-block ops, epoch transitions). Airgapped PoC repro
  (finding-1-style) only works for pure-Clarity findings (auth, arithmetic, state-machine).
  Consensus-coupled findings ship as reasoned analysis with code cites, clearly labeled — do NOT
  block the brief on repro. Check whether `@stacks/clarinet-sdk` has an Epoch-4.0/Clarity-6 devnet
  yet (Clarinet 3.21 reportedly does); if not, that alone justifies the analysis-only label.
- Clarity 6 wrinkle: both contracts use Clarity 6 builtins. If any sentinel tooling chokes on
  parsing them, fall back to agent reading — do not build a parser this sprint.

### WS2 — Brief (days 5–8, publish ~Jul 10)
- Format: third sentinel report, `reports/pox-5-pre-activation-review.md` + web version. Same voice
  as the two published reports.
- Structure: scope + pinned SHA → findings (severity-ranked) → one-way-door analysis (the 5 paths,
  even where no bug — "here is what governance is committing to") → what we'd monitor post-
  activation (teaser for the retainer).
- Neutral tone on the SIP itself — we review code, we don't take a side in the vote. The Endowment
  is a sales target; do not editorialize on monetary policy or the SIP-031 unlock controversy.
- Distribution: forum reply on thread 18862, X thread, link from sentinel + secondlayer sites.
  "Powered by secondlayer" credit line stays.

### WS3 — Sales (days 6–10, threads open before/at publish)
Exactly two threads, both referencing the brief:
1. **jBTC** (Rapha23, forum 18834) — they're building an LST on Tranche 1 and publicly asked for
   risk data. Pitch: fixed-scope audit of THEIR contracts (LST wrapper + signer-manager integration).
   **One-time project fee $15–40k** — runway, not MRR; do not discount into a retainer upfront.
2. **Stacks Endowment** (vip@stacksendowment.co) — pitch: independent pre-activation review already
   done (the brief is the proof), offer scoped engagement on the bootstrap-phase operational risks
   (they manually manage coverage during the ~12-month bootstrap).
Conversion path (post-activation, Q4 2026+): monitoring retainer **$1–3k/mo** — exit-intent +
admin-action alerting on live bonds. Sell only after testnet deploy exists.
Billing: plain Stripe invoice from sentinel for the anchor deal. Do NOT wire through the
secondlayer platform billing stack until there's repeat volume.

### WS4 — Monitoring stub (days 8–10, config only, NO deploy)
Write the provisioning config for a "PoX-5 bond ops" monitor using secondlayer subscription
triggers, exercised against a fake contractId until testnet exists:
- `print_event` trigger: `contractId=<pox-5 boot address>`, per-topic (~20 topics; priority:
  early-exit announce, pause, admin changes, reserve movements).
- `contract_call` trigger: `contractId` + `functionName` filters on `pause-rewards`,
  `set-*-admin`, `announce-l1-early-exit`; `caller` filter for admin-key watch.
Both trigger types are LIVE in secondlayer prod today (`packages/shared/src/schemas/subscriptions.ts`
— print_event: contractId/topic/trait; contract_call: contractId/functionName/caller). ed25519-signed
webhook delivery already handled by existing `webhooks/` + `monitoring/` machinery.

## Explicitly OUT of scope (adversarially refuted — do not build)

- **L1 UTXO spend-watcher** (watch the actual Bitcoin time-locks): 2–5 wk new infra; SPV proofs in
  `register-for-bond` prints cover eligibility. Build only customer-funded (phase 2 of a retainer).
- **Mempool watch**: no mempool trigger type exists in secondlayer; don't promise it in sales copy.
- **Coverage-ratio telemetry as a product**: contract exposes the ratio itself; no pre-activation
  buyer; decays with bootstrap. Free-data territory (secondlayer Focus 3), not sentinel's.
- **Custodian NAV/attestation feed**: needs price feeds + SLA machinery that don't exist. LOI first.
- **Adjudicating the SIP-031 unlock allegations**: poisons the Endowment thread. Stay out.

## secondlayer prereqs (answer: none block THIS sprint)

| Prereq | Blocks | Status / owner |
|---|---|---|
| None — review, brief, sales need zero secondlayer changes | this sprint | — |
| **Published `@secondlayer/stacks` patch**: `readPostConditions` (`packages/stacks/src/transactions/wire/deserialize.ts:140-175`) has no default case — an unknown PC asset-type byte (0x03/0x04) silently misaligns the tx reader. Fix + `ClarityVersion.Clarity6` enum + 0x03/0x04 PC ser/de, then **publish** (sentinel pins published packages) | post-fork tx decoding in monitoring (WS4 goes live) | secondlayer Gate 0 — in flight, due well before ~Jul 29 fork |
| Typed `pox5_*` webhook triggers | nothing — generic print_event/contract_call triggers suffice | secondlayer Gate 2 (only if vote passes); nice-to-have |
| `/v1/index` pox-5 bond endpoints | nothing this sprint; would enrich retainer dashboards later | secondlayer Gate 2 |

External (non-secondlayer) blockers: Vercel AI Gateway credits for Opus (known from README smoke
test); `@stacks/clarinet-sdk` Epoch-4 support for any PoC repro (check, don't wait).

## Success criteria

1. Brief published ≤ Jul 10 with pinned commit SHA, ≥1 substantive one-way-door analysis per path.
2. Both sales threads opened with a concrete scoped offer + price.
3. WS4 monitor config committed and unit-tested against fixture events (no live deploy).
4. Zero scope creep into the OUT list.

## Day-1 commands

```bash
git clone --depth 1 --branch pox-wf-integration https://github.com/stacks-network/stacks-core /tmp/stacks-core-pox5
find /tmp/stacks-core-pox5 -name "pox-5.clar" -o -name "signer-manager.clar"
gh pr view 270 --repo stacksgov/sips          # SIP-045 V2 spec
gh pr view 7197 --repo stacks-network/stacks-core  # Epoch 4 umbrella — track contract churn
```
