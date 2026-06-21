# Clarinet simnet PoC runner image — used by eve's docker() sandbox backend.
# Bakes bun + deps + the PoC so the sandbox can run airgapped (deny-all egress):
#   docker build -t audit-sentinel-simnet:local apps/audit-sentinel/simnet
#   docker run --rm --network none audit-sentinel-simnet:local   # Finding-1, no network
FROM oven/bun:1
WORKDIR /app

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
