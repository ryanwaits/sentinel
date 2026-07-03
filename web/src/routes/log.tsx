import { useParams, useLocation, Link } from "react-router-dom"
import { ShieldCheck, ArrowLeft } from "lucide-react"
import { Chip } from "@/components/primitives"
import { PanelHost, PanelLink, PanelBody, useReducedMotion, useWide } from "@/components/panel"
import { usePanelStack, slugForItem, itemForSlug, type PanelItem } from "@/lib/panel-store"
import { AUDIT_CASES, CASE_BY_ID } from "@/lib/audit"
import { cn } from "@/lib/utils"

const NOTABLE = ["zest.F1", "ccd002.F1", "dlmm.F1"]
const SHIFT = (620 + 16) / 2

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 mt-10 border-b border-border pb-2 font-mono text-[11px] uppercase tracking-wider text-faint">
      {children}
    </div>
  )
}

/** A live-TOC row: margin tick when open, dimmed when another entry is open. */
function Entry({ item, children }: { item: PanelItem; children: React.ReactNode }) {
  const stack = usePanelStack()
  const idx = stack.findIndex((s) => s.kind === item.kind && s.id === item.id)
  const open = idx >= 0
  const isTop = open && idx === stack.length - 1
  const dim = stack.length > 0 && !open

  return (
    <div data-log-entry={slugForItem(item)} className="relative">
      {open && (
        <span
          className="absolute -left-5 top-[19px] size-[5px] rounded-[1px] animate-in fade-in slide-in-from-left-1 duration-200"
          style={{ background: isTop ? "var(--primary)" : "var(--foreground)", opacity: isTop ? 1 : 0.4 }}
        />
      )}
      <PanelLink
        item={item}
        className={cn(
          "block border-t border-border py-4 transition-opacity duration-300 first:border-t-0",
          dim && "opacity-40",
        )}
      >
        {children}
      </PanelLink>
    </div>
  )
}

function AuditEntry({ id }: { id: string }) {
  const c = CASE_BY_ID[id]
  return (
    <Entry item={{ kind: "audit", id }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[15px] font-medium text-ink-strong">{c.contract.name}</span>
        <Chip tone="neutral">{c.contract.arch}</Chip>
        <span className="font-mono text-[12px] text-muted-foreground">{c.contract.tvl}</span>
      </div>
      <p className="mt-1.5 text-[13.5px] text-muted-foreground">{c.summary}.</p>
    </Entry>
  )
}

function FindingEntry({ slug }: { slug: string }) {
  const item = itemForSlug(slug)
  const [caseId, fid] = item.id.split(":")
  const c = CASE_BY_ID[caseId]
  const f = c?.findings.find((x) => x.id === fid)
  if (!f) return null
  return (
    <Entry item={item}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[15px] font-medium text-ink-strong">{f.title}</span>
        <span className="font-mono text-[12px] text-muted-foreground">
          {c.contract.name} · fn {f.fn}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {f.severity && (
          <Chip tone={f.severity === "critical" ? "critical" : f.severity === "high" ? "accent" : "warning"}>
            {f.severity.toUpperCase()}
          </Chip>
        )}
        <Chip tone={f.cls === "bug" ? "neutral" : "ghost"}>{f.cls === "bug" ? "● bug" : "◐ centralization"}</Chip>
        {f.poc === "green" && <Chip tone="success">PoC green</Chip>}
      </div>
    </Entry>
  )
}

function LogIndex() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[900px] items-center gap-3 px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-ink-strong">
            <ShieldCheck className="size-[21px] text-primary" strokeWidth={1.6} />
            Sentinel
          </Link>
          <span className="flex-1" />
          <Link to="/" className="text-[14px] text-muted-foreground transition-colors hover:text-ink-strong">
            Home
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[620px] px-6 pb-32 pt-14">
        <h1 className="text-[clamp(28px,4vw,40px)] font-semibold tracking-tight text-ink-strong">Findings log</h1>
        <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-muted-foreground">
          Every audit Sentinel has run, and what it found. Bug or centralization, labeled honestly, with a green PoC
          where there is one. Open any entry.
        </p>

        <SectionLabel>Audits</SectionLabel>
        {AUDIT_CASES.map((c) => (
          <AuditEntry key={c.id} id={c.id} />
        ))}

        <SectionLabel>Findings</SectionLabel>
        {NOTABLE.map((slug) => (
          <FindingEntry key={slug} slug={slug} />
        ))}
      </main>
    </div>
  )
}

function ShiftWrapper({ children }: { children: React.ReactNode }) {
  const stack = usePanelStack()
  const wide = useWide()
  const reduce = useReducedMotion()
  const shifted = stack.length > 0 && wide
  return (
    <div
      style={{
        transform: shifted ? `translateX(-${SHIFT}px) scale(0.99)` : "none",
        transformOrigin: "center top",
        transition: reduce ? "none" : "transform 340ms cubic-bezier(0.22, 1, 0.36, 1)",
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
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-[720px] items-center gap-3 px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-ink-strong">
            <ShieldCheck className="size-[21px] text-primary" strokeWidth={1.6} />
            Sentinel
          </Link>
          <span className="flex-1" />
          <Link
            to="/log"
            className="flex items-center gap-1.5 text-[14px] text-muted-foreground transition-colors hover:text-ink-strong"
          >
            <ArrowLeft className="size-4" /> Findings log
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[720px] px-6 py-10">
        <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-panel">
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
    <div className="min-h-screen bg-background">
      <ShiftWrapper>
        <LogIndex />
      </ShiftWrapper>
      <PanelHost />
    </div>
  )
}
