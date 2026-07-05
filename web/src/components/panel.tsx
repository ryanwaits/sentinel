import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Chip } from "@/components/primitives"
import { RunMetrics, MonitoringScope, PocTerminal } from "@/components/audit"
import { CASE_BY_ID, type Finding } from "@/lib/audit"
import {
  panel, usePanelStack, slugForItem, itemForSlug, type PanelItem,
} from "@/lib/panel-store"
import { EASE, DUR } from "@/lib/motion"
import { cn } from "@/lib/utils"

const INSET = 16
const CARD_W = 620
const PEEK = 18
const SCALE_STEP = 0.025
const MAX_DEPTH = 3

/* ---------- media hooks ---------- */
function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const h = () => setMatch(m.matches)
    m.addEventListener("change", h)
    return () => m.removeEventListener("change", h)
  }, [query])
  return match
}
export const useReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)")
export const useWide = () => useMedia("(min-width: 900px)")

/* ---------- navigation controller (store + URL) ---------- */
export function usePanelNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const bg = (location.state?.background as string | undefined) ?? "/log"

  // Write the current stack to the URL: top card owns the path, and the FULL stack
  // rides in history.state so back/forward restore exact stacks (even after cycling).
  const sync = useCallback(
    (replace: boolean) => {
      const st = panel.get()
      if (!st.length) {
        navigate(bg, { replace })
        return
      }
      const top = st[st.length - 1]
      navigate(`/log/${slugForItem(top)}`, { replace, state: { panel: true, background: bg, stack: st } })
    },
    [navigate, bg],
  )

  return {
    open(item: PanelItem) {
      panel.open(item)
      sync(false) // push: opening is a real route (back closes it)
    },
    bringForward(item: PanelItem) {
      panel.open(item)
      sync(true)
    },
    cycle(dir: 1 | -1) {
      panel.cycle(dir)
      sync(true) // cycling = history.replace
    },
    closeTop() {
      panel.closeTop()
      sync(true)
    },
    dismissAll() {
      panel.clear()
      sync(false)
    },
  }
}

