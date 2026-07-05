import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Check, Loader2, ArrowRight, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Chip } from "@/components/primitives"
import { AuditPhases } from "@/components/audit"
import { cn } from "@/lib/utils"

type Candidate = { name: string; arch: string; tvl: string; risk: "high" | "medium" }
type Tier = { k: string; title: string; blurb: string }

const CANDIDATES: Candidate[] = [
  { name: "v0-vault-sbtc", arch: "vault", tvl: "≈ 51 BTC", risk: "high" },
  { name: "ccd002-treasury-mia", arch: "dao", tvl: "≈ 4.1M STX", risk: "high" },
  { name: "dlmm-pool-stx-usdcx", arch: "amm", tvl: "≈ 1.8M STX", risk: "medium" },
]

const TIERS: Tier[] = [
  { k: "deep", title: "Deep", blurb: "Opus · full panel · $99 · minutes" },
  { k: "monitor", title: "Monitor", blurb: "Sonnet · fast · ~$0.40" },
]

const STEPS = ["Add", "Audit", "Plan", "Live"] as const

const WATCHED_FNS = ["socialize-debt", "system-borrow", "redeem", "register-market"]

function Stepper({ step }: { step: number }) {
  return (
    <div className="mb-[34px] flex items-center">
      {STEPS.map((s, i) => {
        const done = i < step
        const cur = i === step
        return (
          <div key={s} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full border text-xs font-medium",
                  done && "border-transparent bg-primary text-primary-foreground",
                  cur && "border-primary bg-primary-weak text-primary",
                  !done && !cur && "border-border bg-secondary text-faint",
                )}
              >
                {done ? <Check className="size-[13px]" strokeWidth={2.4} /> : i + 1}
              </span>
              <span className={cn("text-[13px]", cur || done ? "font-medium text-foreground" : "text-faint")}>
                {s}
              </span>
            </div>
            {i < STEPS.length - 1 && <div className="mx-3 h-px flex-1 bg-border" />}
          </div>
        )
      })}
    </div>
  )
}

function StepAdd({ onNext }: { onNext: (contract: string, email: string) => void }) {
  const [searchParams] = useSearchParams()
  const [sel, setSel] = useState("v0-vault-sbtc")
  const [tier, setTier] = useState("deep")
  const [contractId, setContractId] = useState(searchParams.get("contract") ?? "")
  const [email, setEmail] = useState("")
  const [emailError, setEmailError] = useState<string | null>(null)
  const activeContract = contractId.trim() || sel
  // Contract names are short; pasted principals ("SP….contract-name") are long — show just the
  // name so the submit button never forces the row to wrap word-by-word.
  const displayContract = activeContract.includes(".") ? activeContract.split(".").pop() : activeContract
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)

  function submit() {
    if (!emailValid) {
      setEmailError("Enter a valid email — we'll send the report there.")
      return
    }
    setEmailError(null)
    onNext(activeContract, email)
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">What should Sentinel watch?</h1>
      <p className="mt-2 text-[14.5px] text-muted-foreground">
        Paste a Clarity contract, or pick one we ranked by value and risk. Sentinel audits it, then
        scopes monitoring from what it finds.
      </p>

      <div className="mt-6 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <span className="font-mono text-[13px] text-faint">SP…</span>
        <Input
          value={contractId}
          onChange={(e) => setContractId(e.target.value)}
          placeholder="paste a contract principal.name"
          className="h-6 border-0 bg-transparent px-0 font-mono text-[13.5px] focus-visible:ring-0"
        />
      </div>

      <div className="mt-[26px] mb-2.5 font-mono text-[11px] uppercase tracking-wider text-faint">
        Discovered for you
      </div>
      <div className="grid gap-2">
        {CANDIDATES.map((d) => {
          const on = sel === d.name
          return (
            <button
              key={d.name}
              onClick={() => setSel(d.name)}
              className={cn(
                "flex items-center gap-3 rounded-[10px] border px-[15px] py-[13px] text-left transition-colors",
                on ? "border-primary bg-primary-weak" : "border-border bg-card hover:bg-secondary",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-4 items-center justify-center rounded-full border",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {on && <Check className="size-[11px]" strokeWidth={2.6} />}
              </span>
              <span className="font-mono text-[13.5px] font-medium text-ink-strong">{d.name}</span>
              <Chip tone="neutral">{d.arch}</Chip>
              <span className="flex-1" />
              <span className="font-mono text-[12px] text-muted-foreground tnum">{d.tvl}</span>
              <Chip tone={d.risk === "high" ? "accent" : "ghost"}>{d.risk} risk</Chip>
            </button>
          )
        })}
      </div>

      <div className="mt-[26px] mb-2.5 font-mono text-[11px] uppercase tracking-wider text-faint">
        Depth
      </div>
      <div className="flex gap-2">
        {TIERS.map((t) => {
          const on = tier === t.k
          return (
            <button
              key={t.k}
              onClick={() => setTier(t.k)}
              className={cn(
                "flex-1 rounded-[10px] border px-[15px] py-[13px] text-left transition-colors",
                on ? "border-primary bg-primary-weak" : "border-border bg-card hover:bg-secondary",
              )}
            >
              <div className="text-sm font-medium text-ink-strong">{t.title}</div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">{t.blurb}</div>
            </button>
          )
        })}
      </div>

      <div className="mt-[26px] mb-2.5 font-mono text-[11px] uppercase tracking-wider text-faint">
        Where should we send the report?
      </div>
      <Input
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          if (emailError) setEmailError(null)
        }}
        placeholder="you@protocol.xyz"
        aria-invalid={!!emailError}
        className={cn("h-11 font-mono text-[13.5px]", emailError && "border-destructive")}
      />
      {emailError && <p className="mt-2 text-[12.5px] text-destructive">{emailError}</p>}

      <div className="mt-[22px] flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 flex-1 text-[12.5px] text-faint">
          A real audit takes minutes. We'll email you when it's done.
        </span>
        <Button size="lg" onClick={submit} className="shrink-0">
          Audit and watch {displayContract}
          <ArrowRight />
        </Button>
      </div>
    </div>
  )
}

