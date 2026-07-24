# Plan — align the bridge to secondlayer's real webhook envelope

**Status: ✅ DONE (2026-07-24).** All three fixes shipped. #2 + #3 (event_index + block_hash dedup) in
`d2c26e8`; #1 (`decodeChainWebhook`) after `@secondlayer/sdk@6.30.0` re-exported it. The bridge now
decodes the real envelope via the sdk's typed `ChainWebhookDelivery` — the reverse-engineered
`unwrapDelivery`/`normalizeEvent` are gone; field access is compiler-checked.

Context: `webhooks/secondlayer-webhook.ts` currently hand-rolls `unwrapDelivery()` + `normalizeEvent()`
to parse the real `{ type:"chain.<trigger>.apply", data:{ action, trigger, tx_id, block_height,
event:{ type, event_index, data } } }` envelope. It works for `stx_transfer` (verified live) and *should*
work for the flat tx-level `contract_call` shape (defensive `rawEvent.data ?? rawEvent` + discriminate on
`data.trigger`), but `contract_call`/`ft`/`nft`/`sbtc`/rollback are unverified against real deliveries.

## 1. Adopt `decodeChainWebhook` + `ChainWebhookDelivery` (the real fix) — ✅ DONE
The blocker was NOT a missing version — the function shipped in the sdk *source* (2026-06-30) but was
never re-exported from the package root (`packages/sdk/src/index.ts` listed only `verifyWebhookSignature`
/ `verifySecondlayerSignature` from `./webhooks.ts`). Fixed upstream in `@secondlayer/sdk@6.30.0`
(re-exports the fn + the `Chain*` type surface). Done here:
- Bump the pinned `@secondlayer/sdk`.
- Replace hand-rolled `unwrapDelivery()`/`normalizeEvent()` in `webhooks/secondlayer-webhook.ts` with
  `verifyWebhookSignature` → `decodeChainWebhook(rawBody)` → `switch (delivery.type)`.
- `ChainWebhookDelivery` is a discriminated union keyed on `data.trigger`; it handles every trap for free
  (`contract_id` vs `contract_identifier`, print's `contract_event` type, nft `raw_value`, sbtc `topic`,
  the `_event`-suffix inconsistency). Deletes our reverse-engineering + kills the whole silent-mis-parse
  class. Map the decoded shape into our `ChainEventBody` at ONE seam (keep prefilter/triage unchanged).
- Confirm `decodeChainWebhook` only understands the `standard-webhooks` format (we use it) — unwrap other
  formats first if we ever change format.

## 2. Transfer dedup is too coarse — add `event_index` (real bug) — ✅ DONE (`d2c26e8`)
One tx emits MULTIPLE transfer events: the live capture had `event_index` 2220/2230/2240 all under the SAME
`tx_id` (a swap → 3 stx outflows from the pool). Our key `dedupKey(delivery.tx_id, contractId, "outflow:<asset>")`
(`webhooks/secondlayer-webhook.ts` handleTransfer) is IDENTICAL for all three → we triage the first and
DROP the other two real outflows.
- Fix: include `event.event_index` in the transfer dedup key (e.g. `dedupKey(tx_id, contractId, ${fnLabel}:${event_index})`).
- `dedupKey`/`markDispatched` live in `monitoring/trigger-state.ts` — thread `event_index` through
  `handleTransfer` (it's on `data.event.event_index`; add to `ChainEventBody`/normalize).
- Contract_call (tx-level, one event per tx) is unaffected — keep its key as-is.

## 3. Idempotency key: add `block_hash` (minor) — ✅ DONE (`d2c26e8`)
The docs recommend keying idempotency on `(tx_id, block_hash)`; ours is `(tx_id, contract, fn)`. Adding
`block_hash` guards the reorg edge (same tx re-mined in a different block). Low priority — fold in with #2
if touching the dedup key anyway; `data.block_hash` is on the envelope.

## Notes / verification still owed
- `contract_call` real delivery STILL never captured — adopting #1 makes it moot (typed), but until then a
  live capture (provision a `contract_call` sub on an active contract, `SENTINEL_DEBUG_RAW`) would confirm
  our defensive parse. See the confirmed-vs-inferred table in memory `audit-informed-monitoring`.
- Rollback: real shape is `chain.reorg.rollback` (`data.action:"rollback"` + `data.orphaned[]`). We ack+drop
  (204) via `delivery.action === "rollback"` — fine; replaying `orphaned[]` is deferred (M4).
