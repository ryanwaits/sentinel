/**
 * Notify tests — warn-once idempotency, provisional→green promotion, no auto-disclosure. State is
 * isolated via SENTINEL_SINK_DIR (set by the test script); each test uses a unique sessionId.
 */
import { describe, expect, test } from "bun:test";
import type { Adjudication } from "./adjudication";
import { notify, signStandardWebhook } from "./notify";
import { verifySignature } from "./sources/trigger-source";

function adj(sessionId: string, over: Partial<Adjudication> = {}): Adjudication {
  return {
    sessionId,
    contractId: "SP.x",
    severity: "high",
    class: "bug",
    alertLevel: "warn",
    pocStatus: "green",
    provisional: false,
    needsHuman: false,
    findings: [],
    suppressed: [],
    recommendedAction: "Review. Disclosure human-gated — no automated action taken.",
    tokenCostUsd: 1.5,
    ...over,
  };
}

describe("notify", () => {
  test("sends once, then warn-once suppresses re-notify", async () => {
    const a = adj("notify-warn-once");
    expect((await notify(a)).sent).toBe(true);
    const second = await notify(a);
    expect(second.sent).toBe(false);
    expect(second.reason).toContain("warn-once");
  });

  test("alertLevel none never sends", async () => {
    const r = await notify(adj("notify-none", { alertLevel: "none" }));
    expect(r.sent).toBe(false);
  });

  test("provisional → later green promotes (one extra notice)", async () => {
    const first = await notify(adj("notify-promote", { provisional: true, pocStatus: "pending" }));
    expect(first.sent).toBe(true);
    expect(first.level).toBe("WARN");

    const promoted = await notify(
      adj("notify-promote", { provisional: false, pocStatus: "green" }),
    );
    expect(promoted.sent).toBe(true);
    expect(promoted.promoted).toBe(true);
    expect(promoted.level).toBe("PROMOTED");

    // and no third notice
    expect(
      (await notify(adj("notify-promote", { provisional: false, pocStatus: "green" }))).sent,
    ).toBe(false);
  });

  test("never auto-discloses (no SENTINEL_NOTIFY_URL → no network, still 'sent' internally)", async () => {
    const prev = process.env.SENTINEL_NOTIFY_URL;
    delete process.env.SENTINEL_NOTIFY_URL;
    const r = await notify(adj("notify-no-disclose"));
    expect(r.sent).toBe(true);
    if (prev !== undefined) process.env.SENTINEL_NOTIFY_URL = prev;
  });
});

describe("signStandardWebhook (egress signing)", () => {
  test("round-trips with the ingress verifier; a tampered body fails", () => {
    const secret = `whsec_${Buffer.from("sentinel-notify-test-secret").toString("base64")}`;
    const body = JSON.stringify({ event: "sentinel_alert", severity: "high" });
    const ts = Math.floor(Date.now() / 1000); // current, so the verifier's timestamp tolerance passes
    const headers = signStandardWebhook(body, secret, "msg_test", ts);
    expect(headers["webhook-signature"]).toMatch(/^v1,/);
    expect(verifySignature(body, headers, secret)).toBe(true);
    expect(verifySignature(`${body} `, headers, secret)).toBe(false);
  });

  test("a wrong secret does not verify", () => {
    const secret = `whsec_${Buffer.from("real-secret").toString("base64")}`;
    const body = JSON.stringify({ x: 1 });
    const headers = signStandardWebhook(body, secret, "msg_test", Math.floor(Date.now() / 1000));
    expect(verifySignature(body, headers, `whsec_${Buffer.from("other").toString("base64")}`)).toBe(
      false,
    );
  });
});
