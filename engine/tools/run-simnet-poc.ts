/**
 * MCP tool — reproduce a finding in the isolated, airgapped simnet sandbox (the load-bearing
 * "green PoC" step; never touches mainnet). Replaces eve's docker() backend with a direct
 * `docker run --rm --network none` of the baked image (simnet/Dockerfile,
 * `bun run sandbox:build` → audit-sentinel-simnet:local). Agent sees `mcp__sentinel__run_simnet_poc`.
 *
 * Two modes:
 *  - `pocFile` (default poc/finding-1.ts): run a PoC baked into the image.
 *  - `pocSource`: run a NEW PoC the agent authored — written to a host-visible scratch dir and
 *    mounted at /app/poc/_dynamic.ts so it resolves the image's node_modules + simnet root exactly
 *    like a baked PoC. The source must be self-contained (deploy the fetched contract via
 *    `initSimnet` + `simnet.deployContract`, exercise the bug, exit non-zero on failure) — see
 *    simnet/poc/finding-1.ts for the pattern.
 *
 * Deploy (Phase 6): the worker reaches Docker via the host socket (Docker-out-of-Docker). Bind mounts
 * resolve on the HOST, so the scratch dir must be visible to both the worker and the host daemon —
 * set SENTINEL_SANDBOX_HOSTDIR to a shared bind-mount (in local dev, worker fs == host fs, so the OS
 * tmpdir works). Distinguishes sandbox-unavailable (→ pocStatus "pending") from a PoC failure (→ "failed").
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const IMAGE = process.env.SENTINEL_SANDBOX_IMAGE ?? "audit-sentinel-simnet:local";
const SAFE_POC = /^[a-z0-9][a-z0-9/_-]*\.ts$/;
const TIMEOUT_MS = Number(process.env.SENTINEL_POC_TIMEOUT_MS ?? 120_000);
/** Scratch dir visible to BOTH this process and the host docker daemon (DooD bind-mount). */
const SCRATCH_DIR = process.env.SENTINEL_SANDBOX_HOSTDIR ?? tmpdir();

/** True when the docker error means the daemon/CLI is unavailable (→ pending, not a PoC failure). */
function isSandboxUnavailable(stderr: string, errCode?: string): boolean {
  if (errCode === "ENOENT") return true; // docker binary not found
  return /cannot connect to the docker daemon|failed to connect to the docker|daemon (is )?running|docker\.sock|no such image|unable to find image|error during connect/i.test(
    stderr,
  );
}

function runDocker(args: string[]): {
  stdout: string;
  stderr: string;
  status: number | null;
  errCode?: string;
} {
  const proc = spawnSync("docker", args, { encoding: "utf8", timeout: TIMEOUT_MS });
  return {
    stdout: proc.stdout ?? "",
    stderr: proc.stderr ?? "",
    status: proc.status,
    errCode: (proc.error as NodeJS.ErrnoException | undefined)?.code,
  };
}

export const runSimnetPocTool = tool(
  "run_simnet_poc",
  "Reproduce a confirmed high/critical finding by running a Clarity simnet PoC in the isolated, airgapped (--network none) sandbox. Provide `pocSource` (a self-contained TS PoC that deploys the fetched contract source via initSimnet/simnet.deployContract and exits non-zero if the bug doesn't reproduce — see finding-1.ts pattern) for a NEW finding, or `pocFile` for a baked PoC. If the sandbox is unavailable, set pocStatus 'pending' (do NOT retry). Never runs against mainnet.",
  {
    pocFile: z
      .string()
      .optional()
      .describe("Baked PoC path inside the image, relative to /app (e.g. poc/finding-1.ts)."),
    pocSource: z
      .string()
      .optional()
      .describe("Inline TS PoC source for a NEW finding; mounted + run airgapped."),
  },
  async ({ pocFile, pocSource }) => {
    let result: ReturnType<typeof runDocker>;
    let scratch: string | null = null;

    if (pocSource) {
      scratch = mkdtempSync(join(SCRATCH_DIR, "sentinel-poc-"));
      const file = join(scratch, "_dynamic.ts");
      writeFileSync(file, pocSource, "utf8");
      result = runDocker([
        "run",
        "--rm",
        "--network",
        "none",
        "-v",
        `${file}:/app/poc/_dynamic.ts:ro`,
        IMAGE,
        "bun",
        "run",
        "/app/poc/_dynamic.ts",
      ]);
    } else {
      const f = pocFile ?? "poc/finding-1.ts";
      if (!SAFE_POC.test(f) || f.includes("..")) {
        return {
          content: [
            {
              type: "text",
              text: `ERROR: invalid pocFile "${f}" (expected a safe path like poc/finding-1.ts)`,
            },
          ],
        };
      }
      result = runDocker(["run", "--rm", "--network", "none", IMAGE, "bun", "run", `/app/${f}`]);
    }

    try {
      if (result.status === null && result.errCode) {
        return {
          content: [
            {
              type: "text",
              text: `SANDBOX UNAVAILABLE (set pocStatus "pending"): ${result.errCode}`,
            },
          ],
        };
      }
      if (isSandboxUnavailable(result.stderr, result.errCode)) {
        return {
          content: [
            {
              type: "text",
              text: `SANDBOX UNAVAILABLE (set pocStatus "pending"): ${result.stderr.slice(0, 300)}`,
            },
          ],
        };
      }
      const exitCode = result.status ?? 1;
      const reproduced = exitCode === 0;
      const tail = (result.stdout + (result.stderr ? `\n[stderr]\n${result.stderr}` : ""))
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
    } finally {
      if (scratch) rmSync(scratch, { recursive: true, force: true });
    }
  },
);