function StepAudit({ contract, onNext }: { contract: string; onNext: () => void }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <h1 className="truncate text-[22px] font-semibold">Auditing {contract}</h1>
        <Chip tone="accent">deep</Chip>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        The multi-agent engine is reading the contract, arguing with itself, and reproducing anything
        it finds. This usually takes a few minutes.
      </p>

      <div className="mt-6">
        <AuditPhases activeStep={2} />
      </div>

      <div className="mt-4 flex items-center gap-2.5 rounded-[10px] border border-border bg-card px-[15px] py-[13px]">
        <Loader2 className="size-[15px] animate-spin text-primary" />
        <span className="text-[13px]">
          Found <b className="font-medium text-ink-strong">socialize-debt unbounded LP loss</b>{" "}
          <span className="text-muted-foreground">· verifying, then reproducing in the sandbox</span>
        </span>
      </div>

      <div className="mt-3.5 flex gap-4 text-[12.5px] text-faint">
        <span className="font-mono tnum">2m 41s elapsed</span>
        <span className="font-mono tnum">$0.74 so far</span>
        <span>5 subagents</span>
      </div>

      <div className="mt-[26px] flex items-center justify-between">
        <span className="text-[12.5px] text-faint">You can close this. We'll email you when it's done.</span>
        <Button size="lg" onClick={onNext}>
          Review the plan
          <ArrowRight />
        </Button>
      </div>
    </div>
  )
}

function StepPlan({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <div>
      <h1 className="text-[23px] font-semibold">Sentinel found 1 bug and drafted your scope</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This is what monitoring will watch, derived from the audit. Go live now with sensible
        defaults, and fine-tune anything later in the Monitoring Plan.
      </p>

      <div className="mt-[22px] grid gap-3">
        <div className="rounded-xl border border-border bg-secondary px-[17px] py-[15px]">
          <div className="flex items-center gap-2.5">
            <span className="text-[13.5px] font-medium text-ink-strong">4 watched functions</span>
            <span className="flex-1" />
            <Chip tone="success">
              <Check className="size-3" strokeWidth={2.4} /> ready
            </Chip>
          </div>
          <div className="mt-[11px] flex flex-wrap gap-[7px]">
            {WATCHED_FNS.map((fn) => (
              <Chip key={fn} tone="neutral">
                {fn}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-secondary px-[17px] py-[15px]">
            <div className="text-[13.5px] font-medium text-ink-strong">1 detection signature</div>
            <p className="mt-[7px] text-[12.5px] text-muted-foreground">
              socialize-debt LP loss, with a green PoC. Watches for the bug being exploited.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-secondary px-[17px] py-[15px]">
            <div className="text-[13.5px] font-medium text-ink-strong">1 outflow baseline</div>
            <p className="mt-[7px] text-[12.5px] text-muted-foreground">
              sBTC p99 = 770,115 sats, from 300 real outflows. Suggested as your gate.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-7 flex items-center justify-between">
        <Button size="lg" variant="ghost" onClick={onBack}>
          <ArrowLeft />
          Back
        </Button>
        <Button size="lg" onClick={onNext}>
          Provision and go live
          <ArrowRight />
        </Button>
      </div>
    </div>
  )
}

function StepLive({ contract, onRestart }: { contract: string; onRestart: () => void }) {
  return (
    <div className="pt-3.5 text-center">
      <div className="mx-auto mb-5 inline-flex size-14 items-center justify-center rounded-full bg-success-weak text-success">
        <Check className="size-7" strokeWidth={2.4} />
      </div>
      <h1 className="text-2xl font-semibold">Monitoring is live</h1>
      <p className="mx-auto mt-2.5 max-w-[52ch] text-[14.5px] text-muted-foreground">
        Sentinel is watching <b className="font-medium text-foreground">{contract}</b> across{" "}
        <b className="font-medium text-foreground">9 subscriptions</b>. You'll be paged when a proposal
        enters the timelock, or an outflow breaks the baseline. Nothing acts without you.
      </p>
      <div className="mt-7 flex justify-center gap-2.5">
        <Button size="lg" render={<Link to="/alerts" />}>
          Go to dashboard
        </Button>
        <Button size="lg" variant="outline" onClick={onRestart}>
          Watch another contract
        </Button>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [contract, setContract] = useState("v0-vault-sbtc")
  return (
    <main className="flex flex-1 justify-center px-6 py-12">
      <div className="w-full max-w-[660px]">
        <Stepper step={step} />
        {step === 0 && (
          <StepAdd
            onNext={(c) => {
              setContract(c)
              setStep(1)
            }}
          />
        )}
        {step === 1 && <StepAudit contract={contract} onNext={() => setStep(2)} />}
        {step === 2 && <StepPlan onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && <StepLive contract={contract} onRestart={() => setStep(0)} />}
      </div>
    </main>
  )
}
