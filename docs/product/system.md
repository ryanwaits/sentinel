# Sentinel — the system (canonical spine)

**Source of truth for what the product *is* and the honest status of each part.** One product:
**continuous, audit-informed monitoring** for Stacks smart contracts. The multi-agent **audit engine
is a tiered capability *inside* it**, not a separate product. Everything is **human-gated** — Sentinel
routes intent; a person acts. It never touches mainnet.

Brand/voice: [../PRODUCT.md](../PRODUCT.md). Multi-tenant surface plan: [./README.md](./README.md).
Sequence: [../roadmap.md](../roadmap.md). This doc supersedes the scattered per-layer *status* claims
in those; when they disagree about what's shipped, believe this.

Status key: **shipped** (in prod use) · **built** (works, not in a prod loop) · **partial** · **gap** · **deferred**

---

## The flow, end to end

```
discover ──▶ audit ──▶ verify ──▶ reproduce ──▶ report ──▶ KB ──▶ monitoring config
(rank $)    (tiered   (adversar-  (fork or      (honest    (per-   (derive per-client
            agents)   ial)        airgapped     bug-vs-    client) scope)
                                  PoC)          central.)              │
                                                                       ▼
                              ┌──────────── 3 monitoring lanes ────────────┐
                              │ reactive (webhook) · baseline · invariant  │
                              └──────────────────┬─────────────────────────┘
                                                 ▼
                                   adjudicate ──▶ notify ──▶ human acts
```

The moat is the middle: **monitoring scoped by an actual audit of *your* contracts**, and a finding
that structurally cannot ship without adversarial verification + a green PoC.

---

## Layers

### 1. Discovery — rank what's worth auditing
Find value-holding Clarity contracts, rank by $-at-risk. `engine/discover.ts`.
**shipped**, tested (`discover.test.ts`), Index-based. Gap: hosted subgraph + USD price feed **deferred**
(v2); degraded path emits honest `mode:"seed-stub"`, never a silent stub.

### 2. Audit engine — the tiered capability
Multi-agent, model-tiered (`monitor`=Sonnet/minimal, `deep`=Opus/full panel), via the Claude Agent SDK
direct to Anthropic. `engine/audit.ts` (orchestrator), `engine/findings.ts` (schema),
`engine/tools/{run-simnet-poc,contract-source}.ts` (the in-process Sentinel MCP server).
**shipped**, proven on Hermetica hBTC (real bug found, false positive self-refuted).
Gaps: `audit.ts`/`findings.ts` **untested**; `audit.ts` does not yet auto-select the fork substrate.

### 3. Credibility gates — the moat, in code
`engine/gates.ts` structurally enforces the honesty invariants *before* adjudication: a self-labelled
"confirmed" with no verifier pass is downgraded; a bug at high/critical with no PoC attempt is forced
provisional. **shipped**, tested (`gates.test.ts`). Gap: does not yet record *which* PoC substrate
proved a finding (a fork-green is stronger evidence than an airgapped-green — see layer 4).

### 4. Reproduction — the PoC substrate
Two substrates, chosen per finding, reported so the evidence class is legible:
- **airgapped** (`docker run --network none`, zero egress) — reconstructed contracts, right for logic bugs, safe default for model-authored code.
- **fork** (clarinet `remote_data`) — **unmodified deployed bytecode + real chain state**, pinned height, nothing broadcast. Strictly stronger; only substrate that reproduces state-dependent bugs. Contained by an internal docker network + allowlist egress proxy (`deploy/egress-proxy.ts`); refuses to run without containment.

`engine/tools/run-simnet-poc.ts`, `simnet/`. **shipped** this session, full E2E green.
Gap: `run-simnet-poc.ts` (incl. the fork-refusal branch) and `egress-proxy.ts` **untested**; substrate
not yet threaded into the finding (layer 3).

### 5. Handoff — audit informs monitoring
Finished audit → `KBRecord` → `deriveConfig` → `MonitoringConfig` (per-client scope). Distiller:
`engine/kb-distill.ts`, `engine/distill.ts`; store: `sentinel/kb/`, `monitoring/kb.ts`,
`monitoring/config.ts`. **built + tested** (`kb-distill.test.ts`). Partial: `[SENTINEL-KB]` end-of-audit
auto-emit and class-aware auto-apply are the Phase-1 glue (governance allowlist safe to auto-fill;
counterparty allowlist never is).

