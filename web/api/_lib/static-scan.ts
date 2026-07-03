// Zero-LLM static scan of Clarity source: pattern-match known risk-surface constructs and report
// counts + sample lines, grouped by dimension. No severity, no verdict — this is "surface area we
// found," never a claim about safety. Deliberately conservative (a short, high-signal pattern list)
// over exhaustive: a noisy scan (e.g. flagging bare `tx-sender`, which appears in nearly every
// contract) is worse than a short useful one.
import type { ScanDimension, ScanSignal } from "../../src/lib/scan"

const MAX_SAMPLE_LINES = 3

const PATTERNS: { label: string; dimension: ScanDimension; re: RegExp }[] = [
  { label: "Executes as the contract itself", dimension: "access-control", re: /\bas-contract\b/ },
  { label: "Caller-gated logic (asserts on tx-sender)", dimension: "access-control", re: /\basserts!\b.*\btx-sender\b|\btx-sender\b.*\basserts!\b/ },
  { label: "Calls into another contract", dimension: "external-call", re: /\bcontract-call\?\s/ },
  { label: "Moves STX directly", dimension: "asset-transfer", re: /\bstx-transfer\?\s/ },
  { label: "Moves a fungible token directly", dimension: "asset-transfer", re: /\bft-transfer\?\s/ },
  { label: "Moves a non-fungible token directly", dimension: "asset-transfer", re: /\bnft-transfer\?\s/ },
  { label: "Public setter (parameter-changing function)", dimension: "admin-surface", re: /\(define-public\s+\(set-/ },
]

export function runStaticScan(source: string): ScanSignal[] {
  const lines = source.split("\n")
  const signals: ScanSignal[] = []

  for (const pattern of PATTERNS) {
    const sampleLines: ScanSignal["sampleLines"] = []
    let count = 0
    lines.forEach((text, i) => {
      if (!pattern.re.test(text)) return
      count += 1
      if (sampleLines.length < MAX_SAMPLE_LINES) sampleLines.push({ line: i + 1, text: text.trim() })
    })
    if (count > 0) signals.push({ label: pattern.label, dimension: pattern.dimension, count, sampleLines })
  }

  return signals
}
