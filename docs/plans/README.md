# docs/plans — deferred work, scoped

Each plan = a deferred capability with its **blocker/trigger** (when to pick it up) so we don't build
speculatively. Ordered by when they unlock, not priority.

| plan | status | trigger to start |
|---|---|---|
| [webhook-envelope-alignment](./webhook-envelope-alignment.md) | **ready (small)** | adopt secondlayer's `decodeChainWebhook` when it publishes; + fix transfer dedup (`event_index`) — real bug, do anytime |
| [trigger-routing](./trigger-routing.md) | **near-term** | before a real client's contracts generate behavioral traffic — split notable triggers into audit-new-code (Type 1) vs incident-triage (Type 2) |
| [discovery-find-value-contracts](./discovery-find-value-contracts.md) | blocked | need PROACTIVE target discovery (vs reactive monitoring); requires the asset-holdings subgraph deployed |
| [clarity-drift-check](./clarity-drift-check.md) | low-value | a Clarity release changes built-ins and we want the panel auto-updated |
| [backend-hardening](./backend-hardening.md) | premature | deployed AND ≥1 real client, or trigger bursts overwhelm the detached-async bridge |
| [product-ui](./product-ui.md) | premature | a client needs a control plane / a non-CLI way to see alerts |

Detailed designs already in `docs/product/`: [backend-architecture](../product/backend-architecture.md),
[control-plane-ux](../product/control-plane-ux.md). These plans scope the WORK + the trigger; those docs
hold the architecture.
