# Sentinel audit worker — the HTTP ingress bridge + the Agent-SDK audit engine in one long-running
# container (NOT serverless: query() spawns a subprocess, and sweeps run minutes). Reaches Docker via
# the host socket (Docker-out-of-Docker) to run the airgapped simnet PoC sandbox.
#
#   docker build -f deploy/Dockerfile -t sentinel-worker .
# Prereq on the host: build the sandbox image once → `bun run sandbox:build` (audit-sentinel-simnet:local).
FROM oven/bun:1

# docker CLI only (the daemon is the HOST's, via the mounted socket); node for the Agent SDK subprocess.
RUN apt-get update \
 && apt-get install -y --no-install-recommends docker.io nodejs ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .

EXPOSE 3001
# The bridge: verifies the secondlayer webhook → pre-filters → fires runTrigger (audit→adjudicate→notify).
CMD ["bun", "run", "webhooks/secondlayer-webhook.ts"]
