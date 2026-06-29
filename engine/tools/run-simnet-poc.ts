/**
 * MCP tool — reproduce a finding in the isolated, airgapped simnet sandbox (the load-bearing
 * "green PoC" step; never touches mainnet). Replaces eve's docker() backend with a direct
 * `docker run --rm --network none` of the same baked image (simnet/Dockerfile,
 * `bun run sandbox:build` → audit-sentinel-simnet:local). The agent sees it as
 * `mcp__sentinel__run_simnet_poc`.
 *
 * Distinguishes a sandbox-unavailable condition (docker daemon down / image missing → the agent
 * should set pocStatus "pending", NOT "failed") from a genuine PoC failure (non-zero exit → "failed").
 */
import { spawnSync } from "node:child_process";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const IMAGE = process.env.SENTINEL_SANDBOX_IMAGE ?? "audit-sentinel-simnet:local";
const SAFE_POC = /^[a-z0-9][a-z0-9/_-]*\.ts$/;
const TIMEOUT_MS = Number(process.env.SENTINEL_POC_TIMEOUT_MS ?? 120_000);

/** True when the docker error means the daemon/CLI is unavailable (→ pending, not a PoC failure). */
function isSandboxUnavailable(stderr: string, errCode?: string): boolean {
  if (errCode === "ENOENT") return true; // docker binary not found
  return /cannot connect to the docker daemon|failed to connect to the docker|daemon (is )?running|docker\.sock|no such image|unable to find image|error during connect/i.test(
    stderr,
  );
}

export const runSimnetPocTool = tool(
  "run_simnet_poc",
  "Reproduce a confirmed high/critical finding by running a Clarity simnet PoC in the isolated, airgapped (--network none) sandbox. Returns whether it reproduced. If the sandbox is unavailable, set the finding's pocStatus to 'pending' (do NOT retry repeatedly). Never runs against mainnet.",
  {
    pocFile: z
      .string()
      .default("poc/finding-1.ts")
      .describe(
        "PoC runner path inside the baked image, relative to /app (e.g. poc/finding-1.ts).",
      ),
  },
  async ({ pocFile }) => {
    if (!SAFE_POC.test(pocFile) || pocFile.includes("..")) {
      return {
        content: [
          {
            type: "text",
            text: `ERROR: invalid pocFile "${pocFile}" (expected a safe path like poc/finding-1.ts)`,
          },
        ],
      };
    }
    const proc = spawnSync(
      "docker",
      ["run", "--rm", "--network", "none", IMAGE, "bun", "run", `/app/${pocFile}`],
      { encoding: "utf8", timeout: TIMEOUT_MS },
    );
    const stdout = proc.stdout ?? "";
    const stderr = proc.stderr ?? "";

    if (
      proc.error ||
      isSandboxUnavailable(stderr, (proc.error as NodeJS.ErrnoException | undefined)?.code)
    ) {
      return {
        content: [
          {
            type: "text",
            text: `SANDBOX UNAVAILABLE (set pocStatus "pending"): ${proc.error?.message ?? stderr.slice(0, 300)}`,
          },
        ],
      };
    }
    const exitCode = proc.status ?? 1;
    const reproduced = exitCode === 0;
    const tail = (stdout + (stderr ? `\n[stderr]\n${stderr}` : ""))
      .split("\n")
      .slice(-12)
      .join("\n");
    return {
      content: [
        {
          type: "text",
          text: `reproduced=${reproduced} exitCode=${exitCode} (pocStatus ${reproduced ? "green" : "failed"})\n${tail}`,
        },
      ],
    };
  },
);
