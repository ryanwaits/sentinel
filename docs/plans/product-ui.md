# Plan — product UI (control plane)

**Status:** premature (no client). UX already designed in
[control-plane-ux.md](../product/control-plane-ux.md) — this scopes the BUILD + the trigger.

## Problem
Today the product surface is CLI + files: alerts land in `.sentinel/notifications`, KB records are JSON,
audits run via `bun run audit`. Fine for us; not a thing a client logs into. A control plane = see watched
contracts, alerts/WARNs (human-gated disclosure actions), audit history + costs, and KB/waiver review.

## Scope (when picked up) — per control-plane-ux.md
- **Alerts view** — the WARN feed, each with the finding, severity/class, PoC status (green/pending), and
  the human-gated disclose/escalate/dismiss actions (the gate stays human — the UI just routes intent).
- **Contracts view** — watched set, archetype, last audit, spend, subscription health.
- **KB review** — promote distiller candidates (`sentinel/kb/_candidates/`) to live records; edit waivers.
- **Audit detail** — findings, metrics (cost/turns/latency), the green-PoC artifact.
- Stack per global defaults: TypeScript + React + shadcn/ui + Tailwind, reading the backend store.

## Why premature
No client to log in; the loop's value (audit→adjudicate→green-PoC→WARN) is already proven via CLI. A UI is
a dedicated frontend build that should follow (a) a real deploy and (b) the backend store (it reads the
same Postgres the hardening plan introduces — building it on file-state would be throwaway).

## Trigger to start
A client needs to see/act on alerts without us in the loop — i.e. after first deploy + a design partner.

## Dependencies
[backend-hardening](./backend-hardening.md) step 1–2 (a queryable store), an auth story (deferred with
multi-tenancy).
