import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ShieldCheck, Play, Check, Loader2, ArrowRight, RotateCcw, Shield, Radar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/primitives"
import { AuditPhases, FindingList, MonitoringScope, RunMetrics } from "@/components/audit"
import { AUDIT_CASES, AUDIT_PHASES, type AuditCase } from "@/lib/audit"
import { cn } from "@/lib/utils"

type Phase = "idle" | "running" | "done"

/* ---------- email early-access capture ---------- */
function EmailCapture({ contractName, done }: { contractName: string; done: boolean }) {
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

  return (
    <section id="access" className="mx-auto mt-5 max-w-[560px] scroll-mt-24">
      <div
        className={cn(
          "rounded-xl border p-5 transition-colors sm:p-6",
          done ? "border-primary/40 bg-primary-weak" : "border-border bg-card",
        )}
      >
        {sent ? (
          <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success-weak text-success">
              <Check className="size-4" strokeWidth={2.4} />
            </span>
            <p className="text-[14.5px] text-foreground">
              You are on the list. We will reach out about watching{" "}
              <span className="font-mono text-ink-strong">{contractName}</span>.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3.5">
              <h2 className="text-[16px] font-semibold text-ink-strong">
                {done ? `Start watching ${contractName}` : "Get early access"}
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {done
                  ? "Keep this audit live. Sentinel re-audits on upgrade and pages you, human-gated, when it matters."
                  : "Audit-informed monitoring for Stacks. We are onboarding protocols now."}
              </p>
            </div>
            <form onSubmit={submit} noValidate className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor="access-email" className="sr-only">
                Work email
              </label>
              <input
                id="access-email"
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
                aria-describedby={error ? "access-error" : undefined}
                className={cn(
                  "h-11 flex-1 rounded-lg border bg-background px-3.5 font-mono text-[14px] text-foreground outline-none transition-colors placeholder:text-faint",
                  error ? "border-destructive" : "border-border focus-visible:border-primary",
                )}
              />
              <Button type="submit" size="lg" className="h-11 shrink-0">
                {done ? "Start watching" : "Get access"}
                <ArrowRight className="size-4" />
              </Button>
            </form>
            {error && (
              <p id="access-error" className="mt-2 text-[12.5px] text-destructive">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/* ---------- the reveal: the real audit result + the real scope ---------- */
function SectionLabel({ icon: Icon, children }: { icon: typeof Shield; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
      <Icon className="size-3.5 text-primary" strokeWidth={1.6} /> {children}
    </div>
  )
}

function Reveal({ c }: { c: AuditCase }) {
  return (
    <div>
      <SectionLabel icon={Shield}>Prevention · the audit</SectionLabel>
      <p className="text-[14px] text-foreground">{c.summary}.</p>
      <div className="mt-3.5">
        <RunMetrics run={c.run} />
      </div>
      <div className="mt-4">
        <FindingList findings={c.findings} />
      </div>

      <div className="mt-7">
        <SectionLabel icon={Radar}>Detection · the scope</SectionLabel>
        <MonitoringScope scope={c.scope} contract={c.contract.name} />
        <p className="mt-3 text-[12px] text-faint">
          Human-gated. A correlation is not a confirmed exploit. Sentinel routes intent, it never acts on-chain.
        </p>
      </div>
    </div>
  )
}

/* ---------- the audit console ---------- */
function Console() {
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
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 420 : 640)
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
    <div>
      {/* contract picker */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[12.5px] text-muted-foreground">Audit</span>
        {AUDIT_CASES.map((c) => {
          const on = c.id === selected.id
          return (
            <button
              key={c.id}
              onClick={() => pick(c)}
              aria-pressed={on}
              className={cn(
                "rounded-lg border px-3 py-1.5 font-mono text-[12.5px] transition-colors",
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

      {/* console surface */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_16px_40px_-16px_rgba(20,18,15,0.16)]">
        <div className="flex items-center gap-2.5 border-b border-border bg-secondary px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-destructive/70" />
            <span className="size-2.5 rounded-full bg-warning/70" />
            <span className="size-2.5 rounded-full bg-success/70" />
          </div>
          <span className="font-mono text-[12px] text-muted-foreground">
            sentinel audit · <span className="text-ink-strong">{selected.contract.name}</span>
          </span>
          <span className="ml-auto font-mono text-[11.5px] text-faint">
            {selected.contract.arch} · {selected.contract.tvl}
          </span>
        </div>

        <div className="min-h-[280px] p-5 sm:p-6">
          {phase === "idle" && (
            <div className="flex min-h-[232px] flex-col items-start justify-center gap-5">
              <div>
                <p className="max-w-[52ch] text-[15px] text-foreground">
                  Run the actual audit engine on{" "}
                  <span className="font-mono text-ink-strong">{selected.contract.name}</span>. Deep tier, five
                  subagents, adversarial verification, sandbox reproduction. It resolves to a real finding and the
                  monitoring scope it would watch.
                </p>
                <p className="mt-2 font-mono text-[12.5px] text-faint">{selected.contract.principal}</p>
              </div>
              <Button size="lg" onClick={run} className="gap-2">
                <Play className="size-4 fill-current" /> Run audit
              </Button>
            </div>
          )}

          {phase === "running" && (
            <div className="animate-in fade-in duration-300">
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
            <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
              <Reveal c={selected} />
              <div className="mt-6 flex items-center gap-3 border-t border-border pt-4">
                <Button variant="ghost" size="sm" onClick={run} className="gap-1.5">
                  <RotateCcw className="size-3.5" /> Run again
                </Button>
                <span className="text-[12.5px] text-faint">or audit another contract above</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <EmailCapture contractName={selected.contract.name} done={phase === "done"} />
    </div>
  )
}

/* ---------- page ---------- */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1000px] items-center gap-3 px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-ink-strong">
            <ShieldCheck className="size-[21px] text-primary" strokeWidth={1.6} />
            Sentinel
          </Link>
          <span className="flex-1" />
          <Link to="/sign-in" className="text-[14px] text-muted-foreground transition-colors hover:text-ink-strong">
            Sign in
          </Link>
          <Button size="sm" nativeButton={false} render={<a href="#access" />}>
            Get early access
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-6 pb-24">
        <div className="pt-14 sm:pt-20">
          <p className="font-mono text-[12.5px] font-medium tracking-wide text-primary">
            Audit-informed security monitoring · Stacks
          </p>
          <h1 className="mt-4 max-w-[16ch] text-[clamp(32px,5vw,52px)] font-semibold leading-[1.05] tracking-tight text-ink-strong">
            See what an audit finds. Then watch for it.
          </h1>
          <p className="mt-4 max-w-[62ch] text-[clamp(15px,1.6vw,18px)] leading-relaxed text-muted-foreground">
            Not a pitch deck. Pick a real Stacks contract below and run the actual engine. Prevention and detection,
            from one audit.
          </p>
        </div>

        <div className="mt-9">
          <Console />
        </div>

        <p className="mx-auto mt-8 max-w-[560px] text-center text-[12.5px] text-faint">
          A full deep sweep costs about two dollars in compute. Monitoring is scoped by what it finds. Powered by
          secondlayer.
        </p>
      </main>
    </div>
  )
}
