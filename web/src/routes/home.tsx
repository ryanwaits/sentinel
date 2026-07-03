import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ShieldCheck, Play, Check, Loader2, ArrowRight, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/primitives"
import { AuditPhases, FindingList, MonitoringScope, RunMetrics } from "@/components/audit"
import { ScanTeaser } from "@/components/scan-teaser"
import { SentinelMark } from "@/components/sentinel-mark"
import { CodeBlock } from "@/components/code-block"
import { AUDIT_CASES, AUDIT_PHASES, type AuditCase } from "@/lib/audit"
import { runScan, type ScanResult } from "@/lib/scan"
import { isValidContractId } from "@/lib/stacks-id"
import { cn } from "@/lib/utils"

type Phase = "idle" | "running" | "done"

/* ---------- left column: beta access ---------- */
function BetaCapture() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) {
      setError("Enter a valid email.")
      inputRef.current?.focus()
      return
    }
    setError(null)
    setSent(true)
  }

  if (sent) {
    return (
      <div id="access" className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary-weak p-4 scroll-mt-24">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success-weak text-success">
          <Check className="size-4" strokeWidth={2.4} />
        </span>
        <p className="text-[14px] text-foreground">You are on the list. We will be in touch about early access.</p>
      </div>
    )
  }

  return (
    <div id="access" className="scroll-mt-24">
      <h2 className="text-[15px] font-semibold text-ink-strong">Get early beta access</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Audit-informed monitoring for Stacks. We are onboarding protocols now.
      </p>
      <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="beta-email" className="sr-only">
          Work email
        </label>
        <input
          id="beta-email"
          ref={inputRef}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@protocol.xyz"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (error) setError(null)
          }}
          onBlur={() => setError(email && !valid ? "Enter a valid email." : null)}
          aria-invalid={!!error}
          aria-describedby={error ? "beta-error" : undefined}
          className={cn(
            "h-11 flex-1 rounded-lg border bg-card px-3.5 font-mono text-[14px] text-foreground outline-none transition-colors placeholder:text-faint",
            error ? "border-destructive" : "border-border focus-visible:border-primary",
          )}
        />
        <Button type="submit" size="lg" className="h-11 shrink-0">
          Request access
          <ArrowRight className="size-4" />
        </Button>
      </form>
      {error && (
        <p id="beta-error" className="mt-2 text-[12.5px] text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/* ---------- hero right column: a static peek at live alerts ---------- */
function AlertsPeek() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_oklch(0.2_0.02_55/0.04),0_12px_32px_-10px_oklch(0.2_0.02_55/0.14)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary px-4 py-[11px]">
        <span className="size-[9px] rounded-full bg-destructive" />
        <span className="size-[9px] rounded-full bg-primary" />
        <span className="size-[9px] rounded-full bg-faint" />
        <span className="ml-2 font-mono text-[12px] text-muted-foreground">sentinel · alerts</span>
        <span className="flex-1" />
        <span className="hidden font-mono text-[11.5px] text-faint sm:inline">watching 3 contracts · 9 functions</span>
      </div>
      <div className="py-1.5">
        <div className="flex gap-3 border-b border-border px-4 py-[15px] sm:px-5">
          <span className="mt-[5px] size-[9px] shrink-0 rounded-full bg-primary" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <b className="font-medium text-ink-strong">Incoming proposal would drain the treasury</b>
              <span className="font-mono text-[12px] text-muted-foreground">ccd002-treasury · execute</span>
            </div>
            <div className="mt-[9px] flex flex-wrap items-center gap-1.5">
              <Chip tone="critical">CRITICAL</Chip>
              <Chip tone="neutral">● bug</Chip>
              <Chip tone="success">
                <Check className="size-3" /> PoC green
              </Chip>
              <span className="flex-1" />
              <span className="font-mono text-[12px] font-medium text-primary tnum">veto: 6 blocks left · ≈58 min</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-4 py-[15px] sm:px-5">
          <span className="mt-[5px] size-[9px] shrink-0 rounded-full bg-primary" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <b className="font-medium text-ink-strong">Possible exploitation: socialize-debt unbounded LP loss</b>
              <span className="font-mono text-[12px] text-muted-foreground">v0-vault-sbtc</span>
            </div>
            <div className="mt-[9px] flex flex-wrap items-center gap-1.5">
              <Chip tone="accent">HIGH</Chip>
              <Chip tone="accent">correlation</Chip>
              <Chip tone="success">
                <Check className="size-3" /> PoC green
              </Chip>
              <Chip tone="neutral">conf 0.60</Chip>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- playground: the real audit engine, run inline ---------- */
function InlineAuditCard() {
  const [selected, setSelected] = useState<AuditCase>(AUDIT_CASES[0])
  const [phase, setPhase] = useState<Phase>("idle")
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
    <div className="shadow-panel flex min-h-[440px] flex-col overflow-hidden rounded-[10px] border border-border bg-card lg:max-h-[calc(100dvh-150px)]">
      {/* chrome, matching the /log detail card */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
        <span className="text-ink-strong">audit</span>
        <span className="truncate text-faint">/ {selected.contract.name}</span>
        <span className="flex-1" />
        {phase === "done" && (
          <button className="flex items-center gap-1.5 transition-colors hover:text-ink-strong" onClick={run}>
            <RotateCcw className="size-3" /> run again
          </button>
        )}
        <span className="text-faint">{selected.contract.arch}</span>
      </div>

      <div className="flex-1 overflow-auto">
        {/* picker (hidden while running) */}
        {phase !== "running" && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            {AUDIT_CASES.map((c) => {
              const on = c.id === selected.id
              return (
                <button
                  key={c.id}
                  onClick={() => pick(c)}
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
              <Button size="lg" onClick={run} className="shrink-0 gap-2">
                <Play className="size-4 fill-current" /> Run audit
              </Button>
            </div>
          </div>
        )}

        {phase === "running" && (
          <div className="animate-in fade-in p-6 duration-300">
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
          <div className="animate-in fade-in slide-in-from-bottom-1 grid gap-6 p-6 duration-500">
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
      </div>
    </div>
  )
}

/* ---------- playground: paste a real contract, get a real (zero-LLM, static) scan ---------- */
function ScanPanel() {
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
    <div className="shadow-panel flex min-h-[440px] flex-col overflow-hidden rounded-[10px] border border-border bg-card lg:max-h-[calc(100dvh-150px)]">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
        <span className="text-ink-strong">scan</span>
        <span className="truncate text-faint">/ paste any Stacks contract</span>
      </div>

      <div className="flex-1 overflow-auto p-4">
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
    </div>
  )
}

function Playground() {
  const [mode, setMode] = useState<"scan" | "example">("scan")
  return (
    <div className="min-w-0">
      {mode === "scan" ? <ScanPanel /> : <InlineAuditCard />}
      <button
        type="button"
        onClick={() => setMode((m) => (m === "scan" ? "example" : "scan"))}
        className="mt-3 font-mono text-[12px] text-muted-foreground transition-colors hover:text-ink-strong"
      >
        {mode === "scan" ? "or see a finished example →" : "← back to scan your own contract"}
      </button>
    </div>
  )
}

/* ---------- page ---------- */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-ink-strong">
            <SentinelMark className="size-[21px] text-ink-strong" />
            Sentinel
          </Link>
          <span className="flex-1" />
          <nav className="hidden items-center gap-5 sm:flex">
            <Link to="/log" className="text-[14px] text-muted-foreground transition-colors hover:text-ink-strong">
              Findings log
            </Link>
            <Link to="/pricing" className="text-[14px] text-muted-foreground transition-colors hover:text-ink-strong">
              Pricing
            </Link>
            <Link to="/sign-in" className="text-[14px] text-muted-foreground transition-colors hover:text-ink-strong">
              Sign in
            </Link>
          </nav>
          <Button size="sm" nativeButton={false} render={<a href="#access" />}>
            Get early access
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-6 pb-24">
        <div className="grid items-start gap-10 pt-14 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
          {/* left: tagline + beta access */}
          <div className="lg:pt-8">
            <p className="font-mono text-[12.5px] font-medium tracking-wide text-primary">Stacks · Clarity · Bitcoin L2</p>
            <h1 className="mt-4 text-[clamp(30px,4.2vw,50px)] font-semibold leading-[1.06] tracking-tight text-ink-strong">
              Bitcoin L2 Smart Contract Auditing & Monitoring
            </h1>
            <p className="mt-4 max-w-[48ch] text-[clamp(15px,1.5vw,17px)] leading-relaxed text-muted-foreground">
              Your audit becomes the monitoring plan — sensitive functions, thresholds, alerts.
            </p>
            <div className="mt-9">
              <BetaCapture />
            </div>
            <p className="mt-6 text-[13px] text-faint">
              Or browse the{" "}
              <Link to="/log" className="font-medium text-primary hover:underline">
                findings log
              </Link>
              .
            </p>
          </div>

          {/* right: a static peek at what a live alert looks like */}
          <div className="lg:pt-2">
            <AlertsPeek />
            <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 font-mono text-[12.5px] text-muted-foreground">
              <span>
                <b className="font-medium text-ink-strong">1</b> live finding reproduced
              </span>
              <span>
                <b className="font-medium text-ink-strong">15 / 15</b> PoC assertions green
              </span>
              <span>
                <b className="font-medium text-ink-strong">~$2</b> per deep sweep
              </span>
            </div>
            <p className="mt-4 px-0.5 text-[12px] leading-relaxed text-faint">
              Powered by <span className="text-muted-foreground">secondlayer</span>.{" "}
              <Link to="/pricing" className="font-medium text-primary hover:underline">
                See pricing →
              </Link>
            </p>
          </div>
        </div>

        {/* PLAYGROUND — the real audit engine, run inline. Mirrored from the hero: card left, text right. */}
        <div className="mt-20 border-t border-border pt-16">
          <div className="grid min-w-0 items-start gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
            <div className="min-w-0 lg:order-1">
              <Playground />
            </div>
            <div className="min-w-0 lg:order-2 lg:pt-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-faint">Try it — a real scan</p>
              <h2 className="mt-3 text-[clamp(22px,2.6vw,32px)] font-semibold tracking-tight text-ink-strong">
                Paste a real Stacks contract. Get a real read.
              </h2>
              <p className="mt-3 max-w-[42ch] text-[14.5px] leading-relaxed text-muted-foreground">
                Not a mockup. Sentinel fetches the actual on-chain source and flags real surface area in seconds.
                Like what you see — continue into the full multi-agent audit: five subagents, adversarial
                verification, sandbox reproduction.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-10 text-[13.5px] text-muted-foreground">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-5 px-6">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-ink-strong">
            <SentinelMark className="size-[18px] text-ink-strong" />
            Sentinel
          </span>
          <span>Audit-informed security monitoring for Stacks. Powered by secondlayer.</span>
          <span className="font-mono text-faint">© 2026</span>
        </div>
      </footer>
    </div>
  )
}
