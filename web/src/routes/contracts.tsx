import { useState } from "react"
import { Plus, ChevronRight, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/primitives"
import { CONTRACTS, TRIG_LABEL, type Contract } from "@/lib/mock"
import { cn } from "@/lib/utils"

const COLS = "grid-cols-[2fr_0.9fr_1fr_1.1fr_1.1fr_0.7fr_18px]"

const STATUS: Record<Contract["status"], { dot: string; label: string; tone: string }> = {
  live: { dot: "bg-success", label: "live", tone: "text-success" },
  auditing: { dot: "bg-primary animate-pulse", label: "auditing", tone: "text-primary" },
  paused: { dot: "bg-faint", label: "paused", tone: "text-faint" },
}

// Which subscription triggers Sentinel arms for each archetype (labels via TRIG_LABEL).
const ARCH_TRIGGERS: Record<string, string[]> = {
  dao: ["governance.proposal_submitted", "governance.proxy_upgrade"],
  proxy: ["governance.proxy_upgrade", "transfer.outflow"],
  vault: ["transfer.outflow", "counterparty.new"],
  amm: ["transfer.outflow", "counterparty.new"],
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-[3px] font-mono text-[10.5px] uppercase tracking-wider text-faint">{label}</div>
      <div>{children}</div>
    </div>
  )
}

function AlertCell({ alerts }: { alerts: Contract["alerts"] }) {
  const { critical, high, info } = alerts
  if (!critical && !high && !info) return <span className="text-faint">—</span>
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {critical ? <Chip tone="critical">{critical} critical</Chip> : null}
      {high ? <Chip tone="accent">{high} high</Chip> : null}
      {info ? <Chip tone="ghost">{info} info</Chip> : null}
    </span>
  )
}

function ContractRow({ c }: { c: Contract }) {
  const [open, setOpen] = useState(false)
  const st = STATUS[c.status]
  const auditing = c.status === "auditing"
  const triggers = ARCH_TRIGGERS[c.arch] ?? []

  return (
    <div className={cn("border-t border-border transition-colors", open ? "bg-card" : "hover:bg-card")}>
      <button className={cn("grid w-full items-center gap-3.5 px-5 py-[15px] text-left", COLS)} onClick={() => setOpen((o) => !o)}>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className={cn("size-2 shrink-0 rounded-full", st.dot)} />
            <span className="truncate font-mono text-[13.5px] font-medium text-ink-strong">{c.name}</span>
            <Chip tone="neutral">{c.arch}</Chip>
          </div>
          <div className="mt-[5px] truncate pl-[17px] font-mono text-[11.5px] text-faint">{c.principal}</div>
        </div>

        <div className="text-[13px] text-muted-foreground">
          {auditing ? (
            <span className="text-primary">auditing…</span>
          ) : (
            <span>
              <b className="font-medium text-foreground tnum">{c.fns}</b> fns ·{" "}
              <b className="font-medium text-foreground tnum">{c.sigs}</b> sig{c.sigs === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="text-[13px]">
          {auditing ? (
            <span className="text-primary">provisioning</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-success">
              <Check className="size-3.5" />
              <span className="font-mono text-muted-foreground tnum">{c.subs} live</span>
            </span>
          )}
        </div>

        <div>
          <AlertCell alerts={c.alerts} />
        </div>

        <div className={cn("font-mono text-[12.5px]", auditing ? "text-primary" : "text-muted-foreground")}>{c.audit}</div>

        <div className="font-mono text-[13px] text-foreground tnum">{c.spend}</div>

        <ChevronRight className={cn("size-[15px] text-faint transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="grid gap-3.5 px-5 pb-5 pl-[37px]">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-6 gap-y-3 text-[13px]">
            <Field label="Principal">
              <span className="font-mono text-foreground">{c.principal}</span>
            </Field>
            <Field label="Archetype">
              <span className="text-foreground">{c.arch}</span>
            </Field>
            <Field label="Status">
              <span className={st.tone}>{st.label}</span>
            </Field>
            <Field label="Subscription health">
              <span className="font-mono text-muted-foreground">{c.subs}{auditing ? "" : " live"}</span>
            </Field>
          </div>
          <Field label={auditing ? "Triggers (provisioning)" : "Watching triggers"}>
            <div className="mt-1 flex flex-wrap gap-[7px]">
              {triggers.length ? (
                triggers.map((t) => (
                  <Chip key={t} tone={auditing ? "ghost" : "neutral"}>
                    {TRIG_LABEL[t] ?? t}
                  </Chip>
                ))
              ) : (
                <span className="text-faint">no triggers armed</span>
              )}
            </div>
          </Field>
        </div>
      )}
    </div>
  )
}

function Stat({ n, label, tone }: { n: string; label: string; tone?: string }) {
  return (
    <div className="flex-1 border-r border-border px-[18px] py-3.5 last:border-r-0">
      <div className={cn("text-[22px] font-semibold tracking-[-0.02em] tnum", tone ?? "text-ink-strong")}>{n}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{label}</div>
    </div>
  )
}

export default function ContractsPage() {
  return (
    <div className="mx-auto max-w-[960px] pb-16 pt-7">
      <div className="flex items-end gap-3 px-[22px] pb-[22px]">
        <div>
          <h1 className="text-2xl font-semibold">Contracts</h1>
          <p className="mt-[5px] text-[13.5px] text-muted-foreground">The contracts you've brought to Sentinel, audited and under watch.</p>
        </div>
        <span className="flex-1" />
        <Button size="sm">
          <Plus className="size-3.5" /> Add contract
        </Button>
      </div>

      {/* summary strip (restrained, not a hero-metric block) */}
      <div className="mx-[22px] mb-6 flex overflow-hidden rounded-lg border border-border bg-secondary">
        <Stat n="3" label="watching · 1 auditing" />
        <Stat n="9" label="functions covered" />
        <Stat n="2" label="open alerts" tone="text-primary" />
        <Stat n="$4.06" label="today · $50 ceiling" />
        <Stat n="20 / 20" label="subscriptions live" tone="text-success" />
      </div>

      {/* watched set */}
      <div className="mx-[22px] overflow-hidden rounded-lg border border-border">
        <div className={cn("grid gap-3.5 border-b border-border bg-secondary px-5 py-2.5 font-mono text-[11px] uppercase tracking-wider text-faint", COLS)}>
          <span>Contract</span>
          <span>Watching</span>
          <span>Subscriptions</span>
          <span>Open alerts</span>
          <span>Last audit</span>
          <span>Spend</span>
          <span />
        </div>
        {CONTRACTS.map((c) => (
          <ContractRow key={c.name} c={c} />
        ))}
      </div>

      <p className="mx-[22px] mt-3.5 text-[12.5px] text-faint">
        Bring another contract to audit, and Sentinel starts watching it from what it finds.
      </p>
    </div>
  )
}
