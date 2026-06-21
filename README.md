# audit-sentinel

Continuous Stacks asset-safety audit pipeline. A **separate project, powered by
secondlayer** — it depends on the *published* `@secondlayer/*` packages and
consumes secondlayer's hosted services (Index / Subgraphs / Streams /
Subscriptions) over HTTP with an API key. secondlayer is a dependency, not a
parent; this repo lives outside the secondlayer monorepo with its own release
cadence, license, and business.

Runtime: **eve** (Vercel's durable agent framework). Validated sandbox-PoC-first.

## Spike result: ✅ PASS

The load-bearing seam — **safely reproduce a confirmed vuln in an isolated Clarity
VM** — works end to end. `simnet/poc/finding-1.ts` reproduces audit **Finding 1**
(`socialize-debt` forces unbounded LP loss) on the `v0-vault-sbtc` vault:

```
bun run poc:finding-1   # 15/15 assertions pass
```

One `authorized-contracts` call drives `total-assets` to 0, LP `redeem()` reverts
with `ERR-OUTPUT-ZERO`, and **50,001,000 sats stay locked** in the contract — no
mainnet, no network, deterministic.

### Decisions resolved
1. **Run the spike** — done (this dir).
2. **eve, not Claude Agent SDK** — adopted as runtime.
3. **Vercel host** — schedules → Vercel Cron; sandbox → Vercel Sandbox.
4. **Opus 4.8 + ceilings** — `model: "anthropic/claude-opus-4.8"` (`agent/agent.ts`).
   Smoke test confirmed eve loads it and routes to the AI Gateway; the gateway
   rejects it on the **free tier** (`403 — add paid credits`). Add Vercel AI
   Gateway credits to run Opus. Long fan-out audits rely on eve's durable,
   checkpointed sessions to survive Vercel function limits — confirm concurrency/
   duration quotas before the first big sweep.

## Smoke test (eve runtime) — PASS to the model call

`eve build` compiles the full project (3 tools, 7 subagents, schedule, channel);
the built Nitro server boots and serves `/eve/v1`. A POST to `/eve/v1/session`
emits `session.started {modelId: anthropic/claude-opus-4.8}` → `message.received`
→ gateway `403` (free tier). Integration is green end to end; only billing blocks
the actual Opus response.

### Prerequisites & repo changes (required to make eve run)
- **Node ≥ 24** (eve hard requirement; repo was on 22). Installed via nvm.
- **`ai` override 6.0.167 → 7.0.0-beta.178** in root `package.json` (eve 0.12 pins
  it). `@secondlayer/stacks` (the only other `ai` consumer) still builds clean.
- **app `zod` 3.25 → 4.4.3** (eve's schema normalizer uses zod-v4 internals; a v3
  schema made it crash with `Cannot read properties of undefined (reading 'input')`).
- eve's `dev` TUI needs an interactive stdin and `--no-ui` is buggy in 0.12.0;
  use the **built server** (`eve build` + `node .output/server/index.mjs`) for
  headless/CI, or `bun run dev` in a real terminal for the TUI.

### Package corrections applied
- simnet uses **`@stacks/clarinet-sdk`** (3.20.0, the new home of clarinet-sdk),
  not `@hirosystems/clarinet-sdk`.
- clarity values use **`@secondlayer/stacks/clarity`** (`Cl`), not
  `@stacks/transactions` — dogfooding our own package. Wire-compatible because
  `@stacks/clarinet-sdk` ships the same new string-typed CV representation.

## Layout
```
agent/
  agent.ts                  # defineAgent — Opus 4.8
  instructions.md           # orchestrator persona + guardrails
  tools/
    fetch_contract_source.ts  # /v2/contracts/source (proven)
    find_value_contracts.ts   # TVL-ranked targets (stub -> Index/subgraph)
    run_simnet_poc.ts         # runs a simnet PoC in eve's deny-all sandbox
  subagents/                # auditor-access-control, auditor-reentrancy, verifier
                            #   (4 more dims mirror these)
  schedules/weekly-sweep.ts # cron "0 9 * * 1" -> Vercel Cron
simnet/
  contracts/sbtc-token.clar # permissive SIP-010 mock (test plumbing)
  contracts/vault.clar      # reduced vault; socialize-debt/redeem/convert VERBATIM
  poc/finding-1.ts          # the runnable reproduction (clarinet-sdk wasm VM)
```

### Fidelity note
`vault.clar` copies the vulnerable functions (`socialize-debt`, `redeem`,
`deposit`, `total-assets`, conversions) verbatim from mainnet. Only test plumbing
is reduced — local sBTC mock, simplified DAO auth, same-block pass-through
`accrue` — none of which touches the vulnerability. `as-contract` is used for the
self-principal (valid on Clarity 3; becomes `as-contract?` in Clarity 4).

## Sandbox backend — self-hosted Docker, airgapped (chosen)

`agent/sandbox.ts` uses eve's **`docker()` backend with `networkPolicy: "deny-all"`** — OSS, no Vercel, no KVM. Simnet/exploit PoCs need zero egress, so deny-all is a perfect fit. The runner image (`simnet/Dockerfile`) bakes `bun` + `@stacks/clarinet-sdk` + `@secondlayer/stacks` + the PoC, so the sandbox is self-contained and offline.

**Validated airgapped:**
```
bun run sandbox:build   # docker build -t audit-sentinel-simnet:local simnet
bun run sandbox:run     # docker run --rm --network none ...  → Finding-1, 15/15, no network
```

Researched upgrade paths: **gVisor `runsc`** (stronger no-KVM isolation) → **`microsandbox()` `Network.none()`** (microVM, needs KVM) → **Daytona** behind a custom `SandboxBackend` for the multi-tenant phase (note: **AGPL-3.0** — needs legal sign-off before shipping in a proprietary product; E2B / Alibaba OpenSandbox are Apache-2.0 fallbacks).

## Status of follow-ups (this pass)
- ✅ Remaining 4 auditor dimensions ported (share-accounting, interest-math,
  flashloan-economics, invariants-dos) — 7 subagents total.
- ✅ `find_value_contracts` wired to the `token-balances` subgraph (REST query +
  seed fallback); `subgraphs/token-balances.ts` authored (deploy with `sl`).
- ✅ secondlayer-webhook HTTP bridge (`webhooks/secondlayer-webhook.ts`) — verifies
  the signature and forwards to `/eve/v1/session`. (Native `defineChannel` route
  is deferred: 0.12.0's channel generics are heavy and the HTTP-channel doc 404s.)

## Next
- Add Vercel AI Gateway **paid credits**, then re-run the smoke test for a live
  Opus response (and a tool-calling round-trip).
- Deploy `token-balances` subgraph; set `SECONDLAYER_API_URL`/`_API_KEY`.
- Confirm Vercel function concurrency/duration ceilings for ~1M-token sweeps.
