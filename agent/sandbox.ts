import { defineSandbox } from "eve/sandbox";
import { docker } from "eve/sandbox/docker";

/**
 * Sandbox backend: self-hosted Docker, airgapped.
 *
 * - `docker()` runs the sandbox in a local container (OSS, no Vercel, no KVM).
 * - `networkPolicy: "deny-all"` — simnet/exploit PoCs need ZERO egress, so we
 *   block all network (Docker honors deny-all / allow-all).
 * - The image bakes bun + @stacks/clarinet-sdk + @secondlayer/stacks + the PoC
 *   (see simnet/Dockerfile), so the sandbox is self-contained and offline.
 *
 * Validated: `docker run --rm --network none audit-sentinel-simnet:local`
 * reproduces Finding 1 (15/15 assertions) with no network.
 *
 * Upgrade paths (researched): gVisor `runsc` for stronger no-KVM isolation;
 * `microsandbox()` (Network.none()) for microVM isolation on a KVM host;
 * Daytona behind a custom SandboxBackend when this becomes multi-tenant.
 */
export default defineSandbox({
  backend: docker({
    image: "audit-sentinel-simnet:local",
    networkPolicy: "deny-all",
  }),
});
