import { Link } from "react-router"
import { ShieldCheck, Radar, ArrowRight, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function Wrap({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1120px] px-7", className)}>{children}</div>
}

function ShieldMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 2l7 3v6c0 4.4-3 8-7 9-4-1-7-4.6-7-9V5l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Chip({ tone, children }: { tone: "critical" | "accent" | "success" | "neutral"; children: React.ReactNode }) {
  const tones = {
    critical: "bg-destructive/12 text-destructive",
    accent: "bg-primary-weak text-primary",
    success: "bg-success-weak text-success",
    neutral: "border border-border bg-secondary text-muted-foreground",
  } as const
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-[2px] font-mono text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  )
}

const PILLARS = [
  {
    icon: ShieldCheck,
    name: "Prevention",
    body:
      "A multi-agent audit reads your Clarity, argues with itself, and reproduces every confirmed exploit in an airgapped sandbox before you ship.",
    points: [
      "Specialist auditors per risk class, then an adversarial verifier that tries to refute each finding.",
      "Real bug vs centralization, labeled honestly. No inflated criticals.",
      "Every high-severity finding ships with a green, reproducible PoC.",
    ],
  },
  {
    icon: Radar,
    name: "Detection",
    body:
      "Continuous monitoring scoped by that audit. New code entering a timelock gets re-audited before it executes. Runtime behavior gets triaged against what we already found.",
    points: [
      "A cheap pre-filter drops benign events. Only notable ones spend.",
      "Runtime events correlated to your proven findings, and against a learned baseline.",
      "Alerts are human-gated. Sentinel routes intent, it never acts on-chain.",
    ],
  },
]

const STEPS = [
  { n: "01", h: "Audit", p: "Multi-agent engine finds and reproduces the bugs in your contracts.", audit: true },
  { n: "02", h: "Distill", p: "Findings become a knowledge base: sensitive functions, thresholds, signatures, waivers." },
  { n: "03", h: "Provision", p: "Chain subscriptions go live for exactly those functions and assets." },
  { n: "04", h: "Detect", p: "Runtime events are triaged against the findings and a learned baseline." },
  { n: "05", h: "Alert", p: "A human-gated WARN, reproduced or correlated, with the context to act." },
]

