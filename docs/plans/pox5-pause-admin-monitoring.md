# PoX-5 admin-surface monitoring — plan (pause-rewards focus)

**Written 2026-07-20. Scope doc; implement only #1 inline (approved: clean diff). #2–4 pending approval.**
Companion to the kickoff (`pox5-pause-admin-kickoff.md`). Activation: BTC block **960,230**,
ETA **~Jul 29 late UTC – Jul 30 AM UTC** (tip 958,922 @ Jul 20; ~1,308 blocks / ~9 days out).

---

## Authoritative diff — DONE (item #1, applied)

Diffed prior pin `d78f15a8` → tag **4.0.1** (commit `62e03cc5`, the shipped fork bytes).
Full diff 88 lines. **Topics IDENTICAL; public + private fn sets + arities IDENTICAL;
`signer-manager.clar` byte-identical.** Three real deltas:

1. **`bond-admin` (L348) AND `pause-admin` (L353) init to `SP72DMR3MJKS7RVBY33JVV7EEJSQ1PYDVKDP10FX`**
   — a real single-sig principal (c32 v22), not the boot placeholder. Set by `stacks-core#7416`
   (merged Jul 15, no human review); the `TODO: …predefined multisig for mainnet` comment survives
   directly above it.
2. **`BITCOIN_LOCKTIME_THRESHOLD u500000000` (L88)** + assert `unlock-burn-height < THRESHOLD`
   (L2077, `ERR_INVALID_UNLOCK_HEIGHT` u52) in L1 lockup verification.
3. **Reward-settlement gas refactors** — zero-shares `settle-staker-rewards` skip (L1695); claim-path
   `compute-earned-rewards` recompute (L2536). Same return shapes.

