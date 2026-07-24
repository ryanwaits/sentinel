import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Check, Loader2, ArrowRight, ArrowLeft, Upload, ChevronRight, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Chip, SeverityDot } from "@/components/primitives"
import { AuditPhases } from "@/components/audit"
import { networkOf } from "@/lib/stacks-id"
import { type AuditStatus, getAuditStatus, startAudit } from "@/lib/worker"
import { cn } from "@/lib/utils"

type Session = { sessionId: string; live: boolean }

const sevTone = (s: string) => (s === "critical" ? "critical" : s === "high" ? "accent" : "warning")

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

// The monitoring scope, derived from the audit. Every watch traces to something Sentinel checked:
// a confirmed bug (detection signature), a value path (outflow gate), or a privileged/trust surface.
// (Demo data for the front door; wires to the audit's KB candidate once the endpoint returns it.)
type Signal = "detection" | "outflow" | "privileged" | "authorized"
type Watch = {
  fn: string
  signal: Signal
  severity?: "critical" | "high" | "medium"
  why: string // shown at a glance
  rule: string // the alert rule (behind expand)
  note?: string // what in the audit it traces to (behind expand)
}

const SIGNAL: Record<Signal, { label: string; tone: "neutral" | "ghost" }> = {
  detection: { label: "detection signature", tone: "neutral" },
  outflow: { label: "outflow gate", tone: "neutral" },
  privileged: { label: "privileged call", tone: "ghost" },
  authorized: { label: "authorized set", tone: "ghost" },
}

const DEFAULT_WATCH: Watch[] = [
  {
    fn: "socialize-debt",
    signal: "detection",
    severity: "critical",
    why: "A confirmed bug lives here, with a green PoC. Watched for the exploit path being taken.",
    rule: "Pages the instant this is called on-chain, correlated to the proven finding — a human confirms the precondition before acting.",
    note: "Finding 1 · critical · reproduced 15/15, airgapped.",
  },
  {
    fn: "redeem",
    signal: "outflow",
    why: "The sBTC redemption path, watched for outflows above what's normal for this contract.",
    rule: "Pages when an sBTC outflow exceeds the learned gate (p99 = 770,115 sats). Tune the threshold anytime.",
    note: "Baseline learned from 300 real outflows.",
  },
  {
    fn: "system-borrow",
    signal: "authorized",
    why: "Trust-gated: an authorized market draws liquidity. An accepted assumption, watched for change.",
    rule: "Pages if the authorized-market set changes, or liquidity moves to a receiver outside it.",
    note: "Labeled centralization, not a bug — surfaced once, then suppressed.",
  },
  {
    fn: "register-market",
    signal: "privileged",
    why: "Registers a new authorized market — a privilege change to the vault.",
    rule: "Pages on any new market registration so a human can review the addition.",
  },
]

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

