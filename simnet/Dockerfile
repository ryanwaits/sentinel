# Clarinet simnet PoC runner image — used by eve's docker() sandbox backend.
# Bakes bun + deps + the PoC so the sandbox can run airgapped (deny-all egress):
#   docker build -t audit-sentinel-simnet:local apps/audit-sentinel/simnet
#   docker run --rm --network none audit-sentinel-simnet:local   # Finding-1, no network
FROM oven/bun:1
WORKDIR /app

# clarinet-sdk-wasm fetches remote_data (fork substrate) by shelling out to `curl`, NOT via JS fetch.
# Without this binary a fork PoC dies with "curl: not found". curl also honours HTTPS_PROXY, which is
# what routes fork reads through the egress allowlist (deploy/egress-proxy.ts). Airgapped PoCs never
# invoke it. Kept to a single package so the image stays minimal.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# deps first (cached layer); needs network at BUILD time only
COPY package.docker.json package.json
RUN bun install

# the simnet project (contracts + manifest + runner)
COPY Clarinet.toml ./
COPY contracts ./contracts
COPY settings ./settings
COPY poc ./poc

# clarinet-sdk writes a deployment plan + cache at runtime
RUN chmod -R a+rw /app

CMD ["bun", "run", "poc/finding-1.ts"]
