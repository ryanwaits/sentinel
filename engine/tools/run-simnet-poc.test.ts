/**
 * Fork-preflight tests — the security-relevant gate on the fork PoC substrate. `forkPreflight` is
 * pure (env passed explicitly, no docker, no network), so every refusal branch is pinned here: a fork
 * PoC must NOT run without containment (internal network + egress proxy), and must carry its source.
 * The full contained run is proven by the manual E2E; this stops the refusal from silently regressing
 * into open egress.
 */
import { describe, expect, test } from "bun:test";
import { forkPreflight } from "./run-simnet-poc";

const OK_ENV = { sandboxNetwork: "sentinel-sandbox", egressProxy: "http://sentinel-egress-proxy:8899" };
const SRC = "console.log('poc')";

describe("forkPreflight", () => {
  test("refuses when the sandbox network is missing → unavailable (pending)", () => {
    const r = forkPreflight({ sandboxNetwork: "", egressProxy: OK_ENV.egressProxy, pocSource: SRC });
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ kind: "unavailable" });
    expect("message" in r && r.message).toContain("SENTINEL_SANDBOX_NETWORK");
  });

  test("refuses when the egress proxy is missing → unavailable (pending)", () => {
    const r = forkPreflight({ sandboxNetwork: OK_ENV.sandboxNetwork, egressProxy: "", pocSource: SRC });
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ kind: "unavailable" });
  });

  test("does not degrade to open egress — the message steers to airgapped", () => {
    const r = forkPreflight({ sandboxNetwork: "", egressProxy: "", pocSource: SRC });
    expect("message" in r && r.message).toContain("airgapped");
  });

  test("errors when pocSource is missing even with containment present", () => {
    const r = forkPreflight({ ...OK_ENV, pocSource: undefined });
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ kind: "error" });
    expect("message" in r && r.message).toContain("pocSource");
  });

  test("allows when containment is configured and a source is supplied", () => {
    expect(forkPreflight({ ...OK_ENV, pocSource: SRC })).toEqual({ ok: true });
  });
});
