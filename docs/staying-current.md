# Staying Current — Clarity docs & incident knowledge

The auditor knowledge base (`agent/knowledge/`) is only as good as it is fresh.
This is the process to keep it in sync with Clarity's evolving surface and newly
documented Stacks incidents.

## What must stay current
| File | Source of truth | Refresh trigger |
|---|---|---|
| `clarity-functions.md` | docs.stacks.co/reference/clarity (functions) | every Clarity version / Stacks epoch |
| `clarity-semantics.md` | same + SIPs | new SIP changing semantics (e.g. SIP-042 disabled `at-block`) |
| `clarity-keywords-types.md` | docs.stacks.co/reference/clarity (keywords, types) | Clarity version bump |
| `stacks-incidents.md` | post-mortems, audit reports, security news | new disclosed incident |

## Why it matters (live examples already captured)
- **Clarity 4** added `as-contract?`, `restrict-assets?`, `with-*` allowances,
  `contract-hash?`, `secp256r1-verify`, `to-ascii?` — new asset-safety surface to
  audit; deprecated `as-contract`.
- **Epoch 3.4 (SIP-042)** disabled `at-block` — any contract reaching it now errors.
- **Clarity 3** removed `get-block-info?` → `get-stacks-block-info?` /
  `get-tenure-info?`.
Auditing against stale built-in knowledge → false positives (flagging valid C4
patterns) and false negatives (missing new footguns).

## Refresh procedure
1. **Clarity docs:** re-fetch the functions/keywords/types pages; diff against the
   knowledge files; update entries + version tags; record the change in commit msg.
2. **Incidents:** re-run the research workflow (see below); adversarially verify new
   incidents (require credible sources); append confirmed ones with their
   audit-dimension mapping + detection heuristic.
3. After any update, confirm the per-dimension `§` references in the auditor
   `instructions.md` files still point at the right sections.

## Automation hooks
- **Clarity drift (live):** `agent/schedules/monthly-knowledge-refresh.ts` (cron
  `0 9 1 * *`) runs the monthly drift check autonomously via `check_clarity_drift`
  (live docs vs `clarity-baseline.ts`). Needs AI-Gateway paid credits (funded).
  **REPORT-ONLY** — Vercel's runtime filesystem is read-only, so it summarizes drift
  for human review and does NOT write `agent/knowledge/*.md`.
- **Incident sweep (manual):** automation is deferred (see [backlog.md](./backlog.md)).
  Refresh the incident corpus on demand with the Claude Code `stacks-hacks-research`
  workflow (`research → adversarial verify → synthesize`) — it regenerates
  `stacks-incidents.md` + `clarity-keywords-types.md` with sources, no gateway needed.
- **Apply step (human / Claude Code):** when the drift report flags changes, update the
  `agent/knowledge/*.md` files AND `agent/knowledge/clarity-baseline.ts` together.
- **Baseline sync rule:** any edit to `clarity-functions.md` / `clarity-keywords-types.md`
  must be mirrored in `clarity-baseline.ts`, or the drift tool will re-flag the change
  every month.

## Honesty rule (carried from the audit guardrails)
Never pad `stacks-incidents.md` with unverified or plausible-but-unsourced hacks.
Classify every incident honestly: **logic-bug** (a Clarity flaw our tool can catch)
vs **key-compromise / centralization / economic / oracle** (often NOT a contract
logic bug). Most Stacks losses historically are the latter — say so.
