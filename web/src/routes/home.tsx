import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ShieldCheck, Play, Check, Loader2, ArrowRight, RotateCcw, Shield, Radar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Chip, SeverityDot } from "@/components/primitives"
import type { Severity } from "@/lib/mock"
import { cn } from "@/lib/utils"

/* ---------- the pipeline (real phases, honest labels) ---------- */
const PHASES = [
  { key: "discover", label: "Discover value and entrypoints" },
  { key: "audit", label: "Audit with 5 specialist subagents" },
  { key: "verify", label: "Adversarially verify each finding" },
  { key: "repro", label: "Reproduce in the airgapped sandbox" },
  { key: "distill", label: "Distill the monitoring scope" },
] as const

type Outcome = "bug" | "centralization" | "clean"

interface Preset {
  id: string
  name: string
  principal: string
  arch: string
  tvl: string
  land: string
  outcome: Outcome
  prevention: {
    verdict: string
    severity?: Severity
    cls: "bug" | "centralization" | "info"
    poc?: { asserts: string; lines: string[] }
    title: string
    detail: string
  }
  scope: { fn: string; rule: string; type: "prevention" | "detection" }[]
}

const PRESETS: Preset[] = [
  {
    id: "zest",
    name: "v0-vault-sbtc",
    principal: "SP1A27…v0-vault-sbtc",
    arch: "vault",
    tvl: "≈ 51 BTC",
    land: "socialize-debt: unbounded scaled-amount, no cap. reproducing…",
    outcome: "bug",
    prevention: {
      verdict: "1 real bug",
      severity: "high",
      cls: "bug",
      title: "socialize-debt forces unbounded LP loss",
      detail:
        "Any one authorized market can call socialize-debt with no cap and drive total-assets to zero. Redemption then reverts and the sBTC stays locked. Reproduced in an airgapped Clarity VM, no mainnet.",
      poc: {
        asserts: "15 / 15",
        lines: [
          "call socialize-debt(scaled-amount: u50000000000)",
          "assert total-assets == u0            ok",
          "assert redeem() reverts ERR-OUTPUT-ZERO  ok",
          "assert 50001000 sats sBTC locked     ok",
        ],
      },
    },
    scope: [
      { fn: "socialize-debt", rule: "watch for exploitation of this finding", type: "detection" },
      { fn: "system-borrow · sBTC", rule: "outflow ≥ p99 baseline (770,115 sats)", type: "detection" },
      { fn: "governance", rule: "proposals audited inside the timelock", type: "prevention" },
    ],
  },
  {
    id: "dlmm",
    name: "dlmm-pool-stx-usdcx",
    principal: "SM1FKX…dlmm-pool",
    arch: "amm",
    tvl: "≈ 1.8M STX",
    land: "no unbounded or unauthorized withdrawal path. learning baseline from 300 transfers…",
    outcome: "clean",
    prevention: {
      verdict: "No exploitable bug",
      cls: "info",
      title: "Clean, with two trust notes",
      detail:
        "No unbounded or unauthorized withdrawal path. Two admin functions are trust-gated, by design, so we label them as centralization notes, not bugs. We would rather say clean than inflate a finding.",
    },
    scope: [
      { fn: "outflow · stx", rule: "≥ p99 (1.71B µSTX) or a new counterparty", type: "detection" },
      { fn: "outflow · usdcx", rule: "≥ p99, learned from on-chain history", type: "detection" },
      { fn: "set-fee (admin)", rule: "any call, trust-gated", type: "detection" },
    ],
  },
  {
    id: "ccd002",
    name: "ccd002-treasury-mia",
    principal: "SP8A9…ccd002-treasury",
    arch: "dao",
    tvl: "≈ 4.1M STX",
    land: "execute() runs any passed proposal. checking proposal gating…",
    outcome: "centralization",
    prevention: {
      verdict: "1 centralization finding",
      cls: "centralization",
      title: "Treasury executes whatever governance passes",
      detail:
        "Not a code bug, a trust assumption: a malicious passed proposal can move the full balance. The mitigation is watching the timelock, not patching the contract. Labeled honestly as centralization.",
    },
    scope: [
      { fn: "execute · proposal", rule: "new proposals audited in the timelock, veto window", type: "prevention" },
      { fn: "treasury outflow", rule: "≥ p99 baseline", type: "detection" },
    ],
  },
]

