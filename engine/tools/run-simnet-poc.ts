/**
 * MCP tool — reproduce a finding in the isolated simnet sandbox (the load-bearing "green PoC" step;
 * never touches mainnet). Runs the baked image (simnet/Dockerfile, `bun run sandbox:build` →
 * audit-sentinel-simnet:local). Agent sees `mcp__sentinel__run_simnet_poc`.
 *
 * TWO SUBSTRATES. They are not interchangeable, and the choice is reported so a reader knows which
 * kind of evidence they are looking at:
 *
 *  - `airgapped` (DEFAULT) — `docker run --network none`, zero egress. The PoC deploys contract
 *    source it fetched, plus whatever stubs it needs. Right for logic bugs, and the correct default
 *    for model-authored code. Weakness: a reviewer can always ask whether the reconstruction matches
 *    what is actually deployed.
 *  - `fork` — clarinet `[repl.remote_data]` reads UNMODIFIED deployed bytecode and real chain state
 *    at a pinned height, executed locally. Nothing is signed and nothing is broadcast. Strictly
 *    stronger evidence, and the only substrate that can reproduce a bug which depends on live state
 *    (real balances, roles, prices). Costs: needs chain reads at run time, so it cannot be airgapped.
 *
 * Fork containment (measured, see deploy/egress-proxy.ts): the sandbox joins a docker `--internal`
 * network with no route off-host, and the allowlist proxy is its only peer. HTTPS_PROXY alone is NOT
 * containment — a raw socket ignores it — so fork mode REFUSES TO RUN unless the internal network is
 * configured, rather than silently falling back to open egress.
 *
 * Two source modes, orthogonal to substrate:
 *  - `pocFile` (default poc/finding-1.ts): a PoC baked into the image.
 *  - `pocSource`: a NEW PoC the agent authored, written to a host-visible scratch dir and mounted so
 *    it resolves the image's node_modules exactly like a baked PoC. Must be self-contained and exit
 *    non-zero on failure. Patterns: simnet/poc/finding-1.ts (airgapped),
 *    simnet/poc/hermetica-v2-express-lock-fork.ts (fork).
 *
 * Deploy (Phase 6): the worker reaches Docker via the host socket (Docker-out-of-Docker). Bind mounts
 * resolve on the HOST, so the scratch dir must be visible to both the worker and the host daemon —
 * set SENTINEL_SANDBOX_HOSTDIR to a shared bind-mount (in local dev, worker fs == host fs, so the OS
 * tmpdir works). Distinguishes sandbox-unavailable (→ pocStatus "pending") from a PoC failure (→ "failed").
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const IMAGE = process.env.SENTINEL_SANDBOX_IMAGE ?? "audit-sentinel-simnet:local";
const SAFE_POC = /^[a-z0-9][a-z0-9/_-]*\.ts$/;
const TIMEOUT_MS = Number(process.env.SENTINEL_POC_TIMEOUT_MS ?? 120_000);
/** Scratch dir visible to BOTH this process and the host docker daemon (DooD bind-mount). */
const SCRATCH_DIR = process.env.SENTINEL_SANDBOX_HOSTDIR ?? tmpdir();

/** Fork substrate. Absent SANDBOX_NETWORK there is no containment, so fork mode errors out. */
const SANDBOX_NETWORK = process.env.SENTINEL_SANDBOX_NETWORK ?? "";
const EGRESS_PROXY = process.env.SENTINEL_EGRESS_PROXY ?? "";
const FORK_API_URL = process.env.SENTINEL_FORK_API_URL ?? "https://api.hiro.so";
/** Confirmation margin: pin below the tip so the fork does not race a reorg. */
const FORK_TIP_MARGIN = Number(process.env.SENTINEL_FORK_TIP_MARGIN ?? 10);
/** Where the generated fork project is mounted inside the sandbox. */
const FORK_MOUNT = "/app/fork";

