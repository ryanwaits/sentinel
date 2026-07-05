import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Check, ArrowRight, Play, Loader2, RotateCcw, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Chip, SeverityDot } from "@/components/primitives"
import { AuditPhases, FindingList, MonitoringScope, RunMetrics } from "@/components/audit"
import { useReducedMotion } from "@/components/panel"
import { CodeBlock } from "@/components/code-block"
import { ScanTeaser } from "@/components/scan-teaser"
import { AUDIT_CASES, AUDIT_PHASES, CASE_BY_ID, type AuditCase } from "@/lib/audit"
import { runScan, type ScanResult } from "@/lib/scan"
import { isValidContractId } from "@/lib/stacks-id"
import type { Severity } from "@/lib/mock"
import { EASE, DUR } from "@/lib/motion"
import { cn } from "@/lib/utils"

type RunPhase = "idle" | "running" | "done"

/* ---------- left column: a real preview of the findings log ---------- */
const LATEST = ["ccd002.F1", "zest.F1"]

function FindingPreviewRow({ slug }: { slug: string }) {
  const [caseId, fid] = slug.split(".")
  const c = CASE_BY_ID[caseId]
  const f = c?.findings.find((x) => x.id === fid)
  if (!f) return null
  const severity: Severity = f.severity ?? "info"
  return (
    <div className="flex gap-3 border-t border-border px-4 py-[15px] first:border-t-0 sm:px-5">
      <span className="mt-[5px] shrink-0">
        <SeverityDot severity={severity} glow={severity === "critical" || severity === "high"} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <b className="font-medium text-ink-strong">{f.title}</b>
          <span className="font-mono text-[12px] text-muted-foreground">
            {c.contract.name} · fn {f.fn}
          </span>
        </div>
        <div className="mt-[9px] flex flex-wrap items-center gap-1.5">
          {f.severity && (
            <Chip tone={f.severity === "critical" ? "critical" : f.severity === "high" ? "accent" : "warning"}>
              {f.severity.toUpperCase()}
            </Chip>
          )}
          <Chip tone={f.cls === "bug" ? "neutral" : "ghost"}>{f.cls === "bug" ? "● bug" : "◐ centralization"}</Chip>
          {f.poc === "green" && (
            <Chip tone="success">
              <Check className="size-3" /> PoC green
            </Chip>
          )}
          <span className="flex-1" />
          <span className="font-mono text-[12px] text-faint">{c.run.when}</span>
        </div>
      </div>
    </div>
  )
}

function LatestFindings() {
  return (
    <div className="shadow-panel overflow-hidden rounded-[12px] border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary px-4 py-[11px]">
        <span className="size-[9px] rounded-full bg-destructive" />
        <span className="size-[9px] rounded-full bg-primary" />
        <span className="size-[9px] rounded-full bg-faint" />
        <span className="ml-2 font-mono text-[12px] text-muted-foreground">sentinel · findings log</span>
      </div>
      <div className="py-1.5">
        {LATEST.map((slug) => (
          <FindingPreviewRow key={slug} slug={slug} />
        ))}
      </div>
    </div>
  )
}

/* ---------- playground: scan a real contract, or watch a real audit run ---------- */
function ScanBody() {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const contractId = value.trim()
    if (!isValidContractId(contractId)) {
      setError("Expected SP…/ST….contract-name")
      return
    }
    setError(null)
    setLoading(true)
    setResult(null)
    try {
      setResult(await runScan(contractId))
    } catch {
      setResult({ contractId, status: "error", lineCount: 0, signals: [] })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          placeholder="SP….contract-name"
          className={cn(
            "h-10 min-w-0 flex-1 rounded-lg border bg-card px-3 font-mono text-[13px] text-foreground outline-none transition-colors placeholder:text-faint",
            error ? "border-destructive" : "border-border focus-visible:border-primary",
          )}
        />
        <Button type="submit" size="lg" className="h-10 shrink-0 gap-2" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />}
          Scan
        </Button>
      </form>
      {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}

      <div className="mt-4">
        {loading && (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" /> Resolving contract on Stacks…
          </div>
        )}
        {!loading && result && <ScanTeaser result={result} />}
        {!loading && !result && (
          <p className="text-[13px] text-muted-foreground">
            Paste a live Stacks contract address. Sentinel reads the real on-chain source and flags
            value-transfer, admin, and access-control surface — in seconds, no full audit run yet.
          </p>
        )}
      </div>

      {result?.status === "ok" && (
        <Button
          size="lg"
          className="mt-5 w-full gap-2"
          render={<Link to={`/onboarding?contract=${encodeURIComponent(result.contractId)}`} />}
        >
          Continue to the full audit <ArrowRight className="size-4" />
        </Button>
      )}
    </div>
  )
}

