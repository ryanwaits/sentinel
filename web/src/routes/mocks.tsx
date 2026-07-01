import { Link } from "react-router-dom"
import { ShieldCheck, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

type Item = { to: string; title: string; desc: string }
type Group = { label: string; register: "brand" | "product"; items: Item[] }

const GROUPS: Group[] = [
  {
    label: "Marketing",
    register: "brand",
    items: [
      { to: "/", title: "Landing", desc: "The pitch: Prevention + Detection, the moat, a real-finding proof, CTA." },
      { to: "/pricing", title: "Pricing", desc: "Audit / Monitor / Enterprise tiers, priced like software not an audit firm." },
    ],
  },
  {
    label: "Onboarding",
    register: "product",
    items: [
      { to: "/sign-in", title: "Sign in", desc: "SSO, email, or connect a Stacks wallet. Split brand panel." },
      { to: "/onboarding", title: "First-run", desc: "Add, audit, review the Monitoring Plan, go live. Walkable wizard." },
    ],
  },
  {
    label: "Platform",
    register: "product",
    items: [
      { to: "/contracts", title: "Contracts", desc: "The watched set: status, coverage, alerts, spend. The app home." },
      { to: "/monitoring-plan", title: "Monitoring Plan", desc: "The moat: the KB made tunable. Audit suggests, you promote to live." },
      { to: "/alerts", title: "Alerts", desc: "Prevention + Detection lanes, human-gated actions." },
      { to: "/audits", title: "Audit detail", desc: "Findings (bug vs centralization), the green PoC, run metrics." },
      { to: "/settings", title: "Settings", desc: "Notification routes, spend ceiling, team, API + webhook secrets." },
    ],
  },
]

export default function MocksPage() {
  return (
    <div className="mx-auto max-w-[1000px] px-7 pb-20 pt-14">
      <div className="flex items-center gap-2.5 text-lg font-semibold text-ink-strong">
        <ShieldCheck className="size-6 text-primary" strokeWidth={1.6} />
        Sentinel
      </div>
      <h1 className="mt-[22px] text-3xl font-semibold tracking-tight">Screens</h1>
      <p className="mt-2.5 max-w-[64ch] text-muted-foreground">
        The MVP surface in the real stack (Vite, React, Tailwind v4, shadcn/ui). One design system, Warp
        tokens, light and dark via prefers-color-scheme. Click any screen.
      </p>

      {GROUPS.map((g) => (
        <section key={g.label} className="mt-10">
          <div className="mb-4 flex items-center gap-2.5">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-strong">{g.label}</h2>
            <span
              className={cn(
                "rounded border px-[7px] py-0.5 font-mono text-[10.5px] font-medium",
                g.register === "brand"
                  ? "border-transparent bg-primary-weak text-primary"
                  : "border-border bg-secondary text-faint",
              )}
            >
              {g.register} register
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
            {g.items.map((it) => (
              <Link
                key={it.to}
                to={it.to}
                className="block rounded-xl border border-border bg-card px-5 py-[18px] transition-colors hover:border-primary hover:bg-secondary"
              >
                <div className="flex items-center gap-2.5">
                  <h3 className="text-[16px] font-medium tracking-tight text-ink-strong">{it.title}</h3>
                  <ArrowRight className="ml-auto size-4 text-faint" strokeWidth={1.6} />
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{it.desc}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
