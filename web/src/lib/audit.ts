// Canonical audit data + types. ONE source of truth shared by the app screens
// (audit-detail, onboarding, monitoring-plan) and the marketing preview (home).
// The preview renders the same components + data as the real product.

export type FindingSeverity = "critical" | "high" | "medium" | null

export interface Finding {
  id: string
  title: string
  fn: string
  severity: FindingSeverity
  cls: "bug" | "centralization"
  verdict: "confirmed" | "refuted"
  poc: "green" | "na"
  asserts?: string
  pocFile?: string
  /** terminal body for a green-PoC finding; rendered by <PocTerminal> */
  pocLines?: string[]
  pocHeader?: string
  blast?: string
  desc: string
  waived?: boolean
  refutedBy?: string
}

export interface ScopeItem {
  fn: string
  rule: string
  kind: "prevention" | "detection"
}

export interface AuditRun {
  tier: "deep" | "monitor"
  when: string
  model: string
  cost: string
  duration: string
  turns: number
  subagents: number
  tokens: string
}

export interface AuditCase {
  id: string
  contract: { name: string; principal: string; arch: string; tvl: string }
  run: AuditRun
  /** the log line that lands mid-run once a finding surfaces */
  landLine: string
  /** honest one-line verdict summary */
  summary: string
  /** the real Clarity source the audit runs on (a focused excerpt) */
  code: string
  findings: Finding[]
  scope: ScopeItem[]
}

/** The real pipeline phases, in order. Status is derived from progress. */
export const AUDIT_PHASES = [
  "Discover value and entrypoints",
  "Audit with 5 specialist subagents",
  "Adversarially verify each finding",
  "Reproduce in the airgapped sandbox",
  "Distill the monitoring scope",
] as const

