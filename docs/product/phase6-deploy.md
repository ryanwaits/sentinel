# Phase 6 — host the audit worker (container + DooD sandbox)

**Status:** scaffolded (`deploy/`), not yet deployed. The last migration phase: take the eve→Agent-SDK
substrate (engine + bridge, all proven on the dev box) and run it as a service.

## Why a container (not serverless)
`query()` spawns the bundled `claude` CLI subprocess, and a Deep sweep runs minutes (8–20) — neither
fits serverless (no long-lived subprocess, function-duration ceilings; the M5 wall in another form).
The worker wants a **long-running container**. This is the genuine reason to leave Vercel — distinct
from dropping the gateway.

## The shape (`deploy/`)
- **`Dockerfile`** — one worker image: bun + node (Agent SDK subprocess) + the docker **CLI** +
  the project. Entrypoint = the bridge (`webhooks/secondlayer-webhook.ts`): verify webhook →
  pre-filter → `reserve` → fire `runTrigger` (audit→adjudicate→notify) async → 202.
- **`docker-compose.yml`** — the reference deploy: port 3001, `env_file ../.env.local`, three mounts:
  1. `/var/run/docker.sock` — **Docker-out-of-Docker**: the airgapped PoC sandbox (`docker run --rm
     --network none audit-sentinel-simnet:local`) runs as a sibling on the host daemon. `run_simnet_poc`
     already shells `docker run`, so **no code change** for the baked PoC — it's pure deploy config.
  2. `sentinel-data:/data` — durable monitoring state (sub secrets, spend ceiling, trigger ledger,
     notifications). External KV (Postgres/Neon, `backend-architecture.md`) is the prod upgrade.
  3. `/tmp/sentinel-sandbox` bind-mounted **same-path** host↔worker — for inline-PoC source (below).

## #4 baked in — reproduce NEW findings, airgapped
`run_simnet_poc` now takes **`pocSource`** (not just a baked `pocFile`): the agent authors a
self-contained PoC (deploy the fetched contract via `initSimnet`/`simnet.deployContract`, exercise the
bug, exit non-zero on failure), which is written to the scratch dir and mounted at
`/app/poc/_dynamic.ts` — so it resolves the image's `node_modules` + simnet root exactly like a baked
PoC, with zero network. This is what flips `pocStatus` from `pending` to `green` for novel findings.

**The DooD gotcha (handled):** bind mounts resolve on the **host** daemon, not in the worker. So the
scratch dir is bind-mounted at the **identical path** on host and worker (`SENTINEL_SANDBOX_HOSTDIR`,
default `/tmp/sentinel-sandbox`); the worker writes there and the host can find it. In local dev
(worker fs == host fs) the OS tmpdir works with no config.

## Host choice
Any **Docker host you control** works (a VM, docker-compose, a DinD-capable orchestrator). The
discriminator is socket access for the sandbox:
- **VM / bare docker host (recommended MVP):** `docker compose up` — socket mount just works.
- **Fly Machines / Railway / Render:** restrict host-socket access → DooD is harder; need a
  privileged/DinD setup (sysbox, a dedicated sandbox sidecar) or a separate sandbox host. Evaluate
  before committing.
- Prereq either way: `bun run sandbox:build` on the host first (bakes `audit-sentinel-simnet:local`).

## Ingress
Expose `:3001` publicly (LB / reverse proxy / tunnel) so secondlayer can deliver webhooks; the M2
provisioner registers that public URL as each subscription's `url`.

## Security
The docker-socket mount = host-root-equivalent for the worker (it runs OUR code, so acceptable for
MVP). The PoC sandbox itself is hardened: `--network none` (zero egress) + ephemeral `--rm`. For prod
/ untrusted scale: rootless docker or sysbox, a dedicated sandbox host, and don't co-locate other
workloads. Never-mainnet holds — the sandbox has no network.

## Open questions
1. **In-process async vs job queue.** The bridge fires `runTrigger` detached and returns 202 — fine
   on a single container, but no retry/visibility/back-pressure. A queue (e.g. a durable-jobs table +
   a worker pool) is the prod upgrade; couples with the Postgres store.
2. **Concurrency.** Concurrent Deep sweeps (~$2/8min, subprocess each) — cap with a worker-pool size;
   the daily spend ceiling is the cost backstop.
3. **Secrets.** `env_file .env.local` now → a secrets manager in prod.
4. **Multi-tenancy** (backend-architecture.md): per-tenant sub secrets + budgets + the bridge routing
   a webhook to the right tenant — layer on once there's >1 client.
5. **State volume vs external KV** — the `.sentinel/` seam moves to Postgres/Neon (Phase 2) when
   multi-instance / durability matters.