const NAV = [
  { label: "How it works", href: "#how" },
  { label: "Proof", href: "#proof" },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <Wrap className="flex h-16 items-center gap-7">
          <a href="#" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.01em] text-ink-strong">
            <ShieldMark className="size-[21px] text-primary" />
            Sentinel
          </a>
          <nav className="ml-2 hidden gap-6 md:flex">
            {NAV.map((n) => (
              <a key={n.label} href={n.href} className="text-[14.5px] font-normal text-muted-foreground transition-colors hover:text-ink-strong">
                {n.label}
              </a>
            ))}
            <Link to="/pricing" className="text-[14.5px] font-normal text-muted-foreground transition-colors hover:text-ink-strong">
              Pricing
            </Link>
            <a href="#" className="text-[14.5px] font-normal text-muted-foreground transition-colors hover:text-ink-strong">
              Docs
            </a>
          </nav>
          <span className="flex-1" />
          <a href="#" className="hidden text-[14.5px] text-muted-foreground transition-colors hover:text-ink-strong md:inline">
            Log in
          </a>
          <Button size="sm" render={<Link to="/onboarding" />}>
            Get a demo
          </Button>
        </Wrap>
      </header>

      <main>
        {/* HERO */}
        <section className="pb-[clamp(48px,6vw,80px)] pt-[clamp(60px,9vw,120px)]">
          <Wrap>
            <p className="font-mono text-[12.5px] font-medium tracking-[0.02em] text-muted-foreground">
              Audit-informed security monitoring · Stacks
            </p>
            <h1 className="mt-5 max-w-[15ch] text-[clamp(40px,6.4vw,74px)] font-semibold leading-[1.05] tracking-[-0.02em] text-ink-strong">
              Catch the exploit at the audit.
              <br />
              Then <span className="text-primary">watch for it on-chain.</span>
            </h1>
            <p className="mt-6 max-w-[56ch] text-[clamp(17px,1.7vw,20px)] leading-[1.5] text-muted-foreground">
              Sentinel audits your Stacks contracts with a multi-agent engine, reproduces the exploit in a sandbox, then
              monitors production for those exact findings. Prevention and detection, from one system. Every alert is
              human-gated.
            </p>
            <div className="mt-[34px] flex flex-wrap items-center gap-3">
              <Button size="lg" render={<Link to="/onboarding" />}>
                Get a demo <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="outline" render={<a href="#how" />}>
                See how it works
              </Button>
              <span className="ml-1.5 font-mono text-[13px] text-faint">
                Reproduced a live vault bug.{" "}
                <a href="#proof" className="font-medium text-primary">
                  See the finding
                </a>
              </span>
            </div>

            {/* PRODUCT PEEK */}
            <div className="mt-[clamp(46px,6vw,74px)] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_oklch(0.2_0.02_55/0.04),0_12px_32px_-10px_oklch(0.2_0.02_55/0.14)]">
              <div className="flex items-center gap-2 border-b border-border bg-secondary px-4 py-[11px]">
                <span className="size-[9px] rounded-full bg-destructive" />
                <span className="size-[9px] rounded-full bg-primary" />
                <span className="size-[9px] rounded-full bg-faint" />
                <span className="ml-2 font-mono text-[12px] text-muted-foreground">sentinel · alerts</span>
                <span className="flex-1" />
                <span className="font-mono text-[11.5px] text-faint">watching 3 contracts · 9 functions</span>
              </div>
              <div className="py-1.5">
                <div className="flex gap-3 border-b border-border px-5 py-[15px]">
                  <span className="mt-[5px] size-[9px] shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <b className="font-medium text-ink-strong">Incoming proposal would drain the treasury</b>
                      <span className="font-mono text-[12px] text-muted-foreground">ccd002-treasury · execute</span>
                    </div>
                    <div className="mt-[9px] flex flex-wrap items-center gap-1.5">
                      <Chip tone="critical">CRITICAL</Chip>
                      <Chip tone="neutral">● bug</Chip>
                      <Chip tone="success">
                        <Check className="size-3" /> PoC green
                      </Chip>
                      <span className="flex-1" />
                      <span className="font-mono text-[12px] font-medium text-primary tnum">veto: 6 blocks left · ≈58 min</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 px-5 py-[15px]">
                  <span className="mt-[5px] size-[9px] shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <b className="font-medium text-ink-strong">Possible exploitation: socialize-debt unbounded LP loss</b>
                      <span className="font-mono text-[12px] text-muted-foreground">v0-vault-sbtc</span>
                    </div>
                    <div className="mt-[9px] flex flex-wrap items-center gap-1.5">
                      <Chip tone="accent">HIGH</Chip>
                      <Chip tone="accent">correlation</Chip>
                      <Chip tone="success">
                        <Check className="size-3" /> PoC green
                      </Chip>
                      <Chip tone="neutral">conf 0.60</Chip>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Wrap>
        </section>

        {/* PILLARS */}
        <section id="how" className="py-[clamp(64px,8vw,110px)]">
          <Wrap>
            <p className="font-mono text-[12.5px] font-medium tracking-[0.04em] text-primary">Prevention + Detection</p>
            <h2 className="mt-4 max-w-[20ch] text-[clamp(30px,4vw,46px)] font-semibold leading-[1.05] tracking-[-0.02em] text-ink-strong">
              Two motions. One system. The same understanding of your code.
            </h2>
            <p className="mt-[18px] max-w-[58ch] text-[clamp(16px,1.5vw,18px)] leading-[1.55] text-muted-foreground">
              Most tools watch for big numbers moving. Sentinel watches for the specific bugs an audit proved are possible,
              because the same engine does both.
            </p>
            <div className="mt-[52px] grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2">
              {PILLARS.map((p) => (
                <div key={p.name} className="bg-background p-[clamp(28px,3vw,40px)]">
                  <h3 className="flex items-center gap-2.5 text-[22px] font-semibold tracking-[-0.012em] text-ink-strong">
                    <p.icon className="size-[19px] text-primary" strokeWidth={1.5} />
                    {p.name}
                  </h3>
                  <p className="mt-3.5 text-[15.5px] leading-[1.55] text-muted-foreground">{p.body}</p>
                  <ul className="mt-5 grid gap-[11px]">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex gap-2.5 text-[14.5px] text-foreground">
                        <span className="mt-[3px] shrink-0 text-primary">→</span>
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Wrap>
        </section>

        {/* MOAT / LIFECYCLE */}
        <section className="pb-[clamp(64px,8vw,110px)]">
          <Wrap>
            <p className="font-mono text-[12.5px] font-medium tracking-[0.04em] text-primary">The moat</p>
            <h2 className="mt-4 max-w-[20ch] text-[clamp(30px,4vw,46px)] font-semibold leading-[1.05] tracking-[-0.02em] text-ink-strong">
              Your audit generates the monitoring.
            </h2>
            <p className="mt-[18px] max-w-[58ch] text-[clamp(16px,1.5vw,18px)] leading-[1.55] text-muted-foreground">
              The audit does not evaporate into a PDF. It distills into the exact scope Sentinel watches: which functions
              are sensitive, what a normal outflow looks like, and which proven bugs to watch for being exploited.
            </p>
            <div className="mt-[52px] grid overflow-hidden rounded-2xl border border-border md:grid-cols-5">
              {STEPS.map((s) => (
                <div
                  key={s.n}
                  className={cn(
                    "border-t border-border p-[22px] first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0",
                    s.audit ? "bg-primary-weak" : "bg-background",
                  )}
                >
                  <div className="font-mono text-[12px] text-faint">{s.n}</div>
                  <h4 className="mb-1.5 mt-2.5 text-[16px] font-semibold tracking-[-0.01em] text-ink-strong">{s.h}</h4>
                  <p className="text-[13.5px] leading-[1.5] text-muted-foreground">{s.p}</p>
                </div>
              ))}
            </div>
          </Wrap>
        </section>

        {/* PROOF */}
        <section id="proof" className="border-y border-border bg-card py-[clamp(64px,8vw,110px)]">
          <Wrap className="grid items-center gap-[clamp(32px,5vw,64px)] lg:grid-cols-[1.05fr_1fr]">
            <div>
              <p className="font-mono text-[12.5px] font-medium tracking-[0.04em] text-primary">A real finding</p>
              <h2 className="mt-4 text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.05] tracking-[-0.02em] text-ink-strong">
                We reproduced an unbounded loss in a live sBTC vault.
              </h2>
              <p className="mt-[18px] max-w-[58ch] text-[clamp(16px,1.5vw,18px)] leading-[1.55] text-muted-foreground">
                In the Zest <span className="font-mono text-[15px]">v0-vault-sbtc</span>, a single authorized contract could
                call <span className="font-mono text-[15px]">socialize-debt</span> with no cap and drive total assets to
                zero, while the sBTC stayed locked and redemption reverted. We proved it in an airgapped Clarity VM, no
                mainnet, no network.
              </p>
              <div className="mt-[26px] flex items-center gap-2.5">
                <Chip tone="success">
                  <Check className="size-3" /> 15 / 15 assertions
                </Chip>
                <span className="font-mono text-[12.5px] text-muted-foreground">airgapped · deny-all egress</span>
              </div>
            </div>

            {/* TERMINAL */}
            <div className="overflow-hidden rounded-xl border border-border bg-secondary font-mono text-[13px] shadow-[0_1px_2px_oklch(0.2_0.02_55/0.04),0_12px_32px_-10px_oklch(0.2_0.02_55/0.14)]">
              <div className="border-b border-border bg-card px-3.5 py-[9px] text-[11.5px] text-faint">
                run_simnet_poc · finding-1.ts · --network none
              </div>
              <div className="px-4 pb-[18px] pt-4 leading-[1.7]">
                <div>
                  <span className="text-faint">$</span> <span className="text-ink-strong">docker run --rm --network none audit-sentinel-simnet</span>
                </div>
                <div className="text-faint">deploying v0-vault-sbtc + sbtc-token in simnet…</div>
                <div className="text-ink-strong">
                  call socialize-debt(scaled-amount: u50000000000) <span className="text-primary">← one authorized market</span>
                </div>
                <div className="text-ink-strong">
                  assert total-assets == u0 <span className="text-success">ok</span>
                </div>
                <div className="text-ink-strong">
                  assert redeem() reverts ERR-OUTPUT-ZERO <span className="text-success">ok</span>
                </div>
                <div className="text-ink-strong">
                  assert 50001000 sats sBTC locked <span className="text-success">ok</span>
                </div>
                <div className="mt-2 text-success">✓ FINDING 1 REPRODUCED: 15 assertions passed.</div>
                <div className="text-faint">100% of LP redemption value destroyed by a single call.</div>
              </div>
            </div>
          </Wrap>
        </section>

        {/* CTA */}
        <section className="py-[clamp(64px,8vw,110px)] text-center">
          <Wrap>
            <h2 className="mx-auto max-w-[18ch] text-[clamp(30px,4vw,48px)] font-semibold leading-[1.05] tracking-[-0.02em] text-ink-strong">
              Audit once. Watch continuously.
            </h2>
            <p className="mx-auto mt-[18px] max-w-[58ch] text-[clamp(16px,1.5vw,18px)] leading-[1.55] text-muted-foreground">
              A full sweep runs in minutes for the price of a coffee. Monitoring is scoped by what it finds.
            </p>
            <div className="mt-[30px] flex flex-wrap justify-center gap-3">
              <Button size="lg" render={<Link to="/onboarding" />}>
                Get a demo <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="outline" render={<a href="#" />}>
                Read the docs
              </Button>
            </div>
          </Wrap>
        </section>
      </main>

      <footer className="border-t border-border py-10 text-[13.5px] text-muted-foreground">
        <Wrap className="flex flex-wrap items-center justify-between gap-5">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-ink-strong">
            <ShieldMark className="size-[18px] text-primary" />
            Sentinel
          </span>
          <span>Audit-informed security monitoring for Stacks. Powered by secondlayer.</span>
          <span className="font-mono text-faint">© 2026</span>
        </Wrap>
      </footer>
    </div>
  )
}
