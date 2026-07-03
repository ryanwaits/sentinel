import { Chip } from "@/components/primitives"
import type { ScanDimension, ScanResult } from "@/lib/scan"

const DIMENSION_LABEL: Record<ScanDimension, string> = {
  "access-control": "access control",
  "asset-transfer": "asset transfer",
  "external-call": "external call",
  "admin-surface": "admin surface",
}

const STATUS_MESSAGE: Partial<Record<ScanResult["status"], string>> = {
  "invalid-id": "That doesn't look like a Stacks contract id — expected SP…/ST….contract-name.",
  "not-found": "Couldn't resolve that contract on-chain. Check the address and try again.",
  "rate-limited": "You've hit today's scan limit. Try again tomorrow, or request early access below.",
  error: "Scan failed. Try again in a moment.",
}

export function ScanTeaser({ result }: { result: ScanResult }) {
  const notice = STATUS_MESSAGE[result.status]
  if (notice) {
    return (
      <div className="rounded-lg border border-border bg-secondary px-3.5 py-3">
        <p className="text-[13.5px] text-muted-foreground">{notice}</p>
        {result.degraded && <p className="mt-1.5 text-[11.5px] text-faint">{result.degraded}</p>}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <span className="truncate font-mono text-[12.5px] text-muted-foreground">{result.contractId}</span>
        <span className="shrink-0 font-mono text-[11.5px] text-faint">{result.lineCount} lines scanned</span>
      </div>

      {result.signals.length === 0 ? (
        <p className="mt-4 text-[13.5px] text-muted-foreground">
          No obvious value-transfer or admin-surface patterns found in a quick static pass. That's not a clearance
          — a full audit looks a lot deeper.
        </p>
      ) : (
        <div className="mt-4 grid gap-2.5">
          {result.signals.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-secondary/50 px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="ghost">{DIMENSION_LABEL[s.dimension]}</Chip>
                <span className="text-[13.5px] font-medium text-ink-strong">{s.label}</span>
                <span className="ml-auto font-mono text-[12px] text-faint">×{s.count}</span>
              </div>
              {s.sampleLines[0] && (
                <div className="mt-2 truncate font-mono text-[11.5px] text-faint">
                  L{s.sampleLines[0].line} {s.sampleLines[0].text}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {result.degraded && <p className="mt-3 text-[11.5px] text-faint">{result.degraded}</p>}

      <p className="mt-4 text-[12px] leading-relaxed text-faint">
        A static pass, not an audit — no severity, no verification, no PoC. The full multi-agent audit finds and
        proves a lot more than pattern-matching can.
      </p>
    </div>
  )
}
