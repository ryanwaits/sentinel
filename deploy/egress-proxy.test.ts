/**
 * Egress-proxy decision tests — the fork-sandbox discriminator. `classifyConnect` is the whole
 * allow/deny rule (CONNECT-only, TLS-port-only, host allowlist); testing it pure means no sockets,
 * no ports, no timing. The end-to-end containment (internal docker network + real socket) is proven
 * separately by the manual E2E; this pins the decision logic so a regression can't silently open egress.
 */
import { describe, expect, test } from "bun:test";
import { classifyConnect, parseConnect } from "./egress-proxy";

const head = (line: string) => `${line}\r\nHost: x\r\n\r\n`;
const ALLOW = new Set(["api.hiro.so"]);
const PORTS = new Set([443]);

describe("parseConnect", () => {
  test("parses a well-formed CONNECT", () => {
    expect(parseConnect(head("CONNECT api.hiro.so:443 HTTP/1.1"))).toEqual({
      host: "api.hiro.so",
      port: 443,
    });
  });
  test("lowercases the host", () => {
    const p = parseConnect(head("CONNECT API.HIRO.SO:443 HTTP/1.1"));
    expect("host" in p && p.host).toBe("api.hiro.so");
  });
  test("rejects a non-CONNECT method", () => {
    expect(parseConnect(head("GET http://api.hiro.so/ HTTP/1.1"))).toHaveProperty("error");
  });
  test("rejects a target with no port", () => {
    expect(parseConnect(head("CONNECT api.hiro.so HTTP/1.1"))).toHaveProperty("error");
  });
});

describe("classifyConnect", () => {
  test("allows an allowlisted host on 443", () => {
    expect(classifyConnect(head("CONNECT api.hiro.so:443 HTTP/1.1"), ALLOW, PORTS)).toEqual({
      action: "allow",
      host: "api.hiro.so",
      port: 443,
    });
  });

  test("denies a non-allowlisted host (403)", () => {
    const d = classifyConnect(head("CONNECT evil.example.com:443 HTTP/1.1"), ALLOW, PORTS);
    expect(d.action).toBe("deny");
    expect(d).toMatchObject({ status: "403 Forbidden" });
    expect("reason" in d && d.reason).toContain("host");
  });

  test("denies an allowlisted host on a non-TLS port (403) — no plaintext exfil", () => {
    const d = classifyConnect(head("CONNECT api.hiro.so:80 HTTP/1.1"), ALLOW, PORTS);
    expect(d.action).toBe("deny");
    expect(d).toMatchObject({ status: "403 Forbidden" });
    expect("reason" in d && d.reason).toContain("port");
  });

  test("denies a non-CONNECT method (405)", () => {
    const d = classifyConnect(head("GET http://api.hiro.so/ HTTP/1.1"), ALLOW, PORTS);
    expect(d).toMatchObject({ action: "deny", status: "405 Method Not Allowed" });
  });

  test("denies a malformed target (405)", () => {
    const d = classifyConnect(head("CONNECT garbage HTTP/1.1"), ALLOW, PORTS);
    expect(d).toMatchObject({ action: "deny", status: "405 Method Not Allowed" });
  });

  test("host match is case-insensitive against the allowlist", () => {
    expect(classifyConnect(head("CONNECT Api.Hiro.So:443 HTTP/1.1"), ALLOW, PORTS).action).toBe(
      "allow",
    );
  });

  test("deny-all when the allowlist is empty", () => {
    expect(classifyConnect(head("CONNECT api.hiro.so:443 HTTP/1.1"), new Set(), PORTS).action).toBe(
      "deny",
    );
  });
});
