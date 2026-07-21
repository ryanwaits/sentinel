/**
 * Audit-request result store — lets the browser poll for an on-demand audit's outcome.
 *
 * `POST /audit` fires the audit ASYNC and returns 202 + a requestId; the verdict otherwise only reaches
 * `notify`. This is the bridge between: the request is registered "running", and when the pipeline
 * finishes the public result is stored under the same requestId for `GET /audit/:id` to return.
 *
 * MVP = an in-process Map (one worker process; lost on restart — fine for a single-tenant dev/design-
 * partner setup). The durable swap (KV/Postgres, keyed the same) is a backend-hardening item. Only a
 * PUBLIC projection of the adjudication is stored — never internal session/tool detail.
 */
import type { Adjudication } from "./adjudication";

export type PublicFinding = {
  title: string;
  severity: string;
  class: string;
  verdict: string;
  poc: string;
};

/** The browser-facing audit verdict — a trimmed, safe view of the adjudication. */
export type PublicResult = {
  severity: string;
  class: string;
  alertLevel: string;
  provisional: boolean;
  needsHuman: boolean;
  pocStatus: string;
  findings: PublicFinding[];
  recommendedAction: string;
  tokenCostUsd: number;
};

export type AuditRequestStatus =
  | { status: "running"; contractId: string; tier: string; startedAt: string }
  | {
      status: "done";
      contractId: string;
      tier: string;
      startedAt: string;
      finishedAt: string;
      result: PublicResult;
    }
  | {
      status: "error";
      contractId: string;
      tier: string;
      startedAt: string;
      finishedAt: string;
      error: string;
    };

const store = new Map<string, AuditRequestStatus>();

/** Trim an adjudication to the browser-safe public shape (kept findings only). */
export function toPublicResult(adj: Adjudication): PublicResult {
  return {
    severity: adj.severity,
    class: adj.class,
    alertLevel: adj.alertLevel,
    provisional: adj.provisional,
    needsHuman: adj.needsHuman,
    pocStatus: adj.pocStatus,
    findings: adj.findings
      .filter((f) => f.kept)
      .map((f) => ({
        title: f.title,
        severity: f.severity,
        class: f.class,
        verdict: f.verifierVerdict,
        poc: f.pocStatus,
      })),
    recommendedAction: adj.recommendedAction,
    tokenCostUsd: adj.tokenCostUsd,
  };
}

export function setAuditRunning(
  requestId: string,
  contractId: string,
  tier: string,
  now = new Date().toISOString(),
): void {
  store.set(requestId, { status: "running", contractId, tier, startedAt: now });
}

export function setAuditDone(
  requestId: string,
  result: PublicResult,
  now = new Date().toISOString(),
): void {
  const prev = store.get(requestId);
  store.set(requestId, {
    status: "done",
    contractId: prev?.contractId ?? "",
    tier: prev?.tier ?? "",
    startedAt: prev && "startedAt" in prev ? prev.startedAt : now,
    finishedAt: now,
    result,
  });
}

export function setAuditError(
  requestId: string,
  error: string,
  now = new Date().toISOString(),
): void {
  const prev = store.get(requestId);
  store.set(requestId, {
    status: "error",
    contractId: prev?.contractId ?? "",
    tier: prev?.tier ?? "",
    startedAt: prev && "startedAt" in prev ? prev.startedAt : now,
    finishedAt: now,
    error,
  });
}

export function getAuditStatus(requestId: string): AuditRequestStatus | null {
  return store.get(requestId) ?? null;
}
