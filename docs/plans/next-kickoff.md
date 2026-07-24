# Next-session kickoff — public worker + alert voice

**How to use:** `git pull` on claude-mini, then hand this file to Claude Code (or read it and go). It's
the ready-to-run starting point for the two follow-ups left after the house-voice batch. Mechanics for
the deploy live in [`claude-mini-deploy.md`](./claude-mini-deploy.md) + [`deploy/RUNBOOK.md`](../../deploy/RUNBOOK.md);
this doc adds only what's new since those were written.

## Where things stand (house-voice batch, shipped)
- The worker renders a **house-voice `summary`** on every audit verdict (`monitoring/render-summary.ts`:
  cheap-Haiku LLM path + deterministic `templateSummary` fallback; never throws, never spends under
  `SENTINEL_AUDIT_MOCK`). It's in `PublicResult` and flows through `GET /audit/:id`.
- The web renders it above the finding cards (`web/src/routes/onboarding.tsx` `StepAudit`).
  `web/src/lib/worker.ts` calls `${VITE_SENTINEL_WORKER_URL ?? http://localhost:3001}/audit`.
- Proven end to end locally (mock worker + web dev → live verdict with the summary block). 168 tests green.
- The compose stack now also brings up the **egress proxy + internal network** (fork-PoC containment) —
  no action needed, it just comes up with `docker compose up`.

---

## Track A — expose the worker so the DEPLOYED site runs real audits
Goal: a real user on runsentinel.app onboards a contract → a real audit runs → they see the house-voice
summary. Today the deployed site fails soft to the demo because no worker is publicly reachable.

1. **Stand up the worker on claude-mini** — follow [`claude-mini-deploy.md`](./claude-mini-deploy.md)
   verbatim (tailnet identity cleanup → Funnel enablement → `docker compose up` on `SENTINEL_BRIDGE_PORT=3011`).
   Confirm `curl localhost:3011/health` → `{"ok":true,...}` and DooD runs the airgapped sandbox.
2. **Funnel the bridge** — `tailscale funnel 3011` (or the RUNBOOK's ingress step) → note the public
   `https://claude-mini.<tailnet>.ts.net` URL.
3. **Point the web at it** — set `VITE_SENTINEL_WORKER_URL=https://claude-mini.<tailnet>.ts.net` in the
   **Vercel** project env (build-time var — it's inlined by Vite, so **redeploy the web** after setting it).
4. **Verify as a real user** — on runsentinel.app: onboarding → enter a contract → the verdict shows the
   **live** chip + the SUMMARY block (real LLM prose, not the template). Same flow as the local screenshot,
   now against the deployed site.

**Guardrails before broad exposure (do not skip):**
- `POST /audit` is a first-party front door: **spend-ceiling-gated** (`reserve(tier)` → 429 on breach)
  but **NOT signature-gated** (unlike the secondlayer webhook path). Before opening it wide, front it
  with a rate-limit / basic auth / an allowlist — it's flagged in `handleAuditRequest`'s doc comment.
- Keep `SENTINEL_DAILY_CEILING_USD` sane (default $20) — the ceiling is the last line against a POST flood.
- Do NOT set `SENTINEL_AUDIT_MOCK` in prod (that forces the template summary + a canned finding).

## Track B — the same house voice for monitoring alerts
Goal: when the monitoring lanes page a human, the alert reads in the house voice too, not just structured
fields. The renderer already exists; wire it into the alert path.

- **Reuse** `renderSummary(adj)` from `monitoring/render-summary.ts` — it takes an `Adjudication`, which is
  exactly what the alert path already has.
- **Touch** `monitoring/notify.ts` (the egress) and its callers (`monitoring/audit-pipeline.ts` `runTrigger`,
  `monitoring/invariant-pipeline.ts`): render a `summary` into the alert payload (Slack/webhook body) the
  same way the verdict does. Keep it human-gated — the summary describes, it never acts.
- **Honesty rules still bind** (see the skill): a signature match is a *correlation*, say "looks like",
  never imply an automatic action was taken.
- **Test** with the injected-stub pattern (`webhooks/audit-request.test.ts` is the template): inject a
  stub renderer so `notify` tests stay deterministic + spend-free; assert the summary reaches the payload.
- Small enough to `/plan` in one pass; likely one commit (`feat(monitoring): house-voice summary on alerts`).

## Verify (both tracks)
- A: onboard a real contract on the deployed site → live verdict + LLM summary. (~$0.55 monitor / ~$2 deep.)
- B: `bun run test` green incl. the new notify-summary test; a real invariant/trigger tick emits an alert
  whose body carries the house-voice summary.

## Not in scope here
- Durable audit-results store (in-process Map today — fine single-tenant; KV/Postgres is backend-hardening).
- Multi-tenancy / auth on the front door beyond the rate-limit note above.
