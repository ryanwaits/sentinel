import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * Fetch a deployed Clarity contract's source via the Stacks node RPC.
 * (Proven in the spike: this is the same /v2/contracts/source call used to pull
 * the v0-vault-sbtc source.) In production, point STACKS_NODE_URL at the
 * secondlayer-operated node and prefer the @secondlayer/stacks SDK.
 */
export default defineTool({
  description: "Fetch the raw Clarity source of a deployed contract (address.contract-name).",
  inputSchema: z.object({
    address: z.string().describe("Deployer principal, e.g. SP1A27KFY...BSYADJ7"),
    contractName: z.string().describe("Contract name, e.g. v0-vault-sbtc"),
  }),
  async execute({ address, contractName }) {
    const base = process.env.STACKS_NODE_URL ?? "https://api.hiro.so";
    const res = await fetch(`${base}/v2/contracts/source/${address}/${contractName}`);
    if (!res.ok) {
      return { ok: false as const, error: `node returned ${res.status}` };
    }
    const data = (await res.json()) as { source: string; publish_height: number };
    return {
      ok: true as const,
      contractId: `${address}.${contractName}`,
      publishHeight: data.publish_height,
      lineCount: data.source.split("\n").length,
      source: data.source,
    };
  },
});
