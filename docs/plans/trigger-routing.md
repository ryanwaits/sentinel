# Plan — trigger routing: audit-new-code (Type 1) vs incident-triage (Type 2)

**Status:** CODE COMPLETE (MVP). Done: PRODUCER (94f2dc4 — audit generates the scope), transfer-sub
provisioning (76842de — `trigger.ftTransfer`/`stxTransfer`), and CONSUMER (9ee7547 —
`monitoring/incident-triage.ts` deterministic correlation + the bridge transfer-event branch +
counterparty.new Type-2 fork; Type-1 audit path unchanged). The "re-audit unchanged live code on a
behavioral event" bug is closed: behavioral triggers now triage, never re-audit.

REMAINING (not MVP code): (1) verify the exact secondlayer transfer **webhook payload field-names** on the
first real ft/stx_transfer delivery (the triage logic + bridge mapping are built/tested to the documented
shape — `{type, sender, asset_identifier?, amount, recipient}`); (2) threshold TUNING needs a real flow
profile (untuned → fail-safe-triaged); (3) FOLLOW-ONs: agent correlation pass, learned behavioral baseline,
confidence-gated alertLevel, deterministic precondition matching (see audit-informed-monitoring.md).

## Problem
`monitoring/audit-pipeline.ts` `runTrigger` sends **every** notable trigger to `audit()` — the full
multi-agent code audit. That's right for *some* triggers and wrong for others, because two
fundamentally different events both pass the pre-filter:

- A **governance proposal** is *new code* about to execute → auditing it is the whole point.
- A **large outflow** is *runtime behavior on already-deployed, unchanged code* → re-auditing the same
  bytecode yields the same findings. There is nothing new to audit. The right response is incident
  triage + alert, not a code audit.

Re-auditing unchanged live code on a behavioral event is wasted spend and the wrong mental model.

## The two trigger classes + correct response

### Type 1 — new code entering a timelocked window  → AUDIT the new code
Classes: `governance.proposal_submitted`, `governance.proxy_upgrade` (new impl/extension).
- Target = the **incoming code** (`directive.proposal_target` / the new implementation), **not** the
  live watched contract.
- Pre-execution: there's a timelock window (`deadlineBlock = block + timelock`) → a verdict before it
  elapses lets a human veto/exit. This is the prevention killer-app.
- Run the full engine, KB-informed, with a green PoC. **Already works** for `proposal_submitted`
  (the bridge audits `proposal_target`); generalize to upgrades.

### Type 2 — runtime behavior on unchanged code  → INCIDENT TRIAGE (no re-audit)
Classes: `transfer.outflow`, `counterparty.new` (anomaly/behavioral).
- The code didn't change → do **not** run the code-audit panel.
- Instead correlate the event against what we already know:
  1. **Known-finding match** — does this event exercise a path the audit flagged? (e.g. an outflow via
     `socialize-debt` = the unbounded-LP-loss bug → "possible **exploitation** of Finding X").
  2. **Behavioral baseline** — anomalous size / frequency / counterparty vs the KB baseline?
  3. **Value-at-risk** — how much, to whom, reversible?
- Lighter than an audit: mostly **deterministic** (threshold + new-counterparty + known-finding match)
  with an optional **cheap single-agent correlation pass** over `{event, recent txs, KB findings}`.
  Emits the same `Finding`/`Adjudication` shape so `notify` is unchanged.

Both paths → `adjudicate` → human-gated alert. Type 1 WARN = "veto proposal before block N"; Type 2
WARN = "possible exploitation of Finding X / anomalous Y% outflow to a new counterparty".

## What changes
- `monitoring/audit-pipeline.ts` `runTrigger`: branch on trigger class → `audit(newCode, …)` (Type 1)
  vs `triage(ctx, kb)` (Type 2).
- New `monitoring/triage.ts`: `triage(ctx, kb)` → correlation/anomaly verdict (reusing `Finding`).
  MVP deterministic; optional cheap agent pass behind a flag.
- `engine/audit` unchanged; the bridge already decodes `proposal_target` + a `suspicious` flag — pass
  through. Type 1 just keeps using `audit()`.
- KB gains a **behavioral baseline** eventually (windowed outflow-rate / counterparty set) for richer
  anomaly detection; MVP triage works off threshold + known-finding match + new-counterparty.

## Note
Re-auditing live code IS valid in exactly one case: the code **changed** (an upgradeable contract drifted
from what was audited) — but that collapses into Type 1 (detect change → audit the new code). So the rule
holds: audit only when there's new/changed code; everything else is triage.

## Trigger to start
Near-term, before a real client's contracts generate behavioral traffic. Sequence after the first
persistent deploy; pairs naturally with the KB behavioral-baseline work.