export const AUDIT_CASES: AuditCase[] = [
  {
    id: "zest",
    contract: { name: "v0-vault-sbtc", principal: "SP1A27…v0-vault-sbtc", arch: "vault", tvl: "≈ 51 BTC" },
    run: { tier: "deep", when: "4d ago", model: "Opus 4.8", cost: "$2.21", duration: "8m 24s", turns: 47, subagents: 5, tokens: "1.24M" },
    landLine: "socialize-debt: unbounded scaled-amount, no cap. reproducing…",
    summary: "1 confirmed bug (green PoC), 1 centralization (waived), 1 refuted and dropped",
    code: `;; v0-vault-sbtc  ·  the audited function
(define-public (socialize-debt (scaled-amount uint))
  (begin
    ;; caller must be an authorized market
    (try! (is-authorized-market contract-caller))
    ;; no cap, no attested loss  <- the finding
    (var-set total-scaled
      (- (var-get total-scaled) scaled-amount))
    (ok (var-get total-scaled))))`,
    findings: [
      {
        id: "F1",
        title: "socialize-debt forces unbounded LP loss",
        fn: "socialize-debt",
        severity: "critical",
        cls: "bug",
        verdict: "confirmed",
        poc: "green",
        asserts: "15 / 15",
        pocFile: "simnet/poc/finding-1.ts",
        pocHeader: "run_simnet_poc · finding-1.ts · docker run --network none",
        pocLines: [
          "$ docker run --rm --network none audit-sentinel-simnet",
          "deploying v0-vault-sbtc + sbtc-token in simnet…",
          "call socialize-debt(scaled-amount: u50000000000)  ← one authorized market",
          "assert total-assets == u0  ok",
          "assert redeem() reverts ERR-OUTPUT-ZERO  ok",
          "assert 50001000 sats sBTC locked  ok",
          "✓ FINDING 1 REPRODUCED: 15 assertions passed.",
        ],
        blast: "100% of LP redemption value",
        desc: "Any single authorized market can call socialize-debt with an unbounded scaled-amount. No cap, no precondition, no attested loss. It drives total-assets to zero, so LP redemption reverts ERR-OUTPUT-ZERO while the sBTC stays locked.",
      },
      {
        id: "F2",
        title: "Authorized markets can draw vault liquidity",
        fn: "system-borrow",
        severity: "medium",
        cls: "centralization",
        verdict: "confirmed",
        poc: "na",
        waived: true,
        blast: "Bounded by the authorized-market allowlist",
        desc: "system-borrow lets a trust-gated authorized contract move liquidity to an external receiver. This is a centralization / trust assumption, not a bug: it is bounded by the authorized-market allowlist and is by design. Labeled as such, and waived in the monitoring plan (surfaced once).",
      },
      {
        id: "F3",
        title: "Possible reentrancy in redeem withdrawal",
        fn: "redeem",
        severity: null,
        cls: "bug",
        verdict: "refuted",
        poc: "na",
        refutedBy: "adversarial verifier",
        desc: "An auditor subagent flagged a possible reentrancy in redeem. The adversarial verifier refuted it: redeem debits shares before the sBTC transfer, and there is no external call back into the vault on this path. Dropped before it could ship.",
      },
    ],
    scope: [
      { fn: "socialize-debt", rule: "watch for exploitation of this finding", kind: "detection" },
      { fn: "system-borrow · sBTC", rule: "outflow ≥ p99 baseline (770,115 sats)", kind: "detection" },
      { fn: "governance", rule: "proposals audited inside the timelock", kind: "prevention" },
    ],
  },
  {
    id: "dlmm",
    contract: { name: "dlmm-pool-stx-usdcx", principal: "SM1FKX…dlmm-pool", arch: "amm", tvl: "≈ 1.8M STX" },
    run: { tier: "deep", when: "6d ago", model: "Opus 4.8", cost: "$1.64", duration: "6m 02s", turns: 39, subagents: 5, tokens: "0.94M" },
    landLine: "no unbounded or unauthorized withdrawal path. learning baseline from 300 transfers…",
    summary: "No exploitable bug, 2 centralization notes (by design)",
    code: `;; dlmm-pool-stx-usdcx  ·  admin surface
(define-data-var fee-bps uint u30)

(define-public (set-fee (new-bps uint))
  (begin
    ;; trust-gated, not a bug: bounded by a max
    (try! (is-dao-or-owner))
    (asserts! (<= new-bps u100) ERR-FEE-TOO-HIGH)
    (var-set fee-bps new-bps)
    (ok new-bps)))`,
    findings: [
      {
        id: "F1",
        title: "Admin can change swap fees",
        fn: "set-fee",
        severity: "medium",
        cls: "centralization",
        verdict: "confirmed",
        poc: "na",
        blast: "Fee parameters, bounded by a max",
        desc: "set-fee is admin-gated, a trust assumption rather than a bug. It is bounded by a hard-coded maximum. We would rather label this honestly than inflate it into a critical.",
      },
      {
        id: "F2",
        title: "Admin can pause the pool",
        fn: "set-paused",
        severity: null,
        cls: "centralization",
        verdict: "confirmed",
        poc: "na",
        blast: "Halts swaps, cannot move funds",
        desc: "A pause switch, trust-gated. It cannot move or seize funds, only stop trading. Noted, not flagged as a vulnerability.",
      },
    ],
    scope: [
      { fn: "outflow · stx", rule: "≥ p99 (1.71B µSTX) or a new counterparty", kind: "detection" },
      { fn: "outflow · usdcx", rule: "≥ p99, learned from on-chain history", kind: "detection" },
      { fn: "set-fee, set-paused", rule: "any admin call, trust-gated", kind: "detection" },
    ],
  },
  {
    id: "ccd002",
    contract: { name: "ccd002-treasury-mia", principal: "SP8A9…ccd002-treasury", arch: "dao", tvl: "≈ 4.1M STX" },
    run: { tier: "deep", when: "3d ago", model: "Opus 4.8", cost: "$1.88", duration: "7m 10s", turns: 44, subagents: 5, tokens: "1.08M" },
    landLine: "execute() runs any passed proposal. checking proposal gating…",
    summary: "1 centralization finding (a trust assumption, not a code bug)",
    code: `;; ccd002-treasury  ·  proposal execution
(define-public (execute
    (proposal <proposal-trait>)
    (sender principal))
  (begin
    (try! (is-approved proposal))
    ;; runs whatever governance passed
    (as-contract
      (contract-call? proposal execute sender))))`,
    findings: [
      {
        id: "F1",
        title: "Treasury executes whatever governance passes",
        fn: "execute",
        severity: "medium",
        cls: "centralization",
        verdict: "confirmed",
        poc: "na",
        blast: "Full treasury balance, on a malicious passed proposal",
        desc: "Not a code bug, a trust assumption: a malicious passed proposal can move the full balance. The mitigation is watching the timelock, not patching the contract, so we label it as centralization and monitor the proposal window.",
      },
    ],
    scope: [
      { fn: "execute · proposal", rule: "new proposals audited in the timelock, veto window", kind: "prevention" },
      { fn: "treasury outflow", rule: "≥ p99 baseline", kind: "detection" },
    ],
  },
]

export const CASE_BY_ID = Object.fromEntries(AUDIT_CASES.map((c) => [c.id, c])) as Record<string, AuditCase>