type Phase = "idle" | "running" | "done"

/* ---------- email early-access capture ---------- */
function EmailCapture({ preset, done }: { preset: Preset; done: boolean }) {
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
              <span className="font-mono text-ink-strong">{preset.name}</span>.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3.5">
              <h2 className="text-[16px] font-semibold text-ink-strong">
                {done ? `Start watching ${preset.name}` : "Get early access"}
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

/* ---------- the audit console ---------- */
function PhaseRow({ label, state }: { label: string; state: "done" | "running" | "pending" }) {
  return (
    <div className="flex items-center gap-3 py-[7px]">
      <span className="flex size-[18px] shrink-0 items-center justify-center">
        {state === "done" ? (
          <Check className="size-3.5 text-success" strokeWidth={2.4} />
        ) : state === "running" ? (
          <Loader2 className="size-3.5 animate-spin text-primary" />
        ) : (
          <span className="size-2 rounded-full bg-border-strong" />
        )}
      </span>
      <span className={cn("text-[13.5px]", state === "pending" ? "text-faint" : "text-foreground")}>{label}</span>
      {state === "running" && <span className="ml-auto text-[12px] text-primary">running</span>}
    </div>
  )
}

function ScopeItem({ fn, rule, type }: Preset["scope"][number]) {
  return (
    <div className="flex items-start gap-3 border-t border-border py-2.5 first:border-t-0">
      <span className="mt-0.5">
        {type === "prevention" ? (
          <Shield className="size-3.5 text-primary" strokeWidth={1.6} />
        ) : (
          <Radar className="size-3.5 text-muted-foreground" strokeWidth={1.6} />
        )}
      </span>
      <div>
        <div className="font-mono text-[12.5px] text-ink-strong">{fn}</div>
        <div className="text-[12.5px] text-muted-foreground">{rule}</div>
      </div>
    </div>
  )
}

function Reveal({ preset }: { preset: Preset }) {
  const p = preset.prevention
  return (
    <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
      {/* Prevention: what we found */}
      <div>
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
          <Shield className="size-3.5 text-primary" strokeWidth={1.6} /> Prevention · the audit
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.severity && <SeverityDot severity={p.severity} glow />}
          <span className="text-[15px] font-medium text-ink-strong">{p.verdict}</span>
          <Chip
            tone={p.cls === "bug" ? "critical" : p.cls === "centralization" ? "ghost" : "success"}
          >
            {p.cls === "bug" ? "● bug" : p.cls === "centralization" ? "◐ centralization" : "○ clean"}
          </Chip>
          {p.poc && (
            <Chip tone="success">
              <Check className="size-3" /> PoC green · {p.poc.asserts}
            </Chip>
          )}
        </div>
        <p className="mt-2.5 font-medium text-foreground">{p.title}</p>
        <p className="mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-muted-foreground">{p.detail}</p>
        {p.poc && (
          <div className="mt-4 overflow-hidden rounded-lg border border-border bg-background font-mono text-[12px]">
            <div className="border-b border-border bg-secondary px-3 py-2 text-[11px] text-faint">
              run_simnet_poc · finding-1.ts · docker run --network none
            </div>
            <div className="space-y-0.5 p-3.5 leading-relaxed">
              {p.poc.lines.map((l, i) => (
                <div key={i} className="text-foreground">
                  {l.includes("ok") ? (
                    <>
                      {l.replace(/ok$/, "")}
                      <span className="text-success">ok</span>
                    </>
                  ) : (
                    <>
                      <span className="text-faint">$ </span>
                      {l}
                    </>
                  )}
                </div>
              ))}
              <div className="pt-1.5 text-success">✓ reproduced, {p.poc.asserts} assertions passed.</div>
            </div>
          </div>
        )}
      </div>

      {/* Detection: what it would watch */}
      <div>
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
          <Radar className="size-3.5 text-muted-foreground" strokeWidth={1.6} /> Detection · the scope
        </div>
        <p className="max-w-[44ch] text-[13.5px] leading-relaxed text-muted-foreground">
          The audit becomes the monitoring. This is exactly what Sentinel would watch on{" "}
          <span className="font-mono text-foreground">{preset.name}</span>, nothing generic.
        </p>
        <div className="mt-3.5 rounded-lg border border-border bg-card px-4 py-1">
          {preset.scope.map((s) => (
            <ScopeItem key={s.fn} {...s} />
          ))}
        </div>
        <p className="mt-3 text-[12px] text-faint">
          Human-gated. A correlation is not a confirmed exploit. Sentinel routes intent, it never acts on-chain.
        </p>
      </div>
    </div>
  )
}

