/**
 * The findings contract for the audit engine — the JSON Schema the model fills via `outputFormat`,
 * mirroring `monitoring/adjudication.ts` `Finding`/`SentinelFindings` so an audit's output feeds
 * straight into `adjudicate()` (no [SENTINEL-FINDINGS] text-parsing). Validation on the way back is
 * the zod `SentinelFindings` from adjudication — single source of truth for the shape.
 */
export const FINDINGS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
          class: { type: "string", enum: ["bug", "centralization", "info"] },
          verifierVerdict: { type: "string", enum: ["confirmed", "refuted", "uncertain"] },
          pocStatus: { type: "string", enum: ["green", "pending", "failed", "na"] },
          pocSubstrate: {
            type: "string",
            enum: ["airgapped", "fork"],
            description:
              "the substrate the PoC ran on — set from the run_simnet_poc result (substrate=fork|airgapped); a fork green is stronger evidence. Omit if no PoC ran.",
          },
          confidence: { type: "number" },
          blastRadius: { type: "string" },
          recommendedAction: { type: "string" },
          targetFn: {
            type: "string",
            description:
              "the function this finding concerns (anchors a Type-2 detection signature)",
          },
          targetAsset: {
            type: "string",
            description: "asset at risk for an outflow-class bug: ft identifier or 'stx'",
          },
          precondition: {
            type: "string",
            description:
              "the condition under which the bug is exploitable (the human's discriminator on a runtime match)",
          },
        },
        required: [
          "title",
          "severity",
          "class",
          "verifierVerdict",
          "pocStatus",
          "blastRadius",
          "recommendedAction",
        ],
      },
    },
  },
  required: ["findings"],
} as const;

/** Baseline-audit output: findings PLUS a KB candidate (archetype + sensitive fns) for distillation.
 *  The orchestrator fills `kbCandidate` from the source it already fetched — no extra model call. */
export const KB_DISTILL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    findings: FINDINGS_SCHEMA.properties.findings,
    kbCandidate: {
      type: "object",
      additionalProperties: false,
      properties: {
        archetype: {
          type: "string",
          enum: ["governance-dao", "vault", "amm", "treasury", "token", "other"],
        },
        sensitiveFns: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              triggerClass: {
                type: "string",
                enum: [
                  "governance.proposal_submitted",
                  "governance.proxy_upgrade",
                  "counterparty.new",
                  "transfer.outflow",
                ],
              },
              callerAllowlist: { type: "array", items: { type: "string" } },
              suggestedOutflowThreshold: {
                type: "object",
                additionalProperties: false,
                description:
                  "for a transfer.outflow fn ONLY: a SUGGESTED starting threshold from an on-chain cap you can identify in the source. OMIT entirely if there is no cap (never guess 0/null) — advisory, a human promotes it.",
                properties: { asset: { type: "string" }, amount: { type: "string" } },
                required: ["asset", "amount"],
              },
            },
            required: ["name", "triggerClass", "callerAllowlist"],
          },
        },
      },
      required: ["archetype", "sensitiveFns"],
    },
  },
  required: ["findings", "kbCandidate"],
} as const;