function ExampleBody({
  selected,
  onPick,
  phase,
  step,
  onRun,
}: {
  selected: AuditCase
  onPick: (c: AuditCase) => void
  phase: RunPhase
  step: number
  onRun: () => void
}) {
  return (
    <>
      {phase !== "running" && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          {AUDIT_CASES.map((c) => {
            const on = c.id === selected.id
            return (
              <button
                key={c.id}
                onClick={() => onPick(c)}
                aria-pressed={on}
                className={cn(
                  "rounded-lg border px-2.5 py-1 font-mono text-[12px] transition-colors",
                  on
                    ? "border-primary bg-primary-weak text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary",
                )}
              >
                {c.contract.name}
              </button>
            )
          })}
        </div>
      )}

      {phase === "idle" && (
        <div className="flex flex-col gap-3.5 p-4">
          <div className="overflow-x-auto rounded-lg border border-border bg-secondary/50 px-4 py-3.5">
            <div className="mb-2.5 flex items-center gap-2 font-mono text-[11px] text-faint">
              <span className="size-2 rounded-full bg-border-strong" />
              {selected.contract.name}.clar
            </div>
            <CodeBlock code={selected.code} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="max-w-[32ch] text-[12px] text-muted-foreground">
              Deep tier. Five subagents, adversarial verification, sandbox reproduction.
            </p>
            <Button size="lg" onClick={onRun} className="shrink-0 gap-2">
              <Play className="size-4 fill-current" /> Run audit
            </Button>
          </div>
        </div>
      )}

      {phase === "running" && (
        <div className="animate-in fade-in ease-[cubic-bezier(0.22,1,0.36,1)] p-6 duration-[340ms]">
          <div className="mb-4 flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            Auditing <span className="font-mono text-ink-strong">{selected.contract.name}</span>
            <Chip tone="accent" className="ml-1">
              deep
            </Chip>
          </div>
          <AuditPhases activeStep={step} />
          {step >= 3 && <p className="mt-4 font-mono text-[12.5px] text-warning">{selected.landLine}</p>}
        </div>
      )}

      {phase === "done" && (
        <div className="animate-in fade-in slide-in-from-bottom-1 ease-[cubic-bezier(0.22,1,0.36,1)] grid gap-6 p-6 duration-[340ms]">
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-faint">
              <ShieldCheck className="size-3.5 text-primary" strokeWidth={1.6} /> Prevention · the audit
            </div>
            <p className="text-[14px] text-foreground">{selected.summary}.</p>
            <div className="mt-3.5">
              <RunMetrics run={selected.run} />
            </div>
            <div className="mt-4">
              <FindingList findings={selected.findings} />
            </div>
          </div>
          <div>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-faint">
              Detection · what it would watch
            </div>
            <MonitoringScope scope={selected.scope} contract={selected.contract.name} />
            <p className="mt-3 text-[12px] text-faint">
              Human-gated. A correlation is not a confirmed exploit. Sentinel routes intent, it never acts on-chain.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

function Playground({ onClose, className = "min-h-[440px]" }: { onClose?: () => void; className?: string }) {
  const [mode, setMode] = useState<"scan" | "example">("scan")
  const [selected, setSelected] = useState<AuditCase>(AUDIT_CASES[0])
  const [phase, setPhase] = useState<RunPhase>("idle")
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (phase !== "running") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(AUDIT_PHASES.length)
      setPhase("done")
      return
    }
    if (step >= AUDIT_PHASES.length) {
      const t = setTimeout(() => setPhase("done"), 420)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 420 : 620)
    return () => clearTimeout(t)
  }, [phase, step])

  function pick(c: AuditCase) {
    setSelected(c)
    setPhase("idle")
    setStep(0)
  }
  function run() {
    setStep(0)
    setPhase("running")
  }

  return (
    <div className={cn("shadow-panel flex flex-col overflow-hidden rounded-[12px] border border-border bg-card", className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-secondary px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
        <span className="shrink-0 text-ink-strong">{mode}</span>
        <span className="min-w-0 flex-1 truncate text-faint">
          / {mode === "scan" ? "paste any Stacks contract" : selected.contract.name}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          {mode === "example" && phase === "done" && (
            <button
              onClick={run}
              className="flex items-center gap-1.5 normal-case tracking-normal transition-colors hover:text-ink-strong"
            >
              <RotateCcw className="size-3" /> run again
            </button>
          )}
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5 normal-case tracking-normal">
            {(["scan", "example"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  "rounded px-2 py-1 text-[11px] font-medium capitalize transition-colors",
                  mode === m ? "bg-secondary text-ink-strong" : "text-muted-foreground hover:text-ink-strong",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          {onClose && (
            <button onClick={onClose} className="normal-case tracking-normal transition-colors hover:text-ink-strong">
              close [esc]
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {mode === "scan" ? (
          <ScanBody />
        ) : (
          <ExampleBody selected={selected} onPick={pick} phase={phase} step={step} onRun={run} />
        )}
      </div>
    </div>
  )
}

/** Reveals the Playground as a bottom-right card, auto-height, rising in from the bottom — same chrome as the log's PanelCard, just anchored bottom instead of stretched full-height. */
function PlaygroundReveal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion()
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (!open) {
      setEntered(false)
      return
    }
    if (reduce) {
      setEntered(true)
      return
    }
    const r = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(r)
  }, [open, reduce])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]">
      <div
        className="pointer-events-auto absolute"
        style={{
          bottom: 16,
          right: 16,
          width: "min(480px, calc(100vw - 32px))",
          maxHeight: "calc(100dvh - 32px)",
          transform: reduce ? "none" : entered ? "translateY(0)" : "translateY(calc(100% + 32px))",
          transition: reduce ? "none" : `transform ${DUR}ms ${EASE}`,
        }}
      >
        <Playground onClose={onClose} className="max-h-[calc(100dvh-32px)] min-h-[320px]" />
      </div>
    </div>
  )
}

/* ---------- page ---------- */
export default function HomePage() {
  const [playgroundOpen, setPlaygroundOpen] = useState(false)

  return (
    <>
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 items-center px-6">
        <div className="grid w-full items-center gap-10 py-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          {/* left: a real preview of the findings log */}
          <div>
            <LatestFindings />
            <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 font-mono text-[12.5px] text-muted-foreground">
              <span>
                <b className="font-medium text-ink-strong">1</b> live finding reproduced
              </span>
              <span>
                <b className="font-medium text-ink-strong">15 / 15</b> PoC assertions green
              </span>
              <span>
                <b className="font-medium text-ink-strong">5</b> subagents, adversarially verified
              </span>
            </div>
            <p className="mt-4 px-0.5 text-[12px] leading-relaxed text-faint">
              Powered by <span className="text-muted-foreground">secondlayer</span>.{" "}
              <Link to="/pricing" className="font-medium text-primary hover:underline">
                See pricing →
              </Link>
            </p>
          </div>

          {/* right: try it — a real audit */}
          <div className="lg:pt-2">
            <p className="font-mono text-[11px] uppercase tracking-wider text-faint">Try it — a real audit</p>
            <h1 className="mt-3 text-[clamp(26px,3.4vw,40px)] font-semibold leading-[1.1] tracking-tight text-ink-strong">
              Paste a real Stacks contract. Get a real read.
            </h1>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
              Not a mockup. Sentinel fetches the actual on-chain source and flags real surface area in seconds.
              Continue into the full multi-agent audit: five subagents, adversarial verification, sandbox
              reproduction.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button size="lg" className="gap-2" onClick={() => setPlaygroundOpen(true)}>
                Run an audit <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="outline" render={<Link to="/pricing" />}>
                See pricing
              </Button>
            </div>
            <p className="mt-6 text-[13px] text-faint">
              Or browse the{" "}
              <Link to="/log" className="font-medium text-primary hover:underline">
                findings log
              </Link>
              .
            </p>
          </div>
        </div>
      </main>

      <PlaygroundReveal open={playgroundOpen} onClose={() => setPlaygroundOpen(false)} />
    </>
  )
}