/* ---------- a link that opens / stacks a panel item ---------- */
export function PanelLink({
  item, className, children, ...rest
}: { item: PanelItem } & React.ComponentProps<"a">) {
  const nav = usePanelNav()
  return (
    <a
      href={`/log/${slugForItem(item)}`}
      data-panel-link=""
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return // allow open-in-new-tab
        e.preventDefault()
        nav.open(item)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}

/* ---------- card bodies (the real audit workflow) ---------- */
function FindingLink({ caseId, f }: { caseId: string; f: Finding }) {
  const refuted = f.verdict === "refuted"
  return (
    <PanelLink
      item={{ kind: "finding", id: `${caseId}:${f.id}` }}
      className="flex items-start gap-3 border-t border-border px-1 py-2.5 text-left transition-colors first:border-t-0 hover:bg-secondary"
    >
      <span className="w-5 pt-px font-mono text-[12px] text-faint">{f.id}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={cn("text-[13.5px] font-medium text-ink-strong", refuted && "line-through decoration-faint")}>
            {f.title}
          </span>
          <span className="font-mono text-[11.5px] text-muted-foreground">fn {f.fn}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {f.severity && (
            <Chip tone={f.severity === "critical" ? "critical" : f.severity === "high" ? "accent" : "warning"}>
              {f.severity.toUpperCase()}
            </Chip>
          )}
          <Chip tone={f.cls === "bug" ? "neutral" : "ghost"}>{f.cls === "bug" ? "● bug" : "◐ centralization"}</Chip>
          {f.poc === "green" && <Chip tone="success">PoC green</Chip>}
          {refuted && <Chip tone="ghost">refuted</Chip>}
        </div>
      </div>
    </PanelLink>
  )
}

function AuditBody({ caseId }: { caseId: string }) {
  const c = CASE_BY_ID[caseId]
  if (!c) return null
  return (
    <div className="grid gap-6 p-6">
      <div>
        <div className="font-mono text-[12px] text-muted-foreground">{c.contract.principal}</div>
        <p className="mt-2.5 text-[14px] text-foreground">{c.summary}.</p>
        <div className="mt-3.5">
          <RunMetrics run={c.run} />
        </div>
      </div>
      <div>
        <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-faint">Findings</div>
        <div className="rounded-[10px] border border-border bg-card px-3">
          {c.findings.map((f) => (
            <FindingLink key={f.id} caseId={caseId} f={f} />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-faint">What Sentinel would watch</div>
        <MonitoringScope scope={c.scope} />
      </div>
    </div>
  )
}

function FindingBody({ id }: { id: string }) {
  const [caseId, fid] = id.split(":")
  const c = CASE_BY_ID[caseId]
  const f = c?.findings.find((x) => x.id === fid)
  if (!c || !f) return null
  const refuted = f.verdict === "refuted"
  return (
    <div className="grid gap-4 p-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {f.severity && (
            <Chip tone={f.severity === "critical" ? "critical" : f.severity === "high" ? "accent" : "warning"}>
              {f.severity.toUpperCase()}
            </Chip>
          )}
          <Chip tone={f.cls === "bug" ? "neutral" : "ghost"}>{f.cls === "bug" ? "● bug" : "◐ centralization"}</Chip>
          <Chip tone="neutral">{refuted ? "refuted" : "confirmed"}</Chip>
          {f.poc === "green" && <Chip tone="success">PoC green · {f.asserts}</Chip>}
          {f.waived && <Chip tone="ghost">waived</Chip>}
        </div>
        <h3 className={cn("mt-3 text-[18px] font-semibold text-ink-strong", refuted && "line-through decoration-faint")}>
          {f.title}
        </h3>
        <div className="mt-1 font-mono text-[12.5px] text-muted-foreground">
          {c.contract.name} · fn {f.fn}
        </div>
      </div>
      <p className="max-w-[68ch] text-[14px] leading-relaxed text-foreground">{f.desc}</p>
      {refuted ? (
        <div className="rounded-[10px] border border-border bg-secondary px-4 py-3 text-[13px] text-muted-foreground">
          Refuted by the {f.refutedBy}. Not shipped, no PoC required.
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-[13px]">
          <div>
            <div className="mb-[3px] font-mono text-[10.5px] uppercase tracking-wider text-faint">Class</div>
            <span className="text-foreground">{f.cls === "bug" ? "Real bug" : "Centralization / trust"}</span>
          </div>
          {f.blast && (
            <div>
              <div className="mb-[3px] font-mono text-[10.5px] uppercase tracking-wider text-faint">Blast radius</div>
              <span className="font-mono">{f.blast}</span>
            </div>
          )}
          {f.pocFile && (
            <div>
              <div className="mb-[3px] font-mono text-[10.5px] uppercase tracking-wider text-faint">Reproduction</div>
              <span className="font-mono text-foreground">{f.pocFile}</span>
            </div>
          )}
        </div>
      )}
      {f.poc === "green" && <PocTerminal finding={f} />}
    </div>
  )
}

/** The card body for a given item (reused by the standalone hard-nav page). */
export function PanelBody({ item }: { item: PanelItem }) {
  return item.kind === "audit" ? <AuditBody caseId={item.id} /> : <FindingBody id={item.id} />
}

function cardLabel(item: PanelItem): { kind: string; name: string } {
  if (item.kind === "finding") {
    const [caseId, fid] = item.id.split(":")
    return { kind: "finding", name: `${CASE_BY_ID[caseId]?.contract.name ?? caseId} / ${fid}` }
  }
  return { kind: "audit", name: CASE_BY_ID[item.id]?.contract.name ?? item.id }
}

/* ---------- a single card ---------- */
function PanelCard({
  item, depth, isFront, count, exiting, onCycle, onClose, onBringForward,
}: {
  item: PanelItem
  depth: number
  isFront: boolean
  count: number
  exiting: boolean
  onCycle: (d: 1 | -1) => void
  onClose: () => void
  onBringForward: () => void
}) {
  const reduce = useReducedMotion()
  const wide = useWide()
  const [entered, setEntered] = useState(reduce)
  const bodyRef = useRef<HTMLDivElement>(null)
  const { kind, name } = cardLabel(item)
  const clamped = Math.min(depth, MAX_DEPTH)
  const hidden = depth >= MAX_DEPTH + 1

  useEffect(() => {
    if (reduce) return
    const r = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(r)
  }, [reduce])

  // move focus into the active card body when it becomes front
  useEffect(() => {
    if (isFront && entered && !exiting) bodyRef.current?.focus({ preventScroll: true })
  }, [isFront, entered, exiting])

  const resting = `translateX(${wide ? -PEEK * clamped : 0}px) scale(${1 - SCALE_STEP * clamped})`
  const transform = exiting
    ? "translateX(calc(100% + 40px))"
    : entered
      ? resting
      : "translateX(calc(100% + 32px))"

  return (
    <div
      aria-hidden={!isFront}
      onClick={!isFront && !exiting ? onBringForward : undefined}
      className="pointer-events-auto absolute"
      style={{
        bottom: INSET,
        right: INSET,
        width: `min(${CARD_W}px, calc(100vw - 20px))`,
        transform,
        transformOrigin: "right bottom",
        transition: reduce ? "none" : `transform ${DUR}ms ${EASE}, opacity ${DUR}ms ${EASE}`,
        opacity: hidden ? 0 : 1,
        zIndex: 10 + depth * -1 + 100, // front (depth 0) highest
        cursor: isFront ? "default" : "pointer",
        pointerEvents: exiting ? "none" : "auto",
      }}
    >
      <div
        className="shadow-panel flex min-h-[280px] flex-col overflow-hidden rounded-[10px] border border-border bg-card"
        style={{ maxHeight: `calc(100dvh - ${INSET * 2}px)` }}
      >
        {/* chrome */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
          <span className="text-ink-strong">{kind}</span>
          <span className="truncate text-faint">/ {name}</span>
          <span className="flex-1" />
          {count >= 2 && isFront && (
            <span className="flex items-center gap-3">
              <button className="transition-colors hover:text-ink-strong" aria-label="Previous card" onClick={() => onCycle(-1)}>
                ←
              </button>
              <button className="transition-colors hover:text-ink-strong" aria-label="Next card" onClick={() => onCycle(1)}>
                →
              </button>
              <span className="text-faint">{count} open</span>
            </span>
          )}
          {isFront && (
            <button className="transition-colors hover:text-ink-strong" onClick={onClose}>
              close [esc]
            </button>
          )}
        </div>
        {/* body */}
        <div
          ref={bodyRef}
          tabIndex={-1}
          data-panel-focus=""
          inert={!isFront ? true : undefined}
          className="flex-1 overflow-auto outline-none"
        >
          {item.kind === "audit" ? <AuditBody caseId={item.id} /> : <FindingBody id={item.id} />}
        </div>
        {/* paper wash for stacked cards (click brings forward) */}
        {!isFront && <div className="absolute inset-0 bg-card/45" />}
      </div>
    </div>
  )
}

/* ---------- the host: stack + keyboard + click-away + url sync ---------- */
export function PanelHost() {
  const stack = usePanelStack()
  const nav = usePanelNav()
  const location = useLocation()
  const reduce = useReducedMotion()
  const n = stack.length
  const top = stack.at(-1)

  // URL -> store reconcile. On back/forward the browser restores history.state,
  // whose `stack` snapshot we replay verbatim. Guarded to panel routes so leaving
  // (or a hard nav / standalone) never registers a ghost card.
  useEffect(() => {
    const path = location.pathname
    const st = location.state as { panel?: boolean; stack?: PanelItem[] } | null
    if (!path.startsWith("/log") || path === "/log" || !st?.panel) {
      panel.clear()
      return
    }
    if (st.stack) {
      panel.setStack(st.stack)
      return
    }
    const m = path.match(/^\/log\/(.+)$/)
    if (m) panel.setStack([itemForSlug(m[1])])
  }, [location.key, location.pathname, location.state])

  // keyboard: esc closes, arrows cycle (ignore while typing)
  useEffect(() => {
    if (!n) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      if (typing) return
      if (e.key === "Escape") {
        e.preventDefault()
        nav.closeTop()
      } else if (e.key === "ArrowLeft" && n >= 2) {
        e.preventDefault()
        nav.cycle(-1)
      } else if (e.key === "ArrowRight" && n >= 2) {
        e.preventDefault()
        nav.cycle(1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [n, nav])

  // click / focus outside dismisses everything, EXCEPT clicks on panel links (they stack)
  useEffect(() => {
    if (!n) return
    const outside = (e: Event) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      if (t.closest("[data-panel-card]") || t.closest("[data-panel-link]")) return
      if (t.closest(".shadow-panel")) return // inside a card
      nav.dismissAll()
    }
    document.addEventListener("pointerdown", outside)
    document.addEventListener("focusin", outside)
    return () => {
      document.removeEventListener("pointerdown", outside)
      document.removeEventListener("focusin", outside)
    }
  }, [n, nav])

  // auto-scroll the top card's source entry into view (centered), skip if visible
  useEffect(() => {
    if (!top) return
    const el = document.querySelector<HTMLElement>(`[data-log-entry="${slugForItem(top)}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    const visible = r.top >= 80 && r.bottom <= window.innerHeight - 40
    if (!visible) el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
  }, [top, reduce])

  // keep a just-closed card mounted briefly so it can slide out (no motion lib)
  const [exiting, setExiting] = useState<PanelItem[]>([])
  const prevRef = useRef<PanelItem[]>(stack)
  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = stack
    const gone = prev.filter((p) => !stack.some((s) => s.kind === p.kind && s.id === p.id))
    if (!gone.length) return
    const isGone = (e: PanelItem) => gone.some((g) => g.kind === e.kind && g.id === e.id)
    setExiting((cur) => [...cur.filter((e) => !isGone(e)), ...gone])
    const t = setTimeout(() => setExiting((cur) => cur.filter((e) => !isGone(e))), reduce ? 0 : DUR + 40)
    return () => clearTimeout(t)
  }, [stack, reduce])

  const exitingActive = exiting.filter((e) => !stack.some((s) => s.kind === e.kind && s.id === e.id))
  if (!n && !exitingActive.length) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]">
      {stack.map((item, i) => (
        <PanelCard
          key={`${item.kind}:${item.id}`}
          item={item}
          depth={n - 1 - i}
          isFront={i === n - 1}
          count={n}
          exiting={false}
          onCycle={(d) => nav.cycle(d)}
          onClose={() => nav.closeTop()}
          onBringForward={() => nav.bringForward(item)}
        />
      ))}
      {exitingActive.map((item) => (
        <PanelCard
          key={`${item.kind}:${item.id}`}
          item={item}
          depth={0}
          isFront={false}
          count={n}
          exiting={true}
          onCycle={() => {}}
          onClose={() => {}}
          onBringForward={() => {}}
        />
      ))}
    </div>
  )
}
