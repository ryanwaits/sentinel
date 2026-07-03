import { useState } from "react"
import { Check, X, ChevronRight, Loader2, Shield, Radar } from "lucide-react"
import { Chip } from "@/components/primitives"
import { cn } from "@/lib/utils"
import { AUDIT_PHASES, type Finding, type AuditRun, type ScopeItem } from "@/lib/audit"

/* ---------- audit pipeline (running) ---------- */
export function AuditPhases({ activeStep }: { activeStep: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {AUDIT_PHASES.map((label, i) => {
        const status = i < activeStep ? "done" : i === activeStep ? "running" : "pending"
        return (
          <div
            key={label}
            className={cn("flex items-center gap-3 bg-background px-4 py-[13px]", i > 0 && "border-t border-border")}
          >
            <span className="inline-flex w-5 justify-center">
              {status === "done" ? (
                <Check className="size-[15px] text-success" strokeWidth={2.4} />
              ) : status === "running" ? (
                <Loader2 className="size-[15px] animate-spin text-primary" />
              ) : (
                <span className="size-2 rounded-full bg-border" />
              )}
            </span>
            <span className={cn("text-[13.5px]", status === "pending" ? "text-faint" : "text-foreground")}>{label}</span>
            <span className="flex-1" />
            {status === "running" && <span className="text-[12px] text-primary">running…</span>}
          </div>
        )
      })}
    </div>
  )
}

/* ---------- airgapped PoC terminal ---------- */
function PocLine({ text }: { text: string }) {
  if (text.startsWith("$")) {
    return (
      <div className="text-ink-strong">
        <span className="text-faint">$</span>
        {text.slice(1)}
      </div>
    )
  }
  if (text.startsWith("✓")) return <div className="text-success">{text}</div>
  if (/…$/.test(text)) return <div className="text-faint">{text}</div>
  const ok = text.match(/^(.*?)(\s+ok)$/)
  if (ok) {
    return (
      <div>
        {ok[1]}
        <span className="text-success"> ok</span>
      </div>
    )
  }
  const arrow = text.indexOf("←")
  if (arrow >= 0) {
    return (
      <div>
        {text.slice(0, arrow)}
        <span className="text-primary">{text.slice(arrow)}</span>
      </div>
    )
  }
  return <div>{text}</div>
}

export function PocTerminal({ finding }: { finding: Finding }) {
  if (!finding.pocLines) return null
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-background font-mono text-[12.5px]">
      <div className="border-b border-border bg-secondary px-[13px] py-2 text-[11px] text-faint">
        {finding.pocHeader}
      </div>
      <div className="px-[14px] py-[13px] leading-[1.75] text-foreground">
        {finding.pocLines.map((l, i) => (
          <PocLine key={i} text={l} />
        ))}
      </div>
    </div>
  )
}

/* ---------- findings (the audit result) ---------- */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-[3px] font-mono text-[10.5px] uppercase tracking-wider text-faint">{label}</div>
      <div>{children}</div>
    </div>
  )
}

