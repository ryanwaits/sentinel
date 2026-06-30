# ADR: replace eve with the Claude Agent SDK (drop Vercel AI Gateway)

**Status:** proposed (spike-validated 2026-06-29). **Supersedes** the eve-runtime assumptions in
[backend-architecture.md](./backend-architecture.md) and the eve pins in the root CLAUDE.md.

## Decision
Gut **eve 0.12** as the execution substrate and run the agent on
**`@anthropic-ai/claude-agent-sdk`** talking **direct to Anthropic** (`ANTHROPIC_API_KEY`). Drop the
Vercel AI Gateway. Keep ~all of `monitoring/*`, the subagent instructions, the simnet sandbox, and
the secondlayer integration.

## Why (evidence)
The spike ([[agent-sdk-vs-eve-spike]], `spike/`) ran the **same audit** (real Zest vault) on both:

| | eve (Vercel AI Gateway) | Claude Agent SDK (direct) |
|---|---|---|
| completion | never — ~1 step/15-20min, 3× 25-min timeouts | ✅ 8.4 min (Sonnet, minimal panel) |
| cost | unmeasurable | $0.95, exact |
| observability | broken (run-reader 0 steps on long runs) | native — `result` has cost/usage/turns/duration/ttft |
| findings | never captured | 7, validated `structured_output`, adversarially verified |

Root cause was **eve's headless orchestration overhead**, not Vercel and not the gateway (raw gateway
calls are 1–6s). So the lever is *drop eve*; the gateway goes with it.

## Mapping: what eve provided → Agent SDK
| eve concept | Agent SDK replacement | Status |
|---|---|---|
| `defineAgent` + 9 subagents | `query()` + `options.agents` (AgentDefinition) | ✅ proven in spike |
| 4 tools (`fetch_contract_source`, …) | `createSdkMcpServer` + `tool()` (in-process MCP) | ✅ proven (wraps existing `monitoring/contract-source.ts`) |
| durable replayable stream + `run-reader`/`watch-run` | the `result` message (cost/usage/turns) + `listSessions`/`getSessionMessages`/`sessionStore` | ✅ native — **the M5 observability gap disappears** |
| `[SENTINEL-FINDINGS]` text block + `adjudication.extractFindings` | `outputFormat: {json_schema}` → `result.structured_output` | ✅ proven — drop the text-parse path |
| channels (HTTP ingress) | a plain HTTP handler calling `query()` — the existing `webhooks/secondlayer-webhook.ts` bridge, repointed | small change |
| schedules (Vercel Cron) | host cron / Vercel Cron → a script that calls `query()` | small |
| sandbox (`docker()` for `run_simnet_poc`) | **our own** docker sandbox, exposed as an MCP `run_simnet_poc` tool (Agent SDK bundles no sandbox) | ⚠️ must build (the one real gap) |
| spend ceiling (reserve-at-dispatch) | keep `monitoring/spend-ceiling.ts`; reconcile with the now-native `result.total_cost_usd` | reuse |
| eve-jwt session auth | keep our own HMAC/JWT on the inbound HTTP endpoint | reuse |

## Reused unchanged (the value is here, not in eve)
`monitoring/`: config, kb/deriveConfig, closure, contract-source, prefilter, directive, trigger-state,
adjudication, notify, spend-ceiling. `agent/subagents/*/instructions.md` + `agent/knowledge/`. The
simnet sandbox (`simnet/`, `run_simnet_poc`). `webhooks/secondlayer-webhook.ts` (repointed). All the
secondlayer provisioning (M2) + bridge logic (M3) + adjudication (M4) stand.