/** Clarinet needs a manifest + a settings file on disk; both are generated per run, never baked. */
function writeForkProject(dir: string, height: number): void {
  mkdirSync(join(dir, "settings"), { recursive: true });
  writeFileSync(
    join(dir, "Clarinet.toml"),
    `[project]\nname = "sentinel-fork"\ndescription = "Generated per run by run_simnet_poc. Reads unmodified mainnet contracts + state at a pinned height; executes locally, broadcasts nothing."\nauthors = []\ntelemetry = false\nrequirements = []\n\n[repl.remote_data]\nenabled = true\napi_url = "${FORK_API_URL}"\ninitial_height = ${height}\n`,
    "utf8",
  );
  // Standard clarinet devnet accounts. These are throwaway simnet identities, never mainnet keys —
  // the fork impersonates real principals by sender string, so no real key is present anywhere.
  writeFileSync(
    join(dir, "settings", "Devnet.toml"),
    `[network]\nname = "devnet"\ndeployment_fee_rate = 10\n\n[accounts.deployer]\nmnemonic = "twice kind fence tip hidden tilt action fragile skin nothing glory cousin green tomorrow spring wrist shed math olympic multiply hip blue scout claw"\nbalance = 100_000_000_000_000\n\n[accounts.wallet_1]\nmnemonic = "sell invite acquire kitten bamboo drastic jelly vivid peace spawn twice guilt pave pen trash pretty park cube fragile unaware remain midnight betray rebuild"\nbalance = 100_000_000_000_000\n\n[accounts.wallet_2]\nmnemonic = "hold excess usual excess ring elephant install account glad dry fragile donkey gaze humble truck breeze nation gasp vacuum limb head keep delay hospital"\nbalance = 100_000_000_000_000\n`,
    "utf8",
  );
}

export type ForkPreflight =
  | { ok: true }
  | { ok: false; kind: "unavailable" | "error"; message: string };

/**
 * Pure fork-mode gate — decide whether a fork PoC may run, WITHOUT touching docker or the network.
 * `unavailable` (missing containment) maps to pocStatus "pending" at the call site; `error` (missing
 * pocSource) is a hard input error. Env values are passed explicitly so this unit-tests deterministically.
 * Refuse rather than degrade: without the internal network there is no containment, and a PoC that
 * ignores HTTPS_PROXY would reach the open internet — silent fallback would be false safety.
 */
export function forkPreflight(args: {
  sandboxNetwork: string;
  egressProxy: string;
  pocSource?: string;
}): ForkPreflight {
  if (!args.sandboxNetwork || !args.egressProxy) {
    return {
      ok: false,
      kind: "unavailable",
      message:
        "SANDBOX UNAVAILABLE (set pocStatus \"pending\"): fork substrate needs SENTINEL_SANDBOX_NETWORK + SENTINEL_EGRESS_PROXY (the internal network + allowlist proxy from deploy/docker-compose.yml). Refusing to run a fork PoC with unrestricted egress. Re-run with substrate 'airgapped' instead.",
    };
  }
  if (!args.pocSource) {
    return { ok: false, kind: "error", message: "ERROR: fork substrate requires `pocSource`." };
  }
  return { ok: true };
}