function Console() {
  const [selected, setSelected] = useState(PRESETS[0])
  const [phase, setPhase] = useState<Phase>("idle")
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (phase !== "running") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(PHASES.length)
      setPhase("done")
      return
    }
    if (step >= PHASES.length) {
      const t = setTimeout(() => setPhase("done"), 420)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 420 : 640)
    return () => clearTimeout(t)
  }, [phase, step])

  function pick(p: Preset) {
    setSelected(p)
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
        {PRESETS.map((p) => {
          const on = p.id === selected.id
          return (
            <button
              key={p.id}
              onClick={() => pick(p)}
              aria-pressed={on}
              className={cn(
                "rounded-lg border px-3 py-1.5 font-mono text-[12.5px] transition-colors",
                on
                  ? "border-primary bg-primary-weak text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary",
              )}
            >
              {p.name}
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
            sentinel audit · <span className="text-ink-strong">{selected.name}</span>
          </span>
          <span className="ml-auto font-mono text-[11.5px] text-faint">
            {selected.arch} · {selected.tvl}
          </span>
        </div>

        <div className="min-h-[280px] p-5 sm:p-6">
          {phase === "idle" && (
            <div className="flex min-h-[232px] flex-col items-start justify-center gap-5">
              <div>
                <p className="max-w-[52ch] text-[15px] text-foreground">
                  Run the actual audit engine on{" "}
                  <span className="font-mono text-ink-strong">{selected.name}</span>. Deep tier, five
                  subagents, adversarial verification, sandbox reproduction. It resolves to a real finding and
                  the monitoring scope it would watch.
                </p>
                <p className="mt-2 font-mono text-[12.5px] text-faint">{selected.principal}</p>
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
                Auditing <span className="font-mono text-ink-strong">{selected.name}</span>
                <Chip tone="accent" className="ml-1">
                  deep
                </Chip>
              </div>
              <div className="border-y border-border py-1">
                {PHASES.map((ph, i) => (
                  <PhaseRow
                    key={ph.key}
                    label={ph.label}
                    state={i < step ? "done" : i === step ? "running" : "pending"}
                  />
                ))}
              </div>
              {step >= 3 && (
                <p className="mt-4 font-mono text-[12.5px] text-warning">{selected.land}</p>
              )}
            </div>
          )}

          {phase === "done" && (
            <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
              <Reveal preset={selected} />
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

      <EmailCapture preset={selected} done={phase === "done"} />
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
            Not a pitch deck. Pick a real Stacks contract below and run the actual engine. Prevention and
            detection, from one audit.
          </p>
        </div>

        <div className="mt-9">
          <Console />
        </div>

        <p className="mx-auto mt-8 max-w-[560px] text-center text-[12.5px] text-faint">
          A full deep sweep costs about two dollars in compute. Monitoring is scoped by what it finds.
          Powered by secondlayer.
        </p>
      </main>
    </div>
  )
}