## Deleted
`eve` dep + `.output` build + `agent/channels/eve.ts` + `agent/agent.ts` (defineAgent) + `eve.config`;
`monitoring/run-reader.ts` + `watch-run.ts` (observability now native); the Vercel AI Gateway +
`AI_GATEWAY_API_KEY`; the eve-driven version pins (`ai@7.0.0-beta.178` override; eve's Node-24 floor —
keep Node ≥ a sane LTS for the SDK; zod v4 stays, it's fine).

## Hosting — the real consideration (and where "get off Vercel" is genuinely right)
`query()` **spawns the bundled `claude` CLI as a subprocess**. That runs cleanly on a long-running
Node host/container; it does **not** fit Vercel serverless functions (no long-lived subprocess, 1M-token
sweeps blow the function duration ceiling — the M5 wall in another form). So the substrate swap pushes
hosting toward a **container** (Fly/Railway/Render/own VM) for the agent worker — which is the correct
reason to leave Vercel, distinct from the gateway. The inbound bridge + outbound alert can stay thin
(any host); the audit worker wants a container.

## Channels — Claude Tag is NOT this
- **Inbound** (chain event → audit): own HTTP endpoint (the bridge) → `query()`. No Claude Tag.
- **Outbound** (M4 WARN, human-gated): Slack incoming webhook / PagerDuty. No Claude Tag.
- **Claude Tag** = an Anthropic-hosted Slack app (`@Claude` mentions, hosted sandbox) — a *human-in-Slack
  on-demand* surface, not a programmable channel and not an Agent SDK component. Possible **later**
  surface for "@Claude audit <contractId>" but it runs Anthropic's hosted agent, not our pipeline.

## Phased plan
1. ✅ **DONE — `engine/audit.ts`**: `audit(contractId, {tier|model|panel|effort})` → structured
   findings (validated via `monitoring/adjudication` `SentinelFindings`) + native metrics. Tier
   defaults (monitor=Sonnet/minimal, deep=Opus/full/high). `engine/run.ts` CLI + `bun run audit`.
2. ✅ **DONE — `engine/tools/run-simnet-poc.ts`**: `run_simnet_poc` MCP tool — `docker run --rm
   --network none` of the baked image; sandbox-unavailable→pocStatus `pending` vs PoC-fail→`failed`;
   path-guarded. Handler validated locally (docker-down→pending, bad path→reject). NOTE: full live
   reproduce needs Docker up + `bun run sandbox:build`; authoring NEW poc files (vs the baked
   finding-1) is a follow-up (mount a written poc into the container).
3. **Repoint the bridge**: `webhooks/secondlayer-webhook.ts` calls `audit(...)` (in-process or via a
   worker queue) instead of POSTing to eve; keep HMAC verify + spend reserve + dedup/debounce.
4. **Adjudication off `structured_output`**: feed `result.structured_output` straight into
   `adjudicate()`; delete the `[SENTINEL-FINDINGS]` text-parse + `run-reader`/`watch-run`.
5. ✅ **DONE — removed eve**: dropped the `eve` dep + `ai` override pin + `.output`/`.eve`; deleted
   `agent/agent.ts`, `agent/channels/`, `agent/sandbox.ts`, `agent/tools/`, `agent/schedules/`, the
   per-subagent `agent.ts` wrappers (kept `instructions.md`), and `monitoring/{run-reader,watch-run,
   adjudicate-run,m5-demo,eve-jwt}.ts`. Bridge no longer forwards to eve. CLAUDE.md + AGENTS.md
   updated; Node floor → ≥22; zod v4 kept. tsc green, 35 tests pass.
6. ✅ **PROVEN IN-CONTAINER (Tier 1)** — `deploy/` (Dockerfile + docker-compose + RUNBOOK), scoped in
   [phase6-deploy.md](./phase6-deploy.md). A signed Standard-Webhooks request → the containerized bridge
   (HMAC-verified; unsigned→401) → a deep audit *inside* the container (KB priorFindings → bug) → DooD
   green PoC → human-gated WARN ($3.00, 10 findings); state persisted to the `/data` volume. Worker =
   bridge + engine, long-running; **Docker-out-of-Docker** (host socket) runs the airgapped sandbox.
   **#4:** `run_simnet_poc` `pocSource` runs a NEW PoC airgapped (mounted at `/app/poc/_dynamic.ts`).
   Two deploy bugs found + fixed live: `docker-cli` not `docker.io`; `IS_SANDBOX=1` (bypassPermissions →
   `claude --dangerously-skip-permissions` refuses root). **Remaining for autonomous (Tier 2, user-run):**
   public tunnel + live secondlayer subscription. Multi-tenant hardening: see ../plans/backend-hardening.md.

## Open questions
1. Worker hosting target (Fly / Railway / Render / own VM) for the subprocess-spawning audit worker?
2. In-process `query()` per webhook vs a job queue + worker pool (concurrency, the per-tenant spend
   budget, and not blocking the HTTP response)?
3. Keep `monitoring/spend-ceiling` as the cap, now reconciled by native cost — confirm the
   reserve-at-dispatch estimate per tier with real full-panel Opus numbers (pending this run).
4. Do we still want the secondlayer chain-subscription path (M2) as the trigger, or also a Claude-Tag
   "@Claude audit" human path as a second entrypoint? (Both can coexist.)
5. zod v4 stays; confirm nothing else depended on the `ai` beta pin before removing the override.
