# docs/plans — deferred work, scoped

Each plan = a deferred capability with its **blocker/trigger** (when to pick it up) so we don't build
speculatively. Ordered by when they unlock, not priority.

| plan | status | trigger to start |
|---|---|---|
| [discovery-find-value-contracts](./discovery-find-value-contracts.md) | blocked | need PROACTIVE target discovery (vs reactive monitoring); requires the asset-holdings subgraph deployed |
| [clarity-drift-check](./clarity-drift-check.md) | low-value | a Clarity release changes built-ins and we want the panel auto-updated |
| [backend-hardening](./backend-hardening.md) | premature | deployed AND ≥1 real client, or trigger bursts overwhelm the detached-async bridge |
| [product-ui](./product-ui.md) | premature | a client needs a control plane / a non-CLI way to see alerts |

Detailed designs already in `docs/product/`: [backend-architecture](../product/backend-architecture.md),
[control-plane-ux](../product/control-plane-ux.md). These plans scope the WORK + the trigger; those docs
hold the architecture.
