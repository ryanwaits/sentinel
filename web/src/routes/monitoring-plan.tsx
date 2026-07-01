import { useState } from "react"
import { Sparkles, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Chip } from "@/components/primitives"
import { TRIG_LABEL } from "@/lib/mock"
import { cn } from "@/lib/utils"

// ---------- data (Zest v0-vault-sbtc) ----------
interface WatchedFn {
  name: string
  trig: string
  asset?: string
  route: "Type 1" | "Type 2"
  watching: "live" | "pending"
  rule: string
}

const FNS: WatchedFn[] = [
  { name: "socialize-debt", trig: "governance.proxy_upgrade", route: "Type 1", watching: "live", rule: "new code is audited before it executes" },
  { name: "system-borrow", trig: "transfer.outflow", asset: "sBTC", route: "Type 2", watching: "live", rule: "outflow ≥ live threshold, or a new counterparty" },
  { name: "redeem", trig: "transfer.outflow", asset: "sBTC", route: "Type 2", watching: "live", rule: "outflow ≥ live threshold" },
  { name: "register-market", trig: "counterparty.new", route: "Type 2", watching: "pending", rule: "a call from a counterparty outside the allowlist" },
]

const BASELINE = {
  assetId: "SM3VDX…sbtc-token",
  n: 300,
  p50: "91,386",
  p95: "612,400",
  p99: "770,115",
  max: "770,115",
  recipients: 4,
  computed: "2d ago",
  suggested: "770,115",
}

const SIG0 = {
  title: "socialize-debt forces unbounded LP loss",
  fn: "socialize-debt",
  pre: "scaled-amount is unbounded, with no cap or attested loss",
}

const WAIVERS = [
  {
    finding: "Authorized markets can draw liquidity via system-borrow",
    label: "by-design",
    note: "Bounded by the authorized-market allowlist. Accepted 4d ago, suppressed from paging.",
  },
]

// ---------- primitives ----------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-[3px] font-mono text-[10.5px] uppercase tracking-wider text-faint">{label}</div>
      <div>{children}</div>
    </div>
  )
}

function Section({
  title, note, action, children,
}: {
  title: string
  note: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mb-[30px]">
      <div className="mb-3 flex items-baseline gap-3 px-[22px]">
        <h2 className="text-[14.5px] font-semibold text-ink-strong">{title}</h2>
        <span className="text-[12.5px] text-muted-foreground">{note}</span>
        <span className="flex-1" />
        {action}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-secondary">{children}</div>
    </section>
  )
}

// ---------- threshold control (the moat interaction) ----------
function ThresholdRow() {
  const [live, setLive] = useState<string | null>(null)
  return (
    <div className="grid gap-3.5 px-[18px] py-4">
      <div className="flex flex-wrap gap-x-[26px] gap-y-3.5 text-[13px]">
        <Field label="Asset">
          <span className="font-mono text-ink-strong">sBTC</span>{" "}
          <span className="font-mono text-[12px] text-faint">{BASELINE.assetId}</span>
        </Field>
        <Field label="p50"><span className="font-mono tnum">{BASELINE.p50}</span></Field>
        <Field label="p95"><span className="font-mono tnum">{BASELINE.p95}</span></Field>
        <Field label="p99"><span className="font-mono tnum text-ink-strong">{BASELINE.p99}</span></Field>
        <Field label="max"><span className="font-mono tnum">{BASELINE.max}</span></Field>
        <Field label="known recipients"><span className="font-mono tnum">{BASELINE.recipients}</span></Field>
      </div>
      <div className="flex flex-wrap items-center gap-3.5 border-t border-border pt-3.5">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-[13px]">
            Audit suggests <span className="font-mono tnum text-ink-strong">{BASELINE.suggested} sats</span>{" "}
            <span className="text-muted-foreground">(p99 of {BASELINE.n} real outflows)</span>
          </span>
        </div>
        <span className="flex-1" />
        {live ? (
          <span className="inline-flex items-center gap-2.5">
            <span className="text-[13px]">
              Live gate{" "}
              <Chip tone="success">
                <Check className="size-3" /> {live} sats
              </Chip>
            </span>
            <Button size="sm" variant="ghost" onClick={() => setLive(null)}>
              Revert to fail-safe
            </Button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-3">
            <span className="text-[12.5px] text-warning">Live gate: not set · every outflow surfaces (fail-safe)</span>
            <Button size="sm" onClick={() => setLive(BASELINE.suggested)}>
              Promote to live gate
            </Button>
          </span>
        )}
      </div>
    </div>
  )
}

