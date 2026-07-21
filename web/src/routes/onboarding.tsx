import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Check, Loader2, ArrowRight, ArrowLeft, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Chip } from "@/components/primitives"
import { AuditPhases } from "@/components/audit"
import { networkOf } from "@/lib/stacks-id"
import { cn } from "@/lib/utils"

const TIERS = [
  { k: "monitor", title: "Monitor", blurb: "Sonnet · ~$2" },
  { k: "deep", title: "Deep", blurb: "Opus · full panel" },
] as const

const LIFECYCLE = [
  { k: "Devnet", title: "Audit early", blurb: "Catch bugs while the code is cheap to change.", now: false },
  { k: "Testnet", title: "Pre-launch review", blurb: "A verified report on the exact bytes you ship.", now: false },
  { k: "Mainnet", title: "Continuous watch", blurb: "Findings become the signals monitoring looks for.", now: true },
] as const

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

function StepAdd({ onNext }: { onNext: (contract: string, tier: string) => void }) {
  const [searchParams] = useSearchParams()
  const [contractId, setContractId] = useState(
    searchParams.get("contract") ?? "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc",
  )
  const [tier, setTier] = useState("deep")
  // Network is read from the address (@secondlayer/stacks), never asked for.
  const network = networkOf(contractId)

  return (
    <div>
      <div className="font-mono text-[11.5px] uppercase tracking-[0.1em] text-primary">New audit</div>
      <h1 className="mt-3 text-2xl font-semibold">Point Sentinel at a contract.</h1>
      <p className="mt-2 max-w-[52ch] text-[14.5px] text-muted-foreground">
        It reads the source, runs the multi-agent audit, reproduces anything confirmed in an
        airgapped sandbox, then hands you a report. No exploit ever touches a live chain.
      </p>

      <form className="mt-[22px] flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
        <div className="flex h-11 items-center gap-2.5 rounded-[9px] border border-border-strong bg-card px-3 transition-shadow focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary-weak">
          <span className="font-mono text-[12px] text-faint">contract</span>
          <Input
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            spellCheck={false}
            aria-label="Contract id"
            placeholder="SP…principal.contract-name"
            className="h-6 border-0 bg-transparent px-0 font-mono text-[13.5px] focus-visible:ring-0"
          />
        </div>

        <div className="flex items-center gap-2.5 px-0.5 text-[12.5px] text-muted-foreground">
          {network ? (
            <>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-success" />
                Resolved on <b className="font-medium text-foreground">{network}</b>
              </span>
              <span className="text-faint">· network read from the address, not asked</span>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-faint">
              <span className="size-2 rounded-full bg-border-strong" />
              Paste an <span className="font-mono">address.contract-name</span> to resolve the network
            </span>
          )}
        </div>

        <div className="my-1 flex items-center gap-3 text-[12px] text-faint before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
          or
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-[9px] border border-dashed border-border-strong px-3.5 py-[11px] text-[13px] text-muted-foreground transition-colors hover:bg-secondary">
          <Upload className="size-4" strokeWidth={1.6} />
          Upload a <span className="font-mono text-[12px]">.clar</span> file to audit pre-deployment
          code (devnet / testnet).
        </label>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-faint">Depth</div>
            <div className="inline-flex overflow-hidden rounded-lg border border-border-strong bg-card">
              {TIERS.map((t) => (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setTier(t.k)}
                  className={cn(
                    "border-r border-border px-[13px] py-2 text-left text-[12.5px] transition-colors last:border-r-0",
                    tier === t.k ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.title}
                  <span className="mt-px block font-mono text-[10px] text-faint">{t.blurb}</span>
                </button>
              ))}
            </div>
          </div>
          <Button size="lg" onClick={() => onNext(contractId, tier)} disabled={!network}>
            Run audit
            <ArrowRight />
          </Button>
        </div>
      </form>

      <div className="mt-[26px] flex border-t border-border pt-5">
        {LIFECYCLE.map((s) => (
          <div key={s.k} className="flex-1 pr-3.5">
            <span className={cn("mb-2.5 block size-[9px] rounded-full", s.now ? "bg-primary" : "bg-border-strong")} />
            <div className={cn("font-mono text-[10.5px] uppercase tracking-[0.08em]", s.now ? "text-primary" : "text-faint")}>
              {s.k}
            </div>
            <div className="mt-[5px] text-[13px] text-foreground">{s.title}</div>
            <div className="mt-[3px] text-[12px] leading-snug text-muted-foreground">{s.blurb}</div>
          </div>
        ))}
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

      <div className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-faint">
        <span>8 subagents on the panel</span>
        <span>·</span>
        <span>adversarial verify, then sandbox reproduction</span>
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
              setContract(c.includes(".") ? (c.split(".").pop() ?? c) : c)
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
