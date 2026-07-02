/**
 * Local-source ingestion — the pre-deployment audit path (SENTINEL_LOCAL_SOURCES registry). Node RPC
 * is not exercised here (STACKS_NODE_URL is unset in tests → node reads return null), so these isolate
 * the local path: a registered .clar resolves with origin "local"; anything unregistered/missing → null
 * (no silent stub, per the credibility rules).
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchSourceById, sourceReadEnabled } from "./contract-source";

/** Write a fixture .clar + a registry JSON in a fresh temp dir; return the registry path. */
function seed(registry: Record<string, unknown>, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "sentinel-src-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  const registryPath = join(dir, `registry-${Object.keys(registry).length}-${Date.now()}.json`);
  // Rewrite relative paths in the registry to absolute temp paths.
  writeFileSync(registryPath, JSON.stringify(registry));
  return registryPath;
}

const CID = "SP000000000000000000002Q6VF78.pox-5";
const CLAR =
  "(define-public (pause-rewards) (ok true))\n(define-data-var rewards-paused bool false)\n";

describe("fetchSourceById — local pre-deployment path", () => {
  test("a registered contract resolves with origin=local, the pinned ref, and publishHeight -1", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sentinel-src-"));
    const clarPath = join(dir, "pox-5.clar");
    writeFileSync(clarPath, CLAR);
    const registryPath = join(dir, "reg.json");
    writeFileSync(registryPath, JSON.stringify({ [CID]: { path: clarPath, ref: "d78f15a" } }));
    process.env.SENTINEL_LOCAL_SOURCES = registryPath;

    const res = await fetchSourceById(CID);
    expect(res).not.toBeNull();
    expect(res?.origin).toBe("local");
    expect(res?.ref).toBe("d78f15a");
    expect(res?.publishHeight).toBe(-1);
    expect(res?.lineCount).toBe(3);
    expect(res?.source).toContain("pause-rewards");
  });

  test("the bare-string entry form (contractId -> path) also resolves", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sentinel-src-"));
    const clarPath = join(dir, "c.clar");
    writeFileSync(clarPath, CLAR);
    const registryPath = join(dir, "reg-bare.json");
    writeFileSync(registryPath, JSON.stringify({ [CID]: clarPath }));
    process.env.SENTINEL_LOCAL_SOURCES = registryPath;

    const res = await fetchSourceById(CID);
    expect(res?.origin).toBe("local");
    expect(res?.ref).toBeUndefined();
  });

  test("an unregistered contractId returns null (no node URL, no stub)", async () => {
    const registryPath = seed({ [CID]: "/nope.clar" }, {});
    process.env.SENTINEL_LOCAL_SOURCES = registryPath;
    expect(await fetchSourceById("SP.other.contract")).toBeNull();
  });

  test("a registered-but-missing file returns null, never a stub", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sentinel-src-"));
    const registryPath = join(dir, "reg-missing.json");
    writeFileSync(registryPath, JSON.stringify({ [CID]: join(dir, "does-not-exist.clar") }));
    process.env.SENTINEL_LOCAL_SOURCES = registryPath;
    expect(await fetchSourceById(CID)).toBeNull();
  });

  test("sourceReadEnabled is true when a local registry is configured", () => {
    process.env.SENTINEL_LOCAL_SOURCES = "/some/registry.json";
    expect(sourceReadEnabled()).toBe(true);
  });
});
