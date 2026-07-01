import { Link } from "react-router"
import { Check, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Tier = {
  name: string
  blurb: string
  price: string
  unit?: string
  note: string
  features: string[]
  cta: string
  reco?: boolean
}

const TIERS: Tier[] = [
  {
    name: "Audit",
    blurb: "On-demand, pre-launch or on-upgrade.",
    price: "$5",
    unit: " / deep sweep",
    note: "$0.40 for a fast Monitor-tier sweep.",
    features: [
      "Multi-agent deep audit, model-tiered",
      "Adversarial verification of every finding",
      "Exploit reproduced in an airgapped sandbox",
      "Honest bug vs centralization report",
      "Findings + PoCs exported",
    ],
    cta: "Run an audit",
  },
  {
    name: "Monitor",
    blurb: "Continuous, audit-informed monitoring.",
    price: "$500",
    unit: " / contract / mo",
    note: "Includes re-audits on every upgrade.",
    features: [
      "Everything in Audit, on every code change",
      "Detection scoped by your findings, not generic rules",
      "Prevention: proposals audited inside the timelock",
      "Learned outflow baselines from on-chain history",
      "Human-gated alerts to Slack, PagerDuty, webhook",
    ],
    cta: "Start monitoring",
    reco: true,
  },
  {
    name: "Enterprise",
    blurb: "Multiple protocols, dedicated workflow.",
    price: "Custom",
    note: "Volume pricing across your whole surface.",
    features: [
      "Unlimited contracts and audits",
      "Dedicated coordinated-disclosure workflow",
      "SSO / SAML, roles, audit log",
      "On-call escalation and response SLAs",
      "A named security engineer",
    ],
    cta: "Talk to us",
  },
]

const NAV = [
  { label: "How it works", active: false },
  { label: "Proof", active: false },
  { label: "Pricing", active: true },
  { label: "Docs", active: false },
]

function TierCard({ tier }: { tier: Tier }) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border p-7",
        tier.reco
          ? "border-primary bg-background shadow-lg shadow-primary/5"
          : "border-border bg-card",
      )}
    >
      {tier.reco && (
        <span className="absolute -top-3 left-7 rounded-md bg-primary px-2.5 py-[3px] font-mono text-[11px] font-medium tracking-wide text-primary-foreground">
          Recommended
        </span>
      )}
      <h3 className="text-[19px] font-semibold">{tier.name}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{tier.blurb}</p>
      <div className="mb-1 mt-4">
        <span className="text-[38px] font-semibold tracking-tight text-ink-strong tnum">
          {tier.price}
        </span>
        {tier.unit && <span className="text-[15px] text-muted-foreground">{tier.unit}</span>}
      </div>
      <p className="m-0 text-[13px] text-faint">{tier.note}</p>
      <ul className="my-6 grid flex-1 gap-3">
        {tier.features.map((f) => (
          <li key={f} className="flex gap-2.5 text-[14.5px] leading-snug text-foreground">
            <Check className="mt-[3px] size-[15px] shrink-0 text-success" strokeWidth={2.25} />
            {f}
          </li>
        ))}
      </ul>
      <Button
        variant={tier.reco ? "default" : "outline"}
        size="lg"
        className="w-full"
        render={<Link to="/onboarding" />}
      >
        {tier.cta}
      </Button>
    </div>
  )
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-6 px-7">
          <a href="#" className="flex items-center gap-2.5 text-[17px] font-semibold text-ink-strong">
            <ShieldCheck className="size-5 text-primary" strokeWidth={1.6} />
            Sentinel
          </a>
          <nav className="ml-2 hidden items-center gap-6 md:flex">
            {NAV.map((n) => (
              <a
                key={n.label}
                href="#"
                className={cn(
                  "text-[14.5px] transition-colors hover:text-ink-strong",
                  n.active ? "text-ink-strong" : "text-muted-foreground",
                )}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <span className="flex-1" />
          <a href="#" className="hidden text-[14.5px] text-muted-foreground hover:text-ink-strong md:inline">
            Log in
          </a>
          <Button size="lg" render={<Link to="/onboarding" />}>
            Get a demo
          </Button>
        </div>
      </header>

      <main>
        <section className="pt-[clamp(56px,8vw,100px)]">
          <div className="mx-auto max-w-[1120px] px-7 text-center">
            <p className="font-mono text-[12.5px] font-medium tracking-wide text-primary">Pricing</p>
            <h1 className="mx-auto mt-4 max-w-[16ch] text-[clamp(34px,5vw,56px)] font-semibold leading-[1.08]">
              Priced like software, not like an audit firm.
            </h1>
            <p className="mx-auto mt-5 max-w-[56ch] text-[clamp(16px,1.6vw,19px)] text-muted-foreground">
              A full deep sweep costs us about two dollars in compute, and we don't mark that up a
              thousand times. Audit on demand. Pay monthly to keep watching.
            </p>
          </div>

          <div className="mx-auto max-w-[1120px] px-7">
            <div className="mt-[52px] grid items-start gap-[18px] md:grid-cols-3">
              {TIERS.map((tier) => (
                <TierCard key={tier.name} tier={tier} />
              ))}
            </div>

            <div className="mt-[44px] flex flex-wrap items-center gap-4 rounded-xl border border-border bg-secondary px-6 py-[22px]">
              <ShieldCheck className="size-5 text-primary" strokeWidth={1.5} />
              <p className="m-0 min-w-[280px] flex-1 text-[14.5px] text-foreground">
                Every plan is human-gated and coordinated-disclosure first. Sentinel never runs an
                exploit against mainnet, and never discloses before a fix. That stance is not an
                upsell, it is how the product works.
              </p>
              <Button variant="outline" size="lg" render={<Link to="/onboarding" />}>
                Read our disclosure policy
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-20 border-t border-border py-10 text-[13.5px] text-muted-foreground">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-5 px-7">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-ink-strong">
            <ShieldCheck className="size-[18px] text-primary" strokeWidth={1.6} />
            Sentinel
          </span>
          <span>Audit-informed security monitoring for Stacks. Powered by secondlayer.</span>
          <span className="font-mono text-faint tnum">© 2026</span>
        </div>
      </footer>
    </div>
  )
}
