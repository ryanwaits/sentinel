import { defineSubgraph } from "@secondlayer/subgraphs";

/**
 * Per-(asset, holder) balance tracking for ANY SIP-010 token, plus STX.
 * Powers TVL ranking for the audit pipeline: query rows where `holder` is a
 * contract principal to find which contracts hold value, and how much.
 *
 * Deploy:  sl subgraphs deploy subgraphs/token-balances.ts
 * Query:   GET /v1/subgraphs/token-balances/balances?_sort=amount&_order=desc&_limit=50
 *          GET /v1/subgraphs/token-balances/balances?holder=SP1A27...v0-vault-sbtc&_sum=amount
 */
export default defineSubgraph({
  name: "token-balances",
  version: "1.0.0",
  description: "Per-token balance tracking for any SIP-010 asset (TVL source)",

  sources: {
    transfer: { type: "ft_transfer" },
    mint: { type: "ft_mint" },
    burn: { type: "ft_burn" },
  },

  schema: {
    balances: {
      columns: {
        asset_identifier: { type: "text", indexed: true, search: true },
        holder: { type: "principal", indexed: true, search: true },
        amount: { type: "uint" },
      },
      uniqueKeys: [["asset_identifier", "holder"]],
    },
  },

  handlers: {
    transfer: async (event, ctx) => {
      const amount = BigInt(event.amount ?? 0);
      if (event.sender) await adjust(ctx, event.assetIdentifier, event.sender, -amount);
      if (event.recipient) await adjust(ctx, event.assetIdentifier, event.recipient, amount);
    },
    mint: async (event, ctx) => {
      if (event.recipient)
        await adjust(ctx, event.assetIdentifier, event.recipient, BigInt(event.amount ?? 0));
    },
    burn: async (event, ctx) => {
      if (event.sender)
        await adjust(ctx, event.assetIdentifier, event.sender, -BigInt(event.amount ?? 0));
    },
  },
});

async function adjust(
  // biome-ignore lint/suspicious/noExplicitAny: subgraph runtime ctx shape
  ctx: any,
  assetIdentifier: string,
  holder: string,
  delta: bigint,
): Promise<void> {
  const existing = await ctx.findOne("balances", { asset_identifier: assetIdentifier, holder });
  const current = existing ? BigInt(existing.amount) : 0n;
  await ctx.upsert(
    "balances",
    { asset_identifier: assetIdentifier, holder },
    { asset_identifier: assetIdentifier, holder, amount: current + delta },
  );
}
