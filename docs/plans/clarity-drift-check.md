# Plan — check_clarity_drift (knowledge maintenance)

**Status:** low-value, deferred. Was an eve maintenance tool (`agent/tools/check_clarity_drift.ts`,
removed in the gut). The baked baseline still exists: `agent/knowledge/clarity-baseline.ts`.

## Problem
The audit panel reasons about Clarity built-ins (functions/keywords/types) from a baked baseline. If a
Clarity release adds/changes/deprecates built-ins, the baseline silently drifts and the panel reasons
against stale semantics.

## Scope (when picked up)
1. Fetch live Clarity reference (functions/keywords/types) from the canonical docs source.
2. Diff against `agent/knowledge/clarity-baseline.ts` → report NEW / CHANGED / DEPRECATED built-ins.
   Report-only; never auto-edits the baseline (a human updates it).
3. Run it on a monthly schedule (the same host-cron seam as the weekly sweep — Phase 6 TODO).

## Why low priority
Clarity built-ins change rarely; the blast radius of mild staleness is small (the panel reads live
SOURCE, not just the baseline). Pure maintenance — no product or credibility impact. Do it opportunistically
when a Clarity release lands, or fold it into the scheduled-sweep work.

## Dependencies
A docs source for the live reference (WebFetch), the host-cron scheduler (deferred with Phase 6 scheduling).
