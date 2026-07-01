// Typed mock data for the Sentinel control plane, drawn from the real
// Adjudication / Finding / KBRecord shapes and real contracts (Zest, CCD002, DLMM).

export type Lane = "prevention" | "detection"
export type Severity = "critical" | "high" | "medium" | "info"
export type Verdict = "confirmed" | "uncertain" | "refuted"
export type Poc = "green" | "pending" | "na"
export type AlertState = "open" | "missed" | "ack" | "info"

export interface Alert {
  id: string
  lane: Lane
  state: AlertState
  severity: Severity
  cls: "bug" | "centralization" | "info"
  verdict: Verdict
  poc: Poc
  origin: "audit" | "incident"
  contract: string
  fn: string
  target?: string
  title: string
  detail: string
  precondition?: string
  action: string
  blast: string
  veto?: { left: number; deadline: string; eta: string }
  tx: string
  block: string
  when: string
  cost?: string
  confidence?: number
}

export const ALERTS: Alert[] = [
  {
    id: "ccd002-prop", lane: "prevention", state: "open",
    severity: "critical", cls: "bug", verdict: "confirmed", poc: "green", origin: "audit",
    contract: "ccd002-treasury-mia-mining-v3", fn: "execute", target: "SP2C2…mia-drain-v1",
    title: "Incoming proposal would drain the treasury on execution",
    detail: "Audited the proposal contract inside its timelock. It transfers the full STX + FT balance to an out-of-DAO principal with no cap. Reproduced in the sandbox.",
    action: "Veto before block 8,445,230. After the timelock elapses this executes and becomes irreversible.",
    blast: "100% of treasury balance (≈ 4.1M STX + 2 FTs)",
    veto: { left: 6, deadline: "8,445,230", eta: "≈ 58 min" },
    tx: "0x3af1…c204", block: "8,445,086", when: "just now", cost: "$1.92",
  },
  {
    id: "pool-upgrade", lane: "prevention", state: "missed",
    severity: "high", cls: "centralization", verdict: "confirmed", poc: "na", origin: "audit",
    contract: "pool-registry-v3", fn: "set-implementation", target: "SP9K…impl-v4",
    title: "Implementation swapped to unaudited code",
    detail: "An upgrade proposal pointed the proxy at a new implementation. Audit finished after the timelock had already elapsed, so this is a record, not a veto opportunity.",
    action: "Executed at block 8,444,905. Review the live implementation and disclose if the swap is hostile.",
    blast: "All pool deposits under the proxy",
    tx: "0x77bd…9a10", block: "8,444,905", when: "3h ago", cost: "$2.14",
  },
  {
    id: "zest-socialize", lane: "detection", state: "open",
    severity: "high", cls: "bug", verdict: "uncertain", poc: "green", origin: "incident", confidence: 0.6,
    contract: "v0-vault-sbtc", fn: "socialize-debt",
    title: "Possible exploitation: socialize-debt unbounded LP loss",
    detail: "A function with a proven vulnerability (Finding 1, green PoC) was invoked on-chain. This is a correlation, not a confirmed exploit.",
    precondition: "Verify this call passed an unbounded scaled-amount, not a routine authorized write-down.",
    action: "If the precondition holds, LP redemption value can be driven to zero while sBTC stays locked. Notify Zest and open incident response.",
    blast: "Up to 100% of LP redemption value",
    tx: "0x9bd8…dba7", block: "8,445,071", when: "12 min ago",
  },
  {
    id: "dlmm-outflow", lane: "detection", state: "open",
    severity: "high", cls: "info", verdict: "uncertain", poc: "na", origin: "incident", confidence: 0.5,
    contract: "dlmm-pool-stx-usdcx", fn: "outflow · stx",
    title: "Anomalous STX outflow to a new counterparty",
    detail: "An outflow of 1,853,058,049 µSTX left the pool. That exceeds the historical max over the last 300 outflows, and the recipient is not among the 4 known counterparties.",
    action: "No known-finding match. Behavioral anomaly only. Confirm this is an expected LP withdrawal before escalating.",
    blast: "1,853.06 STX to SP2V3…RDWT (new)",
    tx: "0xbdb8…ba71", block: "8,445,090", when: "20 min ago",
  },
  {
    id: "dlmm-normal", lane: "detection", state: "info",
    severity: "info", cls: "info", verdict: "uncertain", poc: "na", origin: "incident", confidence: 0.4,
    contract: "dlmm-pool-stx-usdcx", fn: "outflow · usdcx",
    title: "Outflow within baseline",
    detail: "7.29M µUSDCx to a known counterparty, below the p95 of normal flow. Logged for the record.",
    action: "No action. Surfaced so the feed is honest about what passed the filter.",
    blast: "7.29 USDCx to SP120…2CNE (known)",
    tx: "0x1c04…8fe2", block: "8,445,061", when: "41 min ago",
  },
  {
    id: "zest-borrow", lane: "detection", state: "ack",
    severity: "high", cls: "centralization", verdict: "confirmed", poc: "na", origin: "incident",
    contract: "v0-vault-sbtc", fn: "system-borrow",
    title: "Authorized market drew liquidity to an external receiver",
    detail: "system-borrow is trust-gated (an authorized contract), an accepted centralization assumption in the KB. Surfaced once.",
    action: "Acknowledged by you, 2h ago. Suppressed from paging unless the authorized set changes.",
    blast: "Bounded by the authorized-market allowlist",
    tx: "0x4410…12aa", block: "8,444,802", when: "2h ago",
  },
]

export interface Contract {
  name: string
  principal: string
  arch: string
  status: "live" | "auditing" | "paused"
  fns: number | null
  sigs: number | null
  subs: string
  alerts: { critical?: number; high?: number; info?: number }
  audit: string
  spend: string
}

export const CONTRACTS: Contract[] = [
  { name: "ccd002-treasury-mia-mining-v3", principal: "SP8A9…ccd002-treasury", arch: "dao", status: "live", fns: 4, sigs: 1, subs: "6 / 6", alerts: { critical: 1 }, audit: "3d ago · $1.88", spend: "$0.90" },
  { name: "v0-vault-sbtc", principal: "SP1A27…v0-vault-sbtc", arch: "vault", status: "live", fns: 4, sigs: 1, subs: "9 / 9", alerts: { high: 1 }, audit: "4d ago · $2.21", spend: "$1.42" },
  { name: "dlmm-pool-stx-usdcx", principal: "SM1FKX…dlmm-pool", arch: "amm", status: "live", fns: 3, sigs: 0, subs: "5 / 5", alerts: { high: 1, info: 1 }, audit: "6d ago · $1.64", spend: "$1.74" },
  { name: "pool-registry-v3", principal: "SP9K…pool-registry-v3", arch: "proxy", status: "auditing", fns: null, sigs: null, subs: "provisioning", alerts: {}, audit: "in progress", spend: "—" },
]

export const TRIG_LABEL: Record<string, string> = {
  "governance.proposal_submitted": "gov · proposal",
  "governance.proxy_upgrade": "gov · upgrade",
  "transfer.outflow": "transfer · outflow",
  "counterparty.new": "counterparty · new",
}