export default function MonitoringPlanPage() {
  const [sigOn, setSigOn] = useState(true)
  return (
    <div className="mx-auto max-w-[920px] pb-[70px] pt-7">
      {/* header */}
      <div className="px-[24px]">
        <div className="mb-2.5 text-[12.5px] text-muted-foreground">
          Contracts <span className="text-faint">/</span> <span className="text-foreground">v0-vault-sbtc</span>
        </div>
        <div className="flex flex-wrap items-start gap-3.5">
          <div>
            <h1 className="flex items-center gap-2.5 text-[22px] font-semibold">
              v0-vault-sbtc
              <Chip tone="neutral">vault</Chip>
              <Chip tone="success">
                <span className="size-1.5 rounded-full bg-success" /> monitoring live
              </Chip>
            </h1>
            <div className="mt-[7px] font-mono text-[12.5px] text-muted-foreground">
              SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc
            </div>
          </div>
          <span className="flex-1" />
          <div className="flex gap-2">
            <Button variant="outline" size="sm">Pause monitoring</Button>
            <Button variant="outline" size="sm">Re-run audit</Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-[22px] text-[12.5px] text-muted-foreground">
          <span>Last audit <b className="font-medium text-foreground">4d ago</b> · $2.21</span>
          <span><b className="font-medium text-foreground tnum">4</b> functions watched</span>
          <span><b className="font-medium text-foreground tnum">1</b> detection signature</span>
          <span>client <b className="font-medium text-foreground">zest-protocol</b></span>
        </div>
        {/* tabs */}
        <Tabs value="plan" className="mt-5">
          <TabsList variant="line" className="border-b border-border">
            <TabsTrigger value="plan">Monitoring Plan</TabsTrigger>
            <TabsTrigger value="alerts">
              Alerts
              <span className="font-mono text-[11px] text-faint">3</span>
            </TabsTrigger>
            <TabsTrigger value="audits">Audits</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* plan */}
      <div className="px-[24px] pt-[22px]">
        <div className="mb-[26px] flex items-start gap-2.5 rounded-[10px] bg-primary-weak px-3.5 py-3">
          <Sparkles className="mt-px size-3.5 text-primary" strokeWidth={1.5} />
          <p className="max-w-[78ch] text-[13px] text-foreground">
            Sentinel derived this scope from your last audit. Review and tune it. You promote the live gates and toggle the
            signatures. <b className="font-medium">Sentinel never changes a live gate on its own.</b>
          </p>
          <span className="flex-1" />
          <Button variant="ghost" size="sm">Sync from latest audit</Button>
        </div>

        <Section title="Watched functions" note="the privileged functions from the audit, and how each is routed">
          <div className="grid grid-cols-[1.3fr_1.2fr_0.8fr_1.6fr] gap-3 border-b border-border px-4 py-[9px] font-mono text-[11px] uppercase tracking-wider text-faint">
            <span>Function</span>
            <span>Trigger</span>
            <span>Status</span>
            <span>Rule</span>
          </div>
          {FNS.map((f, i) => (
            <div
              key={f.name}
              className={cn(
                "grid grid-cols-[1.3fr_1.2fr_0.8fr_1.6fr] items-center gap-3 bg-background px-4 py-3",
                i && "border-t border-border",
              )}
            >
              <span className="font-mono text-[13px] text-ink-strong">{f.name}</span>
              <span className="inline-flex items-center gap-1.5">
                <Chip tone={f.route === "Type 1" ? "accent" : "ghost"}>{TRIG_LABEL[f.trig]}</Chip>
                {f.asset && <span className="font-mono text-[11px] text-faint">{f.asset}</span>}
              </span>
              <span>
                {f.watching === "live" ? (
                  <Chip tone="success">
                    <Check className="size-3" /> live
                  </Chip>
                ) : (
                  <Chip tone="warning">pending</Chip>
                )}
              </span>
              <span className="text-[12.5px] text-muted-foreground">{f.rule}</span>
            </div>
          ))}
        </Section>

        <Section
          title="Outflow baseline & threshold"
          note="learned from real on-chain history via the secondlayer Index"
          action={<Button variant="ghost" size="sm">Recompute · computed {BASELINE.computed}</Button>}
        >
          <ThresholdRow />
        </Section>

        <Section title="Detection signatures" note="confirmed findings the monitor watches for being exploited">
          <div className="flex items-start gap-3.5 bg-background px-4 py-3.5">
            <div className="pt-px">
              <Switch checked={sigOn} onCheckedChange={setSigOn} />
            </div>
            <div className={cn("flex-1", !sigOn && "opacity-55")}>
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span className="font-medium text-ink-strong">{SIG0.title}</span>
                <Chip tone="accent">HIGH</Chip>
                <Chip tone="neutral">● bug</Chip>
                <Chip tone="success">
                  <Check className="size-3" /> PoC green
                </Chip>
                <span className="font-mono text-[12px] text-muted-foreground">fn {SIG0.fn}</span>
              </div>
              <p className="mt-[9px] max-w-[76ch] text-[12.5px] text-muted-foreground">
                A confirmed finding from your audit (green PoC). Type-2 flags a runtime call as a possible exploitation,
                then a human verifies the precondition: <span className="text-foreground">{SIG0.pre}</span>.
              </p>
            </div>
          </div>
        </Section>

        <Section title="Accepted waivers" note="centralization / trust assumptions surfaced once, then suppressed">
          {WAIVERS.map((w) => (
            <div key={w.finding} className="flex items-center gap-3 bg-background px-4 py-3">
              <div className="flex-1">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-foreground">{w.finding}</span>
                  <Chip tone="ghost">{w.label}</Chip>
                </div>
                <p className="mt-[5px] text-[12.5px] text-muted-foreground">{w.note}</p>
              </div>
              <Button variant="ghost" size="sm">Un-waive</Button>
            </div>
          ))}
        </Section>
      </div>
    </div>
  )
}
