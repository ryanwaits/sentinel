import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ShieldCheck, Play, Check, Loader2, ArrowRight, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/primitives"
import { AuditPhases, FindingList, MonitoringScope, RunMetrics } from "@/components/audit"
import { AUDIT_CASES, AUDIT_PHASES, type AuditCase } from "@/lib/audit"
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

/* ---------- right column: the audit demo, shaped like the inline detail card ---------- */
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
    <div className="shadow-panel flex max-h-[min(72vh,660px)] flex-col overflow-hidden rounded-[10px] border border-border bg-card">
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
          <div className="flex min-h-[280px] flex-col items-start justify-center gap-5 p-6">
            <div>
              <p className="max-w-[46ch] text-[14.5px] text-foreground">
                Run the actual audit engine on <span className="font-mono text-ink-strong">{selected.contract.name}</span>.
                Deep tier, five subagents, adversarial verification, sandbox reproduction. It resolves to a real finding
                and the monitoring scope it would watch.
              </p>
              <p className="mt-2 font-mono text-[12px] text-faint">{selected.contract.principal}</p>
            </div>
            <Button size="lg" onClick={run} className="gap-2">
              <Play className="size-4 fill-current" /> Run audit
            </Button>
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

/* ---------- page ---------- */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-ink-strong">
            <ShieldCheck className="size-[21px] text-primary" strokeWidth={1.6} />
            Sentinel
          </Link>
          <span className="flex-1" />
          <Link to="/log" className="text-[14px] text-muted-foreground transition-colors hover:text-ink-strong">
            Findings log
          </Link>
          <Link to="/sign-in" className="text-[14px] text-muted-foreground transition-colors hover:text-ink-strong">
            Sign in
          </Link>
          <Button size="sm" nativeButton={false} render={<a href="#access" />}>
            Get early access
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-6 pb-24">
        <div className="grid items-start gap-10 pt-14 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
          {/* left: tagline + beta access */}
          <div className="lg:pt-8">
            <p className="font-mono text-[12.5px] font-medium tracking-wide text-primary">
              Audit-informed security monitoring · Stacks
            </p>
            <h1 className="mt-4 text-[clamp(30px,4.2vw,50px)] font-semibold leading-[1.06] tracking-tight text-ink-strong">
              See what an audit finds. Then watch for it.
            </h1>
            <p className="mt-4 max-w-[48ch] text-[clamp(15px,1.5vw,17px)] leading-relaxed text-muted-foreground">
              Not a pitch deck. Run the actual engine on a real Stacks contract, right here. Prevention and detection,
              from one audit.
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

          {/* right: the audit demo, shaped like the inline detail card */}
          <div className="lg:pt-2">
            <InlineAuditCard />
          </div>
        </div>

        <p className="mt-14 max-w-[560px] text-[12.5px] text-faint">
          A full deep sweep costs about two dollars in compute. Monitoring is scoped by what it finds. Powered by
          secondlayer.
        </p>
      </main>
    </div>
  )
}
