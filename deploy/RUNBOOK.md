# Deploy runbook — Sentinel audit worker

The worker = the HTTP ingress bridge + the Agent-SDK audit engine in one long-running container,
reaching Docker via the host socket (Docker-out-of-Docker) to run the airgapped PoC sandbox.

**Validated locally (2026-06-30):** container boots, bridge listens on :3001, DooD runs the airgapped
sandbox *from inside the container* (green PoC), state + scratch volumes mount. What remains is host-
specific: a public ingress and a live secondlayer subscription.

## 0. Host prereqs
- A Docker host you control (VM / bare host) — needs host-socket access for DooD (see phase6-deploy.md
  for the Fly/Railway caveats). Apple-Silicon dev: OrbStack works.
- `.env.local` present at repo root with: `ANTHROPIC_API_KEY`, `STACKS_NODE_URL` (→ secondlayer),
  `SECONDLAYER_API_KEY`/`SECONDLAYER_API_URL`, and **`SECONDLAYER_WEBHOOK_SECRET`** (see §3 — mandatory).
- Build the airgapped sandbox image once: `bun run sandbox:build` → `audit-sentinel-simnet:local`.
- `mkdir -p /tmp/sentinel-sandbox` (the DooD same-path scratch dir; matches `SENTINEL_SANDBOX_HOSTDIR`).

## 1. Bring up the worker
```
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f      # expect: "bridge listening on :3001"
```
Smoke-test DooD from inside the container (should reproduce Finding 1, airgapped):
```
docker compose -f deploy/docker-compose.yml exec sentinel-worker \
  docker run --rm --network none audit-sentinel-simnet:local
```

## 2. Public ingress (you run — interactive)
secondlayer must reach the bridge. Expose :3001 via a tunnel or your LB:
```
! cloudflared tunnel --url http://localhost:3001        # prints a public https URL
```
(or ngrok / a real load balancer in prod). Note the public URL → `<PUBLIC>`.

## 3. Webhook secret — MANDATORY (the bridge fail-opens without it)
The bridge verifies the Standard-Webhooks HMAC with a per-ruleKey secret (KV) or an env fallback.
**If NO secret resolves, verification is SKIPPED (fail-open) — any caller can trigger an audit.** Always
configure one in prod:
- Single-sub: set `SECONDLAYER_WEBHOOK_SECRET` (env fallback) to the subscription's signing secret.
- Multi-sub: store per-ruleKey secrets in the KV the bridge reads (the `/webhook/<ruleKey>` path).

Verify the gate: an unsigned `POST <PUBLIC>/webhook/<ruleKey>` must return **401**.

## 4. Provision a live secondlayer chain subscription (you run)
Point a subscription at `<PUBLIC>/webhook/<ruleKey>` with the signing secret from §3, filtered to the
watched contract's sensitive fns (the M2 provisioner / `sl` CLI — needs `SECONDLAYER_API_KEY`). The
watched contract must have a live KB record in `.sentinel/kb/` (else the bridge returns 204
"unmonitored"). Seed one with `bun run distill <contractId> <client>` → review → `saveRecord` into
`.sentinel/kb/`. Playground fixtures: `bun run examples:load`.

## 5. Fire it
A real on-chain event on a watched fn (or a synthetic signed webhook) → bridge verifies → pre-filters →
`reserve` → `runTrigger` (audit → adjudicate → notify) async → 202. A high/critical confirmed bug with
a green PoC pages a human-gated WARN (`/data/.sentinel/notifications`). Disclosure stays human-gated.

## Operational notes
- **State** lives in the `sentinel-data` volume (`/data/.sentinel`: sub secrets, spend ceiling, trigger
  ledger, notifications). Back it up; it's the durability boundary until the Postgres store lands.
- **Spend ceiling** is the cost backstop (daily cap); a Deep audit is ~$2–3 / ~8 min.
- **Concurrency**: the bridge fires audits detached (no queue yet) — fine for one tenant; a job queue is
  the next hardening step (backend-architecture.md) if triggers can burst.
- **node**: the image ships Debian `nodejs` (v20) for the Agent SDK subprocess; bun runs the app. If a
  deep audit subprocess ever errors on node version, install node 22 from nodesource in the Dockerfile.
- **docker client**: the image installs `docker-cli` (client only) — the daemon is the host's via the
  mounted socket. Do NOT install `docker.io` (that's the daemon).
