# Roadmap

Single source for sequence + status. Phases are ordered by dependency, not date.
Strategy in [business-model.md](./business-model.md); the proof plan in
[validation-sweep.md](./validation-sweep.md); deferred work in [backlog.md](./backlog.md).

Status: ✅ done · 🔵 now · ⏭ next · 🔶 later · 🔁 continuous

---

## Phase 0 — Unblock (now)
| Item | Status | Notes / deps |
|---|---|---|
| Spike: Finding 1 PoC green airgapped | ✅ | `simnet/poc/finding-1.ts` |
| Project docs + auditor knowledge base | ✅ | this session — wired into all subagents |
| AI-Gateway paid credits (live Opus) | ✅ | smoke test passed, no 403 |
| **Commit the session's work** | 🔵 | all uncommitted on `main`; branch first |
| secondlayer API creds (`SECONDLAYER_API_URL`/`_KEY`) | ✅ | live in `.env.local`; verified 2026-07-21 (Index `usage()` OK, tier `build`) |
| Deploy `token-balances` subgraph (`sl`) | 🔵 | **needs you** (auth) |

## Phase 1 — Discovery widening (next)
Spec: [discovery-widening.md](./discovery-widening.md). Rank targets by real $-at-risk.
| Item | Status | Notes / deps |
|---|---|---|
| Unified `asset-holdings` subgraph (FT+NFT+STX) | ⏭ | codeable now; deploy needs Phase 0 creds |
| USD price source decision | ⏭ | **needs you** — curated map (rec) vs DEX-derived vs external |
| `find_value_contracts` rewrite (USD rank + breakdown) | ⏭ | depends on subgraph + price |
| Retire seed fallback for real runs | ⏭ | after the above are green |

## Phase 2 — Validation sweep (the proof)
Plan: [validation-sweep.md](./validation-sweep.md). Validation-first, hand-built PoCs.
| Item | Status | Notes / deps |
|---|---|---|
| Confirm 3–5 real target contract IDs + TVL | ⏭ | **needs you** — archetype-diverse |
| Sweep each: discover → triage → audit → verify → PoC | ⏭ | needs Phase 1 + creds |
| Coordinated whitehat disclosures | ⏭ | no public PoC pre-fix; track responses |
| Capture demand signal + per-sweep token cost | ⏭ | feeds Phase 3 |

## Phase 3 — Decide (gated on validation data)
Don't resolve before Phase 2 evidence. Tracked in [business-model.md](./business-model.md).
| Item | Status | Notes |
|---|---|---|
| Monetization priority (retainer vs one-off vs salvage) | 🔶 | retainer-first is the working default |
| MVP repro depth | 🔶 | informed by hand-built PoC effort |
| Auto-PoC-generation eng bet (go/no-go) | 🔶 | gated on hand-built ROI from Phase 2 |

## Phase 4 — Scale (later)
| Item | Status | Notes |
|---|---|---|
| Retainer product (continuous-monitoring dashboard) | 🔶 | the recurring-revenue motion |
| Auto-PoC generation engine | 🔶 | turns "flagged" into "proven" without a human |
| Wire secondlayer chain-subscription → re-audit | 🔶 | `webhooks/secondlayer-webhook.ts` exists; not wired |
| Multi-chain / self-serve scanner | 🔶 | the real scale story beyond Stacks TAM |

## Continuous — Maintenance
| Item | Status | Notes |
|---|---|---|
| Clarity-drift check (monthly) | 🔁 ⏭ **NOT automated** | was eve schedule + `check_clarity_drift`; **eve gutted** → both the tool (re-add as an engine MCP tool) AND a scheduler are gone. Needs the eval-runner below. |
| Incident-corpus refresh | 🔁 | manual: Claude Code `stacks-hacks-research` workflow; automation in [backlog.md](./backlog.md) |
| Keep `clarity-baseline.ts` in sync with the `.md` docs | 🔁 | see [staying-current.md](./staying-current.md) |

## Platform — Monitoring lanes
Three execution lanes for the monitoring product. See [monitoring.md](./monitoring.md).
| Item | Status | Notes / deps |
|---|---|---|
| **Reactive lane** (webhook push → triage/audit) | ✅ **proven live** | `webhooks/secondlayer-webhook.ts` (:3001) + `/health`; M2–M4 done. 2026-07-21: proven E2E via a real secondlayer **signed** delivery through a cloudflared tunnel → bridge **200** (verified); forged sig → **401** (verify enforced). |
| **Baseline lane** (advisory outflow distributions) | ✅ | `monitoring/baseline.ts`; manual CLI |
| **Invariant lane** (poll → conservation check) | ✅ **alerting** | `monitoring/invariant.ts` (evaluator) + `monitoring/invariant-pipeline.ts` (`runInvariant`/`runInvariantRegistry` → `adjudicate → notify`). Notify egress now HMAC-signed (`signStandardWebhook`). |
| **Scheduled-eval runner** (the poll-lane enabler) | ✅ **built + running** | `monitoring/scheduler.ts` (`runScheduledTick`/`startScheduler`); `sentinel-scheduler` compose service, ticks the invariant registry on `SENTINEL_SCHEDULE_INTERVAL_MS` (default 10m). Drift-check still a planned 2nd job (Tier 4). |

---

## Critical path
Commit → secondlayer creds + subgraph deploy → discovery widening → **validation sweep** → decisions → scale.
Everything before "validation sweep" exists to make that sweep real; everything after is gated on what it tells us.
