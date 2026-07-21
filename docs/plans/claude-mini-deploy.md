# Deploy the Sentinel worker on claude-mini (+ Tailscale Funnel)

Hand-off doc: how to run the always-on worker on **claude-mini** (the Mac mini) and expose it with a
stable, free public URL via **Tailscale Funnel**. Everything is committed, so this is a pull-and-run.
Detailed step reference: [`deploy/RUNBOOK.md`](../../deploy/RUNBOOK.md). This doc adds the claude-mini +
Funnel specifics.

## Why this host
The airgapped PoC sandbox runs `docker run --network none` as a sibling on the host Docker daemon
(Docker-out-of-Docker), which needs host-socket access. That rules out Render/Railway (no host socket /
no privileged). A plain Docker host you control is required → claude-mini, always-on, self-hosted, $0.

## ⚠️ First: the tailnet identity
The dev MacBook was data-copied from claude-mini, so it currently claims claude-mini's Tailscale
identity. Before claude-mini rejoins, clean that up so two nodes don't collide:
- On the **MacBook**: `tailscale logout` then re-auth as its own node (or leave it off the tailnet).
- claude-mini keeps the real `claude-mini` identity.

## One-time Tailscale Funnel enablement (NOT doable from the `tailscale` CLI)
Funnel is off by default; the `tailscale` CLI only *uses* it once granted. Enable it once for the
tailnet — admin console (`login.tailscale.com`) OR the v2 API with an API key:
1. **HTTPS certificates** — DNS page → "HTTPS Certificates" → Enable (serves the `*.ts.net` cert).
2. **Funnel node attribute** — ACL/policy editor, add:
   ```json
   "nodeAttrs": [ { "target": ["autogroup:member"], "attr": ["funnel"] } ]
   ```
   (or scope `target` to just `["claude-mini"]`).

## Deploy on claude-mini
```bash
git pull                                              # get the latest (deploy/, engine, monitoring, web)
# .env.local at repo root: ANTHROPIC_API_KEY, STACKS_NODE_URL (→ secondlayer),
#   SECONDLAYER_API_KEY / SECONDLAYER_API_URL, SECONDLAYER_WEBHOOK_SECRET (mandatory, see RUNBOOK §3)
bun run sandbox:build                                 # bake audit-sentinel-simnet:local (the airgapped PoC image)
mkdir -p /tmp/sentinel-sandbox                        # DooD same-path scratch dir
SENTINEL_BRIDGE_PORT=3011 docker compose -f deploy/docker-compose.yml up -d --build
curl -s localhost:3011/health                         # → {"ok":true,"service":"sentinel-bridge"}
```
Confirm DooD works from inside the container:
```bash
docker compose -f deploy/docker-compose.yml exec sentinel-worker \
  docker run --rm --network none audit-sentinel-simnet:local   # → Finding 1, 15/15, airgapped
```

## Expose it with Funnel (the CLI part, on claude-mini)
```bash
tailscale funnel --bg 3011           # publishes localhost:3011 at https://claude-mini.<tailnet>.ts.net
tailscale funnel status              # confirm the mapping
```
That `https://claude-mini.<tailnet>.ts.net` is the stable public URL (survives restarts). It becomes:
- **secondlayer webhook target** — provision subs at `<URL>/webhook/<ruleKey>` (RUNBOOK §4).
- **web onboarding target** — set the deployed web app's `VITE_SENTINEL_WORKER_URL=<URL>` (T3.2b) so
  "Run audit" hits the real worker `/audit`.

## Sanity checks
- `curl <URL>/health` from anywhere → `{"ok":true}`.
- Forged webhook → 401 (verification enforced; needs `SECONDLAYER_WEBHOOK_SECRET`).
- Scheduler ticking: `docker compose -f deploy/docker-compose.yml logs sentinel-scheduler`.

## Notes
- State lives in the `sentinel-data` volume (`/data/.sentinel`); back it up (durability boundary until a
  KV/Postgres store lands).
- A Deep audit is minutes + real Opus spend; the daily spend ceiling is the backstop.
- Keep claude-mini awake (Energy Saver → prevent sleep) so the always-on worker + Funnel stay up.