**Applied:** `monitoring/pox5-bond-ops.ts` (`POX5_REVIEW_SHA`→62e03cc5, new `POX5_GENESIS_ADMIN`
const, all fn line refs, header provenance) + `reports/pox-5-pre-activation-review.md` (reviewed-bytes
block, all 5 one-way-door paths' line refs + custody/divergence additions). Test green (12 pass).

---

## Custody dossier — pause-admin key (item #2 research, DONE)

`SP72DMR3MJKS7RVBY33JVV7EEJSQ1PYDVKDP10FX`:
- **Single-sig, live, unattributed.** c32 v22 (not `SM` multisig, not a contract). hash160
  `0e26d303…dbcddc` = unpatterned real-key material (not burn/vanity).
- **Entire history = one ~13-min burst on 2026-07-15** (day #7416 merged, ~2wk pre-fork): funded
  1,000 STX from unlabeled `SP39QDF6…` (which that same day received 763,005 STX from an `SM…`
  multisig), one 1.1-STX nonce-0 liveness send, then parked. **Zero contract deploys/calls ever.**
- **No public custody statement anywhere.** SIP-045 §3.3.1/§5 assigns the circuit-breaker to "the
  Endowment" but names no key/threshold/ceremony; §8.1 trust table has no admin-key row. Release
  notes say only "set initially at 4.0 activation." No rotation commitment, no IR policy located.
- **Spec-vs-impl divergence:** SIP ratified a *per-distribution, delay-window* pause that "cannot
  redirect rewards"; shipped `pause-rewards` is a *global, permanent* halt of all signer claims.

**Blast radius (code-grounded):** `rewards-paused` (L354) is read at exactly one point —
`claim-rewards` L2404 (`asserts! (not (var-get rewards-paused)) ERR_REWARDS_PAUSED` u53), the only
sBTC-egress path. Once paused → all signer claims revert; stakers blocked downstream. Settlement
(`calculate-rewards`, `settle-*`, `claim-staker-rewards-for-signer`) is NOT gated — accounting keeps
running, rewards accrue into the contract, unrecoverable except by hard fork (`transfer-from-reserve`
L2696 + `transfer-stranded-rewards` L2724 both `define-private`, consensus-only). Honest label:
**centralization / governance one-way-door**, not an outsider bug.

---

## Proposed work (pending approval)

### WS-A — Pause-admin alert copy + baseline (item #2)
- **Alert copy** for the 3 P1 admin events (`pause-rewards`, `set-pause-admin`, `set-bond-admin`).
  `pause-rewards` = SEV-CRITICAL, one-way, "all signer sBTC claims now revert; recovery needs a hard
  fork." `set-*-admin` = SEV-HIGH key rotation → include old→new principal from the print payload,
  flag if new admin ∉ known-good set. Delivered via existing ed25519 webhook (`monitoring/notify.ts`).
- **Genesis-admin watch:** pass `POX5_GENESIS_ADMIN` as `adminKeys` to `pox5BondOpsPlan` at
  provisioning → caller-scoped `contract_call` on any fn the key touches (rotation-then-pause via a
  fresh key still trips `set-pause-admin`; the caller watch is defense-in-depth).
- **Who gets paged:** define now (kickoff open item). Proposal: pause-rewards → page + client
  broadcast; set-*-admin → page. (Unresolved: paging target — see below.)

### WS-B — Reserve watch (item #3) — PRIMITIVE SHIPPED 2026-07-20
Built `monitoring/invariant.ts` — the THIRD monitoring lane (poll-and-check), the generic platform
answer to "watch privileged internal money movement that emits no trigger." Pure evaluator
(`evaluateInvariant`, 3 kinds: monotonic / conservation[equal|floor] / delta-explained) + thin impure
reader (`SecondLayerObservationReader`: node `call-read` + `data_var` RPC, Index print sums) behind a
seam. A violation becomes a `Finding` (origin `incident`, verdict `uncertain`) via `violationToFinding`
→ flows through the EXISTING `adjudicateFindings` → `notify` path (reuses warn-once + human-gating; no
parallel alert channel). Degraded reads → `unreadable` findings that PAGE with cause (never a silent
pass). 16 tests; full suite 96 green; CLI `bun run invariant` verified live (correctly `unreadable`
pre-deployment). pox-5 instances wired in `pox5-bond-ops.ts` (`POX5_INVARIANTS`):
- **`pox5-reserve-monotonic`** — `reserve-balance` non-decreasing (data-var read). Any decrease = a
  consensus `transfer-from-reserve` draw. Label: centralization/high.
- **`pox5-sbtc-backing-floor`** — pox-5 sBTC balance ≥ `reserve-balance` (read-only `get-balance` +
  `get-reserve-balance`). A drop below = sBTC left without decrementing the ledger
  (`transfer-stranded-rewards` / exploit). Label: bug/critical.

**Remaining for WS-B:** schedule the eval loop (cron/interval) post-activation; decide poll cadence
(per reward cycle + on each `calculate-rewards` print); optionally add the `delta-explained` instance
once the `claim-rewards` print schema (amount field) lands. Original monitoring approach, for reference:
- **Balance-delta watch** on the boot contract's sBTC holdings: `sl.index.events.list({ eventType:
  "ft_transfer", asset: sbtc, sender OR recipient: boot })` (same path `baseline.ts fetchOutflows`
  already uses). Any sBTC leaving the boot contract that is NOT a matched `claim-rewards` egress =
  page (candidate consensus reserve move or stranded-rewards sweep).
- **Invariant (reserve conservation):** track `get-reserve-balance` (read-only, L3293) vs cumulative
  `reserve-deposit` from `calculate-rewards` prints (topic carries reserve-deposit + T1/T2 tranche
  split). Deviation: on-chain `get-reserve-balance` **decreasing**, or a boot-contract sBTC outflow
  unexplained by summed `claim-rewards` amounts, pages. (Increment-only in reachable code → any
  decrement is by definition consensus/hard-fork and newsworthy.)
- Read-only reads via secondlayer SDK (repo hard rule: no raw Hiro). Poll cadence: per reward cycle
  + on every `calculate-rewards` print.

### WS-C — Activation runbook (item #4)
Sequencing is the risk. **pox-5 has NO node-synthesized events — everything is `print`.** Prod pox-5
print DECODERS are in flight in a separate secondlayer session (not landed). Provisioning before
decoders land = triggers that fire undecoded or never fire.
1. **T-minus (now → activation):** keep config exercised against FAKE id only. Do NOT `applyPlan`
   against `SP000000000000000000002Q6VF78.pox-5` — contract doesn't exist until 960,230. Gate on:
   decoders landed in secondlayer prod (blocking dep).
2. **T-0 (block 960,230 crossed, contract live):** baseline reads. NOTE (resolved from source):
   4.0.1 exposes **only one** read-only getter, `get-reserve-balance` (L3293) — there are **no
   getters for `bond-admin` / `pause-admin` / `rewards-paused`**. Read those three via the raw
   **data-var read** path (node `/v2/data_var/SP000000000000000000002Q6VF78/pox-5/{bond-admin|
   pause-admin|rewards-paused}` → Clarity-serialized value; via secondlayer SDK, not raw Hiro).
   Also read `/v2/pox` `pox_5_sbtc_contract` + `pox_5_sbtc_registry_contract`. Assert the two admin
   vars == `POX5_GENESIS_ADMIN` and `rewards-paused == false` (else state changed pre-observation —
   investigate). Snapshot as the monitoring baseline.
3. **Provision:** `applyPlan` the P1 set first (pause/admin/reserve), then P2 behavioral coverage.
4. **Post-activation smoke check:** confirm first real `stake` print observed end-to-end
   (chain → decoder → trigger → adjudication) before declaring the watch live. Mirrors
   `provisioner.ts smokeTest`.

---

## Unresolved questions

1. **Paging target.** Who receives a `pause-rewards` SEV-CRITICAL — us only, or a client/Endowment
   contact? No retainer client on pox-5 yet. Default: internal page + drafted client-broadcast, human-gated
   (never auto-disclose, per M4).
2. ~~Admin getters~~ **RESOLVED:** 4.0.1 has only `get-reserve-balance`; no getters for the admin
   principals or the paused flag → baseline reads them via the raw data-var read endpoint (folded into
   WS-C T-0 above). No open question remains.
3. **Reserve balance source of truth.** Read-only `get-reserve-balance` vs the contract's actual sBTC
   token balance — do they diverge (e.g. stranded rewards sit in balance but not reserve-balance)?
   Defines which number the conservation invariant watches. → resolve in WS-B build.
4. **Decoder dependency ETA.** WS-C T-0 is hard-blocked on the secondlayer pox-5-decoders session.
   Need its landing date vs the ~9-day activation window. → cross-session sync.
5. **Custody disclosure stance.** Do we privately flag the single-sig-vs-TODO-multisig + unattributed
   custody to the Stacks team pre-activation (whitehat), publish it in the review, or both? Ties to the
   CLAUDE.md open question (whitehat vs competitive). → decide before report publish.
6. **Locktime delta (item #2 in kickoff).** `BITCOIN_LOCKTIME_THRESHOLD` assert — SDK-side lockup-script
   validation lives in secondlayer, not here. Confirm our review report's L1-lockup reasoning (path 3)
   doesn't overstate; no Sentinel code change needed. → note only.