function StepAudit({
  contract,
  session,
  onNext,
}: {
  contract: string
  session: Session
  onNext: () => void
}) {
  const [status, setStatus] = useState<AuditStatus | { error: string } | null>(null)

  // Poll the worker for the real verdict when we have a live request. Fails soft: no worker → the
  // example flow below (so the deployed marketing site works without a worker wired up).
  useEffect(() => {
    if (!session.live || !session.sessionId) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      const s = await getAuditStatus(session.sessionId)
      if (!active) return
      setStatus(s)
      if ("status" in s && s.status === "running") timer = setTimeout(poll, 1500)
    }
    void poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [session.sessionId, session.live])

  const done = status && "status" in status && status.status === "done" ? status.result : null
  // Both the client error ({error}) and the worker's error status carry an `error` field.
  const failed = Boolean(status && "error" in status)
  const running = session.live && !done && !failed

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <h1 className="truncate text-[22px] font-semibold">
          {done ? "Audit complete" : `Auditing ${contract}`}
        </h1>
        <Chip tone={session.live ? "accent" : "ghost"}>{session.live ? "live" : "example"}</Chip>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        The multi-agent engine reads the contract, adversarially verifies each finding, and reproduces
        anything confirmed in an airgapped sandbox. No exploit touches a live chain.
      </p>

      <div className="mt-6">
        <AuditPhases activeStep={done ? 99 : 2} />
      </div>

      {done ? (
        <div className="mt-4 space-y-3">
          {done.summary && (
            <div className="rounded-[10px] border border-border bg-card px-[15px] py-[13px]">
              <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-faint">
                Summary
              </div>
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-foreground">
                {done.summary}
              </p>
            </div>
          )}
          <div className="grid gap-2">
          {done.findings.length === 0 ? (
            <div className="rounded-[10px] border border-border bg-secondary px-[15px] py-[13px] text-[13px] text-muted-foreground">
              No exploitable finding. Sentinel would rather say clean than inflate one.
            </div>
          ) : (
            done.findings.map((f) => (
              <div key={f.title} className="rounded-[10px] border border-border bg-card px-[15px] py-[13px]">
                <div className="text-[13.5px] font-medium text-ink-strong">{f.title}</div>
                <div className="mt-2 flex flex-wrap gap-[7px]">
                  <Chip tone={sevTone(f.severity)}>{f.severity}</Chip>
                  <Chip tone={f.class === "bug" ? "neutral" : "ghost"}>{f.class}</Chip>
                  {f.verdict === "confirmed" && <Chip tone="neutral">confirmed</Chip>}
                  {f.poc === "green" && (
                    <Chip tone="success">
                      <Check className="size-3" /> PoC green
                    </Chip>
                  )}
                  {f.poc === "pending" && <Chip tone="warning">PoC pending</Chip>}
                </div>
              </div>
            ))
          )}
          </div>
        </div>
      ) : failed ? (
        <div className="mt-4 rounded-[10px] border border-border bg-secondary px-[15px] py-[13px] text-[13px] text-muted-foreground">
          Couldn't reach the audit worker, showing the example instead. Point{" "}
          <span className="font-mono text-[12px]">VITE_SENTINEL_WORKER_URL</span> at a running worker to
          run it for real.
        </div>
      ) : running ? (
        <div className="mt-4 flex items-center gap-2.5 rounded-[10px] border border-border bg-card px-[15px] py-[13px]">
          <Loader2 className="size-[15px] animate-spin text-primary" />
          <span className="text-[13px] text-muted-foreground">
            Running the panel, verifying, then reproducing in the sandbox…
          </span>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2.5 rounded-[10px] border border-border bg-card px-[15px] py-[13px]">
          <Loader2 className="size-[15px] animate-spin text-primary" />
          <span className="text-[13px]">
            Found <b className="font-medium text-ink-strong">socialize-debt unbounded LP loss</b>{" "}
            <span className="text-muted-foreground">· verifying, then reproducing in the sandbox</span>
          </span>
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-faint">
        <span>8 subagents on the panel</span>
        <span>·</span>
        <span>adversarial verify, then sandbox reproduction</span>
      </div>

      <div className="mt-[26px] flex items-center justify-between">
        <span className="text-[12.5px] text-faint">
          {running ? "This takes a few minutes. You can leave it running." : "The audit becomes the monitoring scope."}
        </span>
        <Button size="lg" onClick={onNext} disabled={running}>
          Review the plan
          <ArrowRight />
        </Button>
      </div>
    </div>
  )
}

/** One watched function — glance (fn + signal + one-line why) with the rule + audit trace behind an expand. */
function WatchRow({ w, on, onToggle }: { w: Watch; on: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cn("border-t border-border first:border-t-0", !on && "opacity-55")}>
      <div className="flex items-start gap-3 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
          aria-expanded={open}
        >
          <ChevronRight
            className={cn("mt-[3px] size-[15px] shrink-0 text-faint transition-transform", open && "rotate-90")}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="font-mono text-[13.5px] font-medium text-ink-strong">{w.fn}</span>
              {w.severity && <SeverityDot severity={w.severity} />}
              <Chip tone={SIGNAL[w.signal].tone}>{SIGNAL[w.signal].label}</Chip>
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{w.why}</p>
          </div>
        </button>
        <Switch checked={on} onCheckedChange={onToggle} size="sm" className="mt-1" aria-label={`Watch ${w.fn}`} />
      </div>
      {open && (
        <div className="grid gap-3 pb-4 pl-[25px]">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-faint">Alert rule</div>
            <p className="mt-1 max-w-[68ch] text-[13px] text-foreground">{w.rule}</p>
          </div>
          {w.note && (
            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-wider text-faint">From the audit</div>
              <p className="mt-1 text-[12.5px] text-muted-foreground">{w.note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Inline "add a function we missed" — collapsed by default, so the default scope stays uncluttered. */
function AddWatch({ onAdd }: { onAdd: (fn: string, signal: Signal) => void }) {
  const [open, setOpen] = useState(false)
  const [fn, setFn] = useState("")
  const [signal, setSignal] = useState<Signal>("privileged")

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 border-t border-border py-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus className="size-4" strokeWidth={1.8} /> Watch another function
      </button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border py-3">
      <Input
        value={fn}
        onChange={(e) => setFn(e.target.value)}
        placeholder="function-name"
        aria-label="Function to watch"
        className="h-8 w-[190px] font-mono text-[13px]"
      />
      <select
        value={signal}
        onChange={(e) => setSignal(e.target.value as Signal)}
        aria-label="Signal type"
        className="h-8 rounded-md border border-border bg-card px-2 text-[12.5px] text-foreground outline-none focus-visible:border-primary"
      >
        {Object.entries(SIGNAL).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        onClick={() => {
          if (fn.trim()) onAdd(fn.trim(), signal)
          setFn("")
          setOpen(false)
        }}
      >
        Add
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  )
}

function StepPlan({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [items, setItems] = useState(() => DEFAULT_WATCH.map((w) => ({ w, on: true })))
  const count = items.filter((i) => i.on).length

  return (
    <div>
      <h1 className="text-[23px] font-semibold">Your monitoring plan</h1>
      <p className="mt-2 max-w-[62ch] text-sm text-muted-foreground">
        Derived from the audit, not generic rules. Every watch traces to something Sentinel checked, a
        confirmed bug, a trust assumption, or a value path. Adjust anything now or later; nothing pages
        without a human.
      </p>

      {/* audit recap — what was checked, said honestly (refuted shown, not hidden) */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-faint">
        <span>Audited across 8 dimensions</span>
        <span>·</span>
        <span className="text-muted-foreground">
          <b className="font-medium text-foreground tnum">1</b> bug reproduced
        </span>
        <span>·</span>
        <span className="text-muted-foreground">
          <b className="font-medium text-foreground tnum">1</b> trust assumption
        </span>
        <span>·</span>
        <span>1 refuted, dropped</span>
      </div>

      {/* the watch list — glance rows, each expandable to its rule + audit trace */}
      <div className="mt-5 rounded-xl border border-border bg-card/40 px-[18px] py-1">
        <div className="flex items-center gap-2.5 py-3">
          <span className="text-[13.5px] font-medium text-ink-strong">
            Watching {count} function{count === 1 ? "" : "s"}
          </span>
          <span className="flex-1" />
          <Chip tone="success">
            <Check className="size-3" strokeWidth={2.4} /> ready
          </Chip>
        </div>
        {items.map(({ w, on }, i) => (
          <WatchRow
            key={w.fn}
            w={w}
            on={on}
            onToggle={() =>
              setItems((prev) => prev.map((it, j) => (j === i ? { ...it, on: !it.on } : it)))
            }
          />
        ))}
        <AddWatch
          onAdd={(fn, signal) =>
            setItems((prev) => [
              ...prev,
              {
                w: {
                  fn,
                  signal,
                  why: "Added by you. Watched as an extra privileged call.",
                  rule: "Pages on any call to this function so a human can review it.",
                },
                on: true,
              },
            ])
          }
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Button size="lg" variant="ghost" onClick={onBack}>
          <ArrowLeft />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <span className="hidden text-[12px] text-faint sm:inline">
            Fine-tune thresholds anytime in the Monitoring Plan.
          </span>
          <Button size="lg" onClick={onNext} disabled={count === 0}>
            Provision and go live
            <ArrowRight />
          </Button>
        </div>
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
  const [session, setSession] = useState<Session>({ sessionId: "", live: false })

  // Kick off a real audit against the worker; fall through to the example flow if none is reachable.
  async function begin(fullId: string, tier: string) {
    setContract(fullId.includes(".") ? (fullId.split(".").pop() ?? fullId) : fullId)
    const started = await startAudit(fullId, tier)
    setSession("sessionId" in started ? { sessionId: started.sessionId, live: true } : { sessionId: "", live: false })
    setStep(1)
  }

  return (
    <main className="flex flex-1 justify-center px-6 py-12">
      <div className="w-full max-w-[660px]">
        <Stepper step={step} />
        {step === 0 && <StepAdd onNext={begin} />}
        {step === 1 && <StepAudit contract={contract} session={session} onNext={() => setStep(2)} />}
        {step === 2 && <StepPlan onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && (
          <StepLive
            contract={contract}
            onRestart={() => {
              setSession({ sessionId: "", live: false })
              setStep(0)
            }}
          />
        )}
      </div>
    </main>
  )
}
