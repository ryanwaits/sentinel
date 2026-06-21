import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * Run a Clarity simnet PoC inside eve's isolated sandbox (deny-all egress) and
 * return the result. This is the load-bearing "reproduce" step: a finding only
 * ships with a green, runnable proof — and it never touches mainnet.
 *
 * The PoC runner itself (simnet/poc/*.ts, @stacks/clarinet-sdk wasm VM) is
 * independently verified: `docker run --rm --network none audit-sentinel-simnet:local`
 * reproduces Finding 1 (15/15) airgapped. The docker() backend (agent/sandbox.ts)
 * runs that same baked image with deny-all egress; this tool execs the PoC in it.
 */
export default defineTool({
  description:
    "Execute a Clarity simnet reproduction script in the isolated sandbox and return its output. Use to confirm/refute a finding with a runnable PoC. Never runs against mainnet.",
  inputSchema: z.object({
    pocFile: z
      .string()
      .default("poc/finding-1.ts")
      .describe("PoC runner path inside the baked image, relative to /app."),
  }),
  // `needsApproval: never()` — running a sandboxed, airgapped sim is safe & unattended.
  async execute({ pocFile }, ctx) {
    // Runs in the docker() sandbox (deny-all egress); the image bakes bun + deps
    // + the PoC at /app (simnet/Dockerfile), so it's fully offline.
    const sandbox = await ctx.getSandbox();
    const result = await sandbox.run({ command: `bun run /app/${pocFile}` });
    const stdout = (result as any).stdout ?? "";
    const exitCode = (result as any).exitCode ?? (result as any).code ?? 0;
    return {
      reproduced: exitCode === 0,
      exitCode,
      // project down to a compact summary for the model (toModelOutput-style)
      summary: stdout.split("\n").slice(-8).join("\n"),
    };
  },
});