### 6. Monitoring — three detection lanes
| Lane | What | File | Status |
|---|---|---|---|
| Reactive | webhook push → prefilter → tiered audit | `webhooks/secondlayer-webhook.ts`, `monitoring/{prefilter,audit-pipeline}.ts` | **shipped**, proven live (signed 200 / forged 401) |
| Baseline | learned outflow distributions, advisory | `monitoring/baseline.ts` | **built** (manual CLI) |
| Invariant | poll → conservation check → alert | `monitoring/{invariant,invariant-pipeline}.ts` | **shipped**, alerting |
| (runner) | cron ticks the invariant registry | `monitoring/scheduler.ts` | **shipped**, running |

All lanes converge: `monitoring/adjudication.ts` (findings-block contract, waiver suppression,
warn-once) → `monitoring/notify.ts` (HMAC-signed egress) → human. Well tested. Disclosure is **never**
automated.

### 7. Backend / deploy
Always-on worker + scheduler; Docker-out-of-Docker so the PoC sandbox runs on the host daemon; the
egress proxy + internal network for fork PoCs. `deploy/`. **shipped** (runs on OrbStack via compose).
Gaps: single-tenant (Postgres + tenancy **deferred**); `egress-proxy.ts` untested; `spend-ceiling.ts`
(money safety) **untested**.

### 8. Front door
Web app (runsentinel.app, Vercel): marketing, onboarding, pricing. `web/`. **shipped** as a site.
Gap: onboarding is a **non-networked mock** — it does not yet enqueue a real audit (Phase-3 surface work).

---

## Known gaps → the punch list

Ordered by risk, not effort. "Articulate first, then fix" — this section is the fix queue.

| # | Gap | Kind | Where | Status |
|---|---|---|---|---|
| 1 | `spend-ceiling.ts` untested (audit-spend guard) | test / money-safety | `monitoring/spend-ceiling.test.ts` | ✅ done |
| 2 | `egress-proxy.ts` untested (security boundary) | test / security | `deploy/egress-proxy.test.ts` | ✅ done (extracted `classifyConnect`) |
| 3 | fork-refusal branch untested | test / security | `engine/tools/run-simnet-poc.test.ts` | ✅ done (extracted `forkPreflight`) |
| 4 | substrate not recorded on findings; a fork-green ≢ airgapped-green downstream | wiring / credibility | `engine/{findings,gates}.ts`, `monitoring/adjudication.ts` | ✅ done (`pocSubstrate`, records-only) |
| 5 | `audit.ts` doesn't auto-select fork for state-dependent findings | enhancement | `engine/audit.ts` | ✅ done (orchestrator step 4) |
| ~~6~~ | ~~`contract-source.ts` "diverging"~~ — **false alarm**: the engine file is a thin tool wrapper over the monitoring reader (proper layering) | — | — | dropped |
| 7 | disclosure output too verbose — polish reads as AI to bounty triage (Hermetica closed #85949 as "AI Report" in 2 min without running the PoC) | product | report generation | ⏭ next |
| 8 | web onboarding is a mock; discovery subgraph/price, Postgres/tenancy | deferred | roadmap Phases 1–3 | 🔶 roadmap |

Batch 1 (items 1–5) shipped: the three safety/credibility tests plus substrate recording +
fork auto-selection. Item 6 was dropped on inspection (no real divergence). Item 7 is the next
target — a real go-to-market constraint from live dogfooding: **the PoC is the credibility engine; the
report should lead with "run this" and stay terse**, not bury a runnable proof under a comprehensive
write-up. Item 8 is the roadmap.

---

## Load-bearing rules (do not regress)
- Human-gated always; never act on-chain; never run exploits against mainnet (repro is sandboxed).
- Every finding adversarially verified **and** green-PoC before it ships (gates enforce this in code).
- Label honestly: real *bug* vs *centralization/trust* assumption.
- Coordinated disclosure; no public PoC before a fix.
- Depend only on published `@secondlayer/*`; indexed data via secondlayer (node RPC on Hiro is fine).
