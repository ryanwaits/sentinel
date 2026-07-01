import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import type { Severity } from "@/lib/mock"

const chip = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-[7px] py-0.5 font-mono text-[11px] font-medium leading-tight",
  {
    variants: {
      tone: {
        neutral: "border-border bg-secondary text-muted-foreground",
        accent: "border-transparent bg-primary-weak text-primary",
        success: "border-transparent bg-success-weak text-success",
        ghost: "border-border bg-transparent text-muted-foreground",
        critical: "border-transparent bg-destructive/12 text-destructive",
        warning: "border-transparent bg-warning/15 text-warning",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
)

export type ChipProps = React.ComponentProps<"span"> & VariantProps<typeof chip>

export function Chip({ tone, className, ...props }: ChipProps) {
  return <span className={cn(chip({ tone }), className)} {...props} />
}

const SEV: Record<Severity, { dot: string; ring: string }> = {
  critical: { dot: "bg-destructive", ring: "ring-destructive/20" },
  high: { dot: "bg-primary", ring: "ring-primary/20" },
  medium: { dot: "bg-warning", ring: "ring-warning/25" },
  info: { dot: "bg-muted-foreground", ring: "" },
}

export function SeverityDot({ severity, glow }: { severity: Severity; glow?: boolean }) {
  const s = SEV[severity]
  return <span className={cn("block size-[9px] rounded-full", s.dot, glow && s.ring && `ring-4 ${s.ring}`)} />
}

export function Dot({ className }: { className?: string }) {
  return <span className={cn("size-2 rounded-full", className)} />
}
