import { useState } from "react"
import { useParams, useLocation } from "react-router-dom"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Chip, SeverityDot } from "@/components/primitives"
import { SiteHeader, SiteFooter } from "@/components/site-shell"
import { PanelHost, PanelLink, PanelBody, useReducedMotion, useWide } from "@/components/panel"
import { usePanelStack, slugForItem, itemForSlug, type PanelItem } from "@/lib/panel-store"
import { AUDIT_CASES, CASE_BY_ID, type Finding } from "@/lib/audit"
import { EASE, DUR } from "@/lib/motion"
import type { Severity } from "@/lib/mock"
import { cn } from "@/lib/utils"

/** Dense log: leading severity dot, ringed when open or hovered, dimmed when another entry is open. */
function Row({
  item,
  severity = "info",
  glow,
  children,
}: {
  item: PanelItem
  severity?: Severity
  glow?: boolean
  children: React.ReactNode
}) {
  const stack = usePanelStack()
  const idx = stack.findIndex((s) => s.kind === item.kind && s.id === item.id)
  const open = idx >= 0
  const dim = stack.length > 0 && !open

  return (
    <div data-log-entry={slugForItem(item)} className="relative">
      <PanelLink
        item={item}
        className={cn(
          "group flex gap-2.5 border-t border-border px-3 py-2.5 transition duration-300 first:border-t-0",
          dim && "opacity-40",
        )}
      >
        <div className="pt-[3px]">
          <span
            className={cn(
              "block rounded-full ring-offset-2 ring-offset-background transition-shadow duration-200 group-hover:ring-2 group-hover:ring-border-strong",
              open && "ring-2 ring-border-strong",
            )}
          >
            <SeverityDot severity={severity} glow={glow} />
          </span>
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </PanelLink>
    </div>
  )
}

const KIND_LABEL = "font-mono text-[10px] uppercase tracking-wider text-faint"

function AuditRow({ id }: { id: string }) {
  const c = CASE_BY_ID[id]
  return (
    <Row item={{ kind: "audit", id }}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={KIND_LABEL}>audit</span>
        <span className="font-mono text-[13.5px] font-medium text-ink-strong">{c.contract.name}</span>
        <Chip tone="neutral">{c.contract.arch}</Chip>
        <span className="ml-auto font-mono text-[11.5px] text-faint">{c.run.when}</span>
      </div>
      <p className="mt-1 truncate text-[12.5px] text-muted-foreground">{c.summary}.</p>
    </Row>
  )
}

function FindingRow({ caseId, f }: { caseId: string; f: Finding }) {
  const c = CASE_BY_ID[caseId]
  const severity: Severity = f.severity ?? "info"
  return (
    <Row
      item={{ kind: "finding", id: `${caseId}:${f.id}` }}
      severity={severity}
      glow={severity === "critical" || severity === "high"}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={KIND_LABEL}>finding</span>
        <span className="font-mono text-[12px] text-muted-foreground">{c.contract.name}</span>
        <span className="text-[13.5px] font-medium text-ink-strong">{f.title}</span>
        <span className="ml-auto font-mono text-[11.5px] text-faint">{c.run.when}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {f.severity && (
          <Chip tone={f.severity === "critical" ? "critical" : f.severity === "high" ? "accent" : "warning"}>
            {f.severity.toUpperCase()}
          </Chip>
        )}
        <Chip tone={f.cls === "bug" ? "neutral" : "ghost"}>{f.cls === "bug" ? "● bug" : "◐ centralization"}</Chip>
        {f.poc === "green" && <Chip tone="success">PoC green</Chip>}
        {f.waived && <Chip tone="ghost">waived</Chip>}
        {f.verdict === "refuted" && <Chip tone="ghost">refuted</Chip>}
      </div>
    </Row>
  )
}

type StreamItem =
  | { type: "audit"; id: string; when: number }
  | { type: "finding"; id: string; caseId: string; f: Finding; when: number }

/** Every audit and finding, interleaved into one chronological stream, newest first. */
function buildStream(): StreamItem[] {
  const rows: StreamItem[] = []
  for (const c of AUDIT_CASES) {
    const when = Number.parseInt(c.run.when, 10) || 0
    rows.push({ type: "audit", id: c.id, when })
    for (const f of c.findings) {
      rows.push({ type: "finding", id: `${c.id}:${f.id}`, caseId: c.id, f, when })
    }
  }
  return rows.sort((a, b) => a.when - b.when)
}

const PAGE_SIZE = 5

function LogIndex() {
  const stream = buildStream()
  const [page, setPage] = useState(0)
  const totalPages = Math.ceil(stream.length / PAGE_SIZE)
  const pageItems = stream.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <ShiftWrapper>
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-32 pt-14">
        <div className="mx-auto max-w-[720px]">
          <div className="text-center">
            <h1 className="text-[clamp(28px,4vw,40px)] font-semibold tracking-tight text-ink-strong">Findings log</h1>
            <p className="mx-auto mt-3 max-w-[58ch] text-[15px] leading-relaxed text-muted-foreground">
              Every audit Sentinel has run, and what it found. Bug or centralization, labeled honestly, with a green
              PoC where there is one. Open any entry.
            </p>
          </div>

          <div className="mt-8 overflow-hidden rounded-[10px] border border-border text-left">
            <div className="flex items-center gap-2 border-b border-border bg-secondary px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-faint">
              <span className="size-[7px] rounded-full bg-primary" />
              sentinel · log tail · {stream.length} entries, newest first
            </div>
            <div className="px-1.5">
              {pageItems.map((r) =>
                r.type === "audit" ? (
                  <AuditRow key={r.id} id={r.id} />
                ) : (
                  <FindingRow key={r.id} caseId={r.caseId} f={r.f} />
                ),
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-2.5 font-mono text-[11.5px] text-faint">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1 transition-colors hover:text-ink-strong disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronLeft className="size-3.5" /> prev
                </button>
                <span>
                  page {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="flex items-center gap-1 transition-colors hover:text-ink-strong disabled:pointer-events-none disabled:opacity-40"
                >
                  next <ChevronRight className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
      </ShiftWrapper>
      <SiteFooter />
    </div>
  )
}

/** Softly blurs only the main body content when a card is open — header/nav and footer stay put. */
function ShiftWrapper({ children }: { children: React.ReactNode }) {
  const stack = usePanelStack()
  const wide = useWide()
  const reduce = useReducedMotion()
  const blurred = stack.length > 0 && wide
  return (
    <div
      className="flex flex-1 flex-col"
      style={{
        filter: blurred ? "blur(2px)" : "none",
        transition: reduce ? "none" : `filter ${DUR}ms ${EASE}`,
      }}
    >
      {children}
    </div>
  )
}

/** Hard navigation / deep link to /log/:id renders the full standalone page, not a card. */
function Standalone({ slug }: { slug: string }) {
  const item = itemForSlug(slug)
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader back={{ label: "Findings log", to: "/log" }} />
      <main className="mx-auto max-w-[1280px] px-6 py-10">
        <div className="max-w-[720px] overflow-hidden rounded-[10px] border border-border bg-card shadow-panel">
          <PanelBody item={item} />
        </div>
      </main>
    </div>
  )
}

export default function LogPage() {
  const { id } = useParams()
  const location = useLocation()
  const isPanel = !!location.state?.panel

  if (id && !isPanel) return <Standalone slug={id} />

  return (
    <>
      <LogIndex />
      <PanelHost />
    </>
  )
}
