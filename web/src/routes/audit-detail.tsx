import { useState } from "react"
import { Check, X, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/primitives"
import { cn } from "@/lib/utils"

type Finding = {
  id: string
  sev: "critical" | "medium" | null
  cls: "bug" | "centralization"
  verdict: "confirmed" | "refuted"
  poc: "green" | "na"
  fn: string
  title: string
  desc: string
  blast?: string
  pocFile?: string
  asserts?: string
  term?: boolean
  waived?: boolean
  refutedBy?: string
}

const RUN = {
  contract: "v0-vault-sbtc",
  tier: "deep",
  when: "4d ago",
  model: "Opus 4.8",
  cost: "$2.21",
  duration: "8m 24s",
  turns: 47,
  subagents: 5,
  tokens: "1.24M",
} as const

const FINDINGS: Finding[] = [
  {
    id: "F1",
    sev: "critical",
    cls: "bug",
    verdict: "confirmed",
    poc: "green",
    fn: "socialize-debt",
    title: "socialize-debt forces unbounded LP loss",
    desc: "Any single authorized market can call socialize-debt with an unbounded scaled-amount. No cap, no precondition, no attested loss. It drives total-assets to zero, so LP redemption reverts ERR-OUTPUT-ZERO while the sBTC stays locked.",
    blast: "100% of LP redemption value",
    pocFile: "simnet/poc/finding-1.ts",
    asserts: "15 / 15",
    term: true,
  },
  {
    id: "F2",
    sev: "medium",
    cls: "centralization",
    verdict: "confirmed",
    poc: "na",
    fn: "system-borrow",
    waived: true,
    title: "Authorized markets can draw vault liquidity",
    desc: "system-borrow lets a trust-gated authorized contract move liquidity to an external receiver. This is a centralization / trust assumption, not a bug: it is bounded by the authorized-market allowlist and is by design. Labeled as such, and waived in the monitoring plan (surfaced once).",
    blast: "Bounded by the authorized-market allowlist",
  },
  {
    id: "F3",
    sev: null,
    cls: "bug",
    verdict: "refuted",
    poc: "na",
    fn: "redeem",
    title: "Possible reentrancy in redeem withdrawal",
    desc: "An auditor subagent flagged a possible reentrancy in redeem. The adversarial verifier refuted it: redeem debits shares before the sBTC transfer, and there is no external call back into the vault on this path. Dropped before it could ship.",
    refutedBy: "adversarial verifier",
  },
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-[3px] font-mono text-[10.5px] uppercase tracking-wider text-faint">{label}</div>
      <div>{children}</div>
    </div>
  )
}

function Metric({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex-1 px-[18px] py-3">
      <div className="font-mono text-[16px] font-medium text-ink-strong tnum">{value}</div>
      <div className="mt-0.5 text-[11.5px] text-muted-foreground">{label}</div>
    </div>
  )
}

function Terminal() {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-background font-mono text-[12.5px]">
      <div className="border-b border-border bg-secondary px-[13px] py-2 text-[11px] text-faint">
        run_simnet_poc · finding-1.ts · docker run --network none
      </div>
      <div className="px-[14px] py-[13px] leading-[1.75] text-foreground">
        <div className="text-ink-strong">
          <span className="text-faint">$</span> docker run --rm --network none audit-sentinel-simnet
        </div>
        <div className="text-faint">deploying v0-vault-sbtc + sbtc-token in simnet…</div>
        <div>
          call socialize-debt(scaled-amount: u50000000000) <span className="text-primary">← one authorized market</span>
        </div>
        <div>
          assert total-assets == u0 <span className="text-success">ok</span>
        </div>
        <div>
          assert redeem() reverts ERR-OUTPUT-ZERO <span className="text-success">ok</span>
        </div>
        <div>
          assert 50001000 sats sBTC locked <span className="text-success">ok</span>
        </div>
        <div className="mt-1.5 text-success">✓ FINDING 1 REPRODUCED: 15 assertions passed.</div>
      </div>
    </div>
  )
}

function FindingRow({ f, i }: { f: Finding; i: number }) {
  const [open, setOpen] = useState(i === 0)
  const refuted = f.verdict === "refuted"

  return (
    <div
      className={cn(
        "transition-colors",
        i > 0 && "border-t border-border",
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
            {f.sev && <Chip tone={f.sev === "critical" ? "critical" : "warning"}>{f.sev.toUpperCase()}</Chip>}
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
              <Field label="Blast radius">
                <span className="font-mono">{f.blast}</span>
              </Field>
              {f.pocFile && (
                <Field label="Reproduction">
                  <span className="font-mono text-foreground">{f.pocFile}</span>
                </Field>
              )}
            </div>
          )}
          {f.term && <Terminal />}
        </div>
      )}
    </div>
  )
}

export default function AuditDetailPage() {
  return (
    <div className="mx-auto max-w-[920px] pb-[70px] pt-7">
      <div className="px-6">
        <div className="mb-2.5 text-[12.5px] text-muted-foreground">
          Audits <span className="text-faint">/</span> {RUN.contract} <span className="text-faint">/</span>{" "}
          <span className="text-foreground">run {RUN.when}</span>
        </div>
        <div className="flex flex-wrap items-start gap-3.5">
          <div>
            <h1 className="flex items-center gap-2.5 text-[22px] font-semibold">
              Audit · {RUN.contract} <Chip tone="accent">{RUN.tier}</Chip>
            </h1>
            <div className="mt-2 text-[13px] text-muted-foreground">
              <b className="font-medium text-foreground">1 confirmed bug</b> (green PoC) ·{" "}
              <b className="font-medium text-foreground">1 centralization</b> (waived) ·{" "}
              <b className="font-medium text-foreground">1 refuted</b> and dropped
            </div>
          </div>
          <span className="flex-1" />
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              Export report
            </Button>
            <Button variant="outline" size="sm">
              Re-run
            </Button>
          </div>
        </div>

        <div className="mt-5 mb-1 flex overflow-hidden rounded-[11px] border border-border bg-secondary [&>*+*]:border-l [&>*+*]:border-border">
          <Metric value={RUN.cost} label="cost" />
          <Metric value={RUN.duration} label="wall time" />
          <Metric value={RUN.model} label="model" />
          <Metric value={RUN.turns} label="agent turns" />
          <Metric value={RUN.subagents} label="subagents" />
          <Metric value={RUN.tokens} label="tokens" />
        </div>
      </div>

      <div className="mx-6 mt-[22px] mb-[18px] flex items-start gap-2.5 rounded-[10px] bg-primary-weak px-3.5 py-3">
        <Check className="mt-px size-3.5 shrink-0 text-primary" />
        <p className="max-w-[80ch] text-[13px] text-foreground">
          Every finding is adversarially verified, and every real bug is reproduced in an airgapped sandbox before it
          ships. Refuted findings are shown, not hidden. <b className="font-medium">No green PoC, no ship.</b>
        </p>
      </div>

      <div className="mx-6">
        <div className="pb-2.5 pl-1 font-mono text-[11px] uppercase tracking-wider text-faint">Findings</div>
        <div className="overflow-hidden rounded-[11px] border border-border">
          {FINDINGS.map((f, i) => (
            <FindingRow key={f.id} f={f} i={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