export function FindingRow({ finding: f, index }: { finding: Finding; index: number }) {
  const [open, setOpen] = useState(index === 0)
  const refuted = f.verdict === "refuted"
  const sevTone = f.severity === "critical" ? "critical" : f.severity === "high" ? "accent" : "warning"

  return (
    <div
      className={cn(
        "transition-colors",
        index > 0 && "border-t border-border",
        open ? "bg-secondary" : "hover:bg-secondary",
        refuted && "opacity-[0.66]",
      )}
    >
      <button className="flex w-full items-start gap-[13px] px-5 py-[15px] text-left" onClick={() => setOpen((o) => !o)}>
        <span className="w-5 pt-0.5 font-mono text-[12px] text-faint">{f.id}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-[9px] gap-y-1">
            <span className={cn("text-[14.5px] font-medium text-ink-strong", refuted && "line-through decoration-faint")}>
              {f.title}
            </span>
            <span className="font-mono text-[12px] text-muted-foreground">fn {f.fn}</span>
          </div>
          <div className="mt-[9px] flex flex-wrap items-center gap-[7px]">
            {f.severity && <Chip tone={sevTone}>{f.severity.toUpperCase()}</Chip>}
            <Chip tone={f.cls === "bug" ? "neutral" : "ghost"}>{f.cls === "bug" ? "● bug" : "◐ centralization"}</Chip>
            {f.verdict === "confirmed" && <Chip tone="neutral">confirmed</Chip>}
            {refuted && (
              <Chip tone="ghost">
                <X className="size-3" /> refuted
              </Chip>
            )}
            {f.poc === "green" && (
              <Chip tone="success">
                <Check className="size-3" /> PoC green · {f.asserts}
              </Chip>
            )}
            {f.waived && <Chip tone="ghost">waived</Chip>}
            <span className="flex-1" />
            <ChevronRight className={cn("size-[15px] text-faint transition-transform", open && "rotate-90")} />
          </div>
        </div>
      </button>

      {open && (
        <div className="grid gap-[15px] px-5 pb-5 pl-[53px]">
          <p className="max-w-[72ch] text-foreground">{f.desc}</p>
          {refuted ? (
            <div className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
              <Chip tone="ghost">
                <X className="size-3" /> refuted by the {f.refutedBy}
              </Chip>
              not shipped, no PoC required
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-[30px] gap-y-3 text-[13px]">
              <Field label="Class">
                <span className="text-foreground">{f.cls === "bug" ? "Real bug" : "Centralization / trust"}</span>
              </Field>
              {f.blast && (
                <Field label="Blast radius">
                  <span className="font-mono">{f.blast}</span>
                </Field>
              )}
              {f.pocFile && (
                <Field label="Reproduction">
                  <span className="font-mono text-foreground">{f.pocFile}</span>
                </Field>
              )}
            </div>
          )}
          {f.poc === "green" && <PocTerminal finding={f} />}
        </div>
      )}
    </div>
  )
}

export function FindingList({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return (
      <div className="rounded-[11px] border border-border bg-secondary px-5 py-6 text-[13.5px] text-muted-foreground">
        No exploitable finding. Sentinel would rather say clean than inflate one.
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-[11px] border border-border">
      {findings.map((f, i) => (
        <FindingRow key={f.id} finding={f} index={i} />
      ))}
    </div>
  )
}

/* ---------- run metrics ---------- */
export function RunMetrics({ run }: { run: AuditRun }) {
  const items: [React.ReactNode, string][] = [
    [run.cost, "cost"],
    [run.duration, "wall time"],
    [run.model, "model"],
    [run.turns, "agent turns"],
    [run.subagents, "subagents"],
    [run.tokens, "tokens"],
  ]
  return (
    <div className="overflow-x-auto rounded-[11px] border border-border bg-secondary">
      <div className="flex min-w-full [&>*+*]:border-l [&>*+*]:border-border">
        {items.map(([value, label]) => (
          <div key={label} className="min-w-[84px] flex-1 px-[18px] py-3">
            <div className="font-mono text-[16px] font-medium text-ink-strong tnum">{value}</div>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- monitoring scope (what it would watch) ---------- */
export function MonitoringScope({ scope, contract }: { scope: ScopeItem[]; contract?: string }) {
  return (
    <div>
      {contract && (
        <p className="max-w-[46ch] text-[13.5px] leading-relaxed text-muted-foreground">
          The audit becomes the monitoring. This is exactly what Sentinel would watch on{" "}
          <span className="font-mono text-foreground">{contract}</span>, nothing generic.
        </p>
      )}
      <div className={cn("rounded-lg border border-border bg-card px-4 py-1", contract && "mt-3.5")}>
        {scope.map((s) => (
          <div key={s.fn} className="flex items-start gap-3 border-t border-border py-2.5 first:border-t-0">
            <span className="mt-0.5">
              {s.kind === "prevention" ? (
                <Shield className="size-3.5 text-primary" strokeWidth={1.6} />
              ) : (
                <Radar className="size-3.5 text-muted-foreground" strokeWidth={1.6} />
              )}
            </span>
            <div>
              <div className="font-mono text-[12.5px] text-ink-strong">{s.fn}</div>
              <div className="text-[12.5px] text-muted-foreground">{s.rule}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
