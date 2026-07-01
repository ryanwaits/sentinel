import { useState } from "react"
import { Shield, Radar, ChevronRight, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Chip, SeverityDot } from "@/components/primitives"
import { ALERTS, type Alert } from "@/lib/mock"
import { cn } from "@/lib/utils"

const VERDICT_TONE = { confirmed: "neutral", uncertain: "warning", refuted: "ghost" } as const
const OUTWARD = new Set(["Veto proposal", "Begin disclosure", "Notify project", "Begin incident response"])

type Act = [string, "primary" | "outline" | "quiet"]

function actionsFor(a: Alert): Act[] {
  if (a.lane === "prevention") {
    if (a.state === "missed") return [["Begin disclosure", "primary"], ["Acknowledge", "quiet"]]
    return [["Veto proposal", "primary"], ["Begin disclosure", "outline"], ["Acknowledge", "quiet"]]
  }
  if (a.state === "ack") return [["Un-acknowledge", "quiet"]]
  if (a.state === "info") return [["Acknowledge", "quiet"], ["Dismiss", "quiet"]]
  return [["Notify project", "primary"], ["Begin incident response", "outline"], ["Acknowledge", "quiet"]]
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-[3px] font-mono text-[10.5px] uppercase tracking-wider text-faint">{label}</div>
      <div>{children}</div>
    </div>
  )
}

function AlertRow({ a }: { a: Alert }) {
  const [open, setOpen] = useState(a.id === "zest-socialize")
  const [confirm, setConfirm] = useState<string | null>(null)
  const dim = a.state === "ack" || a.state === "info"

  return (
    <div className={cn("border-t border-border transition-colors", open ? "bg-card" : "hover:bg-card", dim && "opacity-70")}>
      <button className="flex w-full gap-3 px-[22px] py-[15px] text-left" onClick={() => setOpen((o) => !o)}>
        <div className="pt-[5px]">
          <SeverityDot severity={a.severity} glow={a.state === "open" && a.severity !== "info"} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-[14.5px] font-medium text-ink-strong">{a.title}</span>
            <span className="font-mono text-[12px] text-muted-foreground">
              {a.contract}
              <span className="text-faint"> · {a.fn}</span>
            </span>
          </div>
          <div className="mt-[9px] flex flex-wrap items-center gap-[7px]">
            <Chip tone={a.severity === "critical" ? "critical" : a.severity === "high" ? "accent" : "neutral"}>
              {a.severity.toUpperCase()}
            </Chip>
            <Chip tone={a.cls === "bug" ? "neutral" : "ghost"}>
              {a.cls === "bug" ? "● bug" : a.cls === "centralization" ? "◐ centralization" : "○ info"}
            </Chip>
            <Chip tone={VERDICT_TONE[a.verdict]}>{a.verdict === "uncertain" ? "correlation" : a.verdict}</Chip>
            {a.poc === "green" && (
              <Chip tone="success">
                <Check className="size-3" /> PoC green
              </Chip>
            )}
            {typeof a.confidence === "number" && <Chip tone="ghost">conf {a.confidence.toFixed(2)}</Chip>}
            <span className="flex-1" />
            {a.veto && a.state === "open" && (
              <span className="font-mono text-[12px] font-medium text-primary tnum">
                veto: {a.veto.left} blocks left · {a.veto.eta}
              </span>
            )}
            {a.state === "missed" && <Chip tone="ghost">missed · detection only</Chip>}
            <span className="font-mono text-[11.5px] text-faint">{a.when}</span>
            <ChevronRight className={cn("size-[15px] text-faint transition-transform", open && "rotate-90")} />
          </div>
        </div>
      </button>

      {open && (
        <div className="grid gap-3.5 px-[22px] pb-5 pl-11">
          <p className="max-w-[70ch] text-foreground">{a.detail}</p>
          {a.precondition && (
            <div className="max-w-[70ch] rounded-lg bg-warning/10 px-3 py-[9px] text-[13px] text-warning">
              Precondition to verify: {a.precondition}
            </div>
          )}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-6 gap-y-3 text-[13px]">
            <Field label="Recommended action">
              <span className="text-foreground">{a.action}</span>
            </Field>
            <Field label="Blast radius">
              <span className="font-mono">{a.blast}</span>
            </Field>
            {a.target && (
              <Field label="Audit target">
                <span className="font-mono text-foreground">{a.target}</span>
              </Field>
            )}
            <Field label={a.origin === "audit" ? "Prevention · Type 1" : "Detection · Type 2"}>
              <span className="font-mono text-muted-foreground">
                tx {a.tx} · block {a.block}
                {a.cost ? ` · ${a.cost}` : ""}
              </span>
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {actionsFor(a).map(([label, kind]) =>
              confirm === label ? (
                <span key={label} className="inline-flex items-center gap-1.5 text-[13px]">
                  <span className="text-muted-foreground">{label}?</span>
                  <Button size="sm" onClick={() => setConfirm(null)}>Confirm</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
                </span>
              ) : (
                <Button
                  key={label}
                  size="sm"
                  variant={kind === "primary" ? "default" : kind === "outline" ? "outline" : "ghost"}
                  onClick={() => (OUTWARD.has(label) ? setConfirm(label) : undefined)}
                >
                  {label}
                </Button>
              ),
            )}
            <span className="flex-1" />
            <span className="inline-flex items-center gap-1.5 text-[12px] text-faint">
              <Shield className="size-3.5" /> Human-gated · Sentinel routes intent, it never acts on-chain
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function Lane({
  icon: Icon, name, blurb, warm, alerts,
}: {
  icon: typeof Shield
  name: string
  blurb: string
  warm?: boolean
  alerts: Alert[]
}) {
  return (
    <section className="mb-[34px]">
      <div className="flex items-center gap-2.5 px-[22px] pb-[11px]">
        <span
          className={cn(
            "inline-flex size-[26px] items-center justify-center rounded-md border border-border",
            warm ? "bg-primary-weak text-primary" : "bg-secondary text-muted-foreground",
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.5} />
        </span>
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-strong">{name}</h2>
        <span className="text-[12.5px] text-muted-foreground">{blurb}</span>
        <span className="flex-1" />
        <span className="font-mono text-[12px] text-faint tnum">{alerts.length}</span>
      </div>
      <div className="border-b border-border">
        {alerts.map((a) => (
          <AlertRow key={a.id} a={a} />
        ))}
      </div>
    </section>
  )
}

export default function AlertsPage() {
  const prevention = ALERTS.filter((a) => a.lane === "prevention")
  const detection = ALERTS.filter((a) => a.lane === "detection")
  const needAction = ALERTS.filter((a) => a.state === "open").length
  return (
    <div className="mx-auto max-w-[960px] pb-16 pt-7">
      <div className="flex items-end gap-3 px-[22px] pb-[22px]">
        <div>
          <h1 className="text-2xl font-semibold">Alerts</h1>
          <p className="mt-[5px] max-w-[64ch] text-[13.5px] text-muted-foreground">
            Every alert is reproduced or correlated to a proven finding, and human-gated.{" "}
            <b className="font-medium text-foreground">{needAction}</b> need a decision.
          </p>
        </div>
      </div>
      <Lane icon={Shield} name="Prevention" warm blurb="new code caught inside its timelock, audited before it executes" alerts={prevention} />
      <Lane icon={Radar} name="Detection" blurb="runtime behavior, already on-chain, triaged against what we know" alerts={detection} />
    </div>
  )
}
