import { afterEach, describe, expect, test } from "bun:test";
import { jevConfidenceFloor, jevDropFloor, jevEnabled, jevWaiveFloor } from "./jev";

const saved = {
  mock: process.env.SENTINEL_AUDIT_MOCK,
  jev: process.env.SENTINEL_JEV,
  key: process.env.TYPESAFE_API_KEY,
  jevKey: process.env.JEV_API_KEY,
  floor: process.env.SENTINEL_JEV_CONFIDENCE,
  waive: process.env.SENTINEL_JEV_WAIVE_CONFIDENCE,
  drop: process.env.SENTINEL_JEV_DROP_CONFIDENCE,
};

function restore(name: keyof typeof saved, env: string) {
  const v = saved[name];
  if (v === undefined) delete process.env[env];
  else process.env[env] = v;
}

afterEach(() => {
  restore("mock", "SENTINEL_AUDIT_MOCK");
  restore("jev", "SENTINEL_JEV");
  restore("key", "TYPESAFE_API_KEY");
  restore("jevKey", "JEV_API_KEY");
  restore("floor", "SENTINEL_JEV_CONFIDENCE");
  restore("waive", "SENTINEL_JEV_WAIVE_CONFIDENCE");
  restore("drop", "SENTINEL_JEV_DROP_CONFIDENCE");
});

describe("jevEnabled", () => {
  test("off under SENTINEL_AUDIT_MOCK even with a key", () => {
    process.env.SENTINEL_AUDIT_MOCK = "1";
    process.env.TYPESAFE_API_KEY = "sk-test";
    delete process.env.SENTINEL_JEV;
    expect(jevEnabled()).toBe(false);
  });

  test("off when SENTINEL_JEV=0", () => {
    delete process.env.SENTINEL_AUDIT_MOCK;
    process.env.SENTINEL_JEV = "0";
    process.env.TYPESAFE_API_KEY = "sk-test";
    expect(jevEnabled()).toBe(false);
  });

  test("on with TYPESAFE_API_KEY and no kill-switch", () => {
    delete process.env.SENTINEL_AUDIT_MOCK;
    delete process.env.SENTINEL_JEV;
    process.env.TYPESAFE_API_KEY = "sk-test";
    delete process.env.JEV_API_KEY;
    expect(jevEnabled()).toBe(true);
  });

  test("on with JEV_API_KEY fallback", () => {
    delete process.env.SENTINEL_AUDIT_MOCK;
    delete process.env.SENTINEL_JEV;
    delete process.env.TYPESAFE_API_KEY;
    process.env.JEV_API_KEY = "sk-test";
    expect(jevEnabled()).toBe(true);
  });

  test("off without a key", () => {
    delete process.env.SENTINEL_AUDIT_MOCK;
    delete process.env.SENTINEL_JEV;
    delete process.env.TYPESAFE_API_KEY;
    delete process.env.JEV_API_KEY;
    expect(jevEnabled()).toBe(false);
  });
});

describe("jevConfidenceFloor", () => {
  test("defaults to 0.6", () => {
    delete process.env.SENTINEL_JEV_CONFIDENCE;
    expect(jevConfidenceFloor()).toBe(0.6);
  });

  test("reads SENTINEL_JEV_CONFIDENCE", () => {
    process.env.SENTINEL_JEV_CONFIDENCE = "0.8";
    expect(jevConfidenceFloor()).toBe(0.8);
  });

  test("junk → 0.6", () => {
    process.env.SENTINEL_JEV_CONFIDENCE = "nope";
    expect(jevConfidenceFloor()).toBe(0.6);
  });
});

describe("risk-scaled floors", () => {
  test("waive defaults 0.75, drop defaults 0.85", () => {
    delete process.env.SENTINEL_JEV_WAIVE_CONFIDENCE;
    delete process.env.SENTINEL_JEV_DROP_CONFIDENCE;
    expect(jevWaiveFloor()).toBe(0.75);
    expect(jevDropFloor()).toBe(0.85);
  });
});