/** Resolve the chain tip so a run that did not pin a height still records exactly what it read. */
async function resolveForkHeight(requested?: number): Promise<number> {
  if (requested && requested > 0) return requested;
  const res = await fetch(`${FORK_API_URL}/v2/info`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok)
    throw new Error(`could not read chain tip from ${FORK_API_URL}/v2/info (${res.status})`);
  const info = (await res.json()) as { stacks_tip_height?: number };
  if (!info.stacks_tip_height) throw new Error("chain tip response missing stacks_tip_height");
  return Math.max(1, info.stacks_tip_height - FORK_TIP_MARGIN);
}

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
  [
    "Reproduce a confirmed finding by running a Clarity simnet PoC in the isolated sandbox. Never touches mainnet; nothing is ever broadcast.",
    "Choose a substrate. 'airgapped' (default, --network none, zero egress): your PoC deploys contract source you fetched, plus stubs — right for logic bugs. 'fork': clarinet remote_data reads the UNMODIFIED deployed bytecode and REAL chain state (live balances, roles, prices) at a pinned height; use it when the bug depends on live state, or to produce the strongest possible evidence for a confirmed finding. In fork mode do NOT deploy anything: call initSimnet(process.env.SENTINEL_FORK_MANIFEST) and call the real contracts by their mainnet ids, sending as any real principal (no keys needed).",
    "Provide `pocSource` (self-contained TS, exits non-zero if the bug doesn't reproduce) for a NEW finding, or `pocFile` for a baked PoC. Patterns: poc/finding-1.ts (airgapped), poc/hermetica-v2-express-lock-fork.ts (fork).",
    "If the sandbox is unavailable, set pocStatus 'pending' (do NOT retry).",
  ].join(" "),
  {
    pocFile: z
      .string()
      .optional()
      .describe("Baked PoC path inside the image, relative to /app (e.g. poc/finding-1.ts)."),
    pocSource: z
      .string()
      .optional()
      .describe("Inline TS PoC source for a NEW finding; mounted + run in the sandbox."),
    substrate: z
      .enum(["airgapped", "fork"])
      .optional()
      .describe(
        "'airgapped' (default): zero egress, you deploy the contracts. 'fork': real deployed bytecode + real chain state, read-only.",
      ),
    forkHeight: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Fork only: pin to this Stacks block height. Omit to pin just below the chain tip.",
      ),
  },
  async ({ pocFile, pocSource, substrate = "airgapped", forkHeight }) => {
    const fail = (text: string) => ({ content: [{ type: "text" as const, text }] });
    let result: ReturnType<typeof runDocker>;
    let scratch: string | null = null;
    let pinnedHeight: number | null = null;

    if (substrate === "fork") {
      const pre = forkPreflight({
        sandboxNetwork: SANDBOX_NETWORK,
        egressProxy: EGRESS_PROXY,
        pocSource,
      });
      if (!pre.ok) return fail(pre.message);
      const source = pocSource as string; // preflight guarantees it is set
      try {
        pinnedHeight = await resolveForkHeight(forkHeight);
      } catch (e) {
        return fail(`SANDBOX UNAVAILABLE (set pocStatus "pending"): ${(e as Error).message}`);
      }
      scratch = mkdtempSync(join(SCRATCH_DIR, "sentinel-fork-"));
      writeForkProject(scratch, pinnedHeight);
      writeFileSync(join(scratch, "_dynamic.ts"), source, "utf8");
      // Mounted rw: clarinet writes a deployment plan and a state cache beside the manifest.
      result = runDocker([
        "run",
        "--rm",
        "--network",
        SANDBOX_NETWORK,
        "-e",
        `HTTPS_PROXY=${EGRESS_PROXY}`,
        "-e",
        `HTTP_PROXY=${EGRESS_PROXY}`,
        "-e",
        `SENTINEL_FORK_MANIFEST=${FORK_MOUNT}/Clarinet.toml`,
        "-v",
        `${scratch}:${FORK_MOUNT}`,
        IMAGE,
        "bun",
        "run",
        `${FORK_MOUNT}/_dynamic.ts`,
      ]);
    } else if (pocSource) {
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
        return fail(`ERROR: invalid pocFile "${f}" (expected a safe path like poc/finding-1.ts)`);
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
      // Substrate + pinned height are reported so the finding records WHAT KIND of proof this is.
      // A fork green is stronger evidence than an airgapped green; collapsing them would inflate the
      // weaker one. Carry `substrate` (and the height) into the finding you emit.
      const provenance =
        substrate === "fork"
          ? `substrate=fork forkHeight=${pinnedHeight} (unmodified deployed bytecode + real chain state)`
          : "substrate=airgapped (reconstructed contracts, zero egress)";
      return {
        content: [
          {
            type: "text",
            text: `reproduced=${reproduced} exitCode=${exitCode} (pocStatus ${reproduced ? "green" : "failed"}) ${provenance}\n${tail}`,
          },
        ],
      };
    } finally {
      if (scratch) rmSync(scratch, { recursive: true, force: true });
    }
  },
);
