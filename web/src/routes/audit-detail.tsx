import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/primitives"
import { RunMetrics, FindingList } from "@/components/audit"
import { CASE_BY_ID } from "@/lib/audit"

export default function AuditDetailPage() {
  const c = CASE_BY_ID.zest
  return (
    <div className="mx-auto max-w-[920px] pb-[70px] pt-7">
      <div className="px-6">
        <div className="mb-2.5 text-[12.5px] text-muted-foreground">
          Audits <span className="text-faint">/</span> {c.contract.name} <span className="text-faint">/</span>{" "}
          <span className="text-foreground">run {c.run.when}</span>
        </div>
        <div className="flex flex-wrap items-start gap-3.5">
          <div>
            <h1 className="flex items-center gap-2.5 text-[22px] font-semibold">
              Audit · {c.contract.name} <Chip tone="accent">{c.run.tier}</Chip>
            </h1>
            <div className="mt-2 text-[13px] text-muted-foreground">{c.summary}.</div>
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

        <div className="mt-5 mb-1">
          <RunMetrics run={c.run} />
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
        <FindingList findings={c.findings} />
      </div>
    </div>
  )
}
