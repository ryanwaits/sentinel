import { Link } from "react-router"
import { Mail, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SentinelMark } from "@/components/sentinel-mark"
import { cn } from "@/lib/utils"

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.4-.2-2H12v3.8h5.9a5 5 0 01-2.2 3.3v2.7h3.6c2.1-2 3.2-4.9 3.2-7.8z" />
      <path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.7l-3.6-2.7c-1 .7-2.3 1.1-3.6 1.1-2.8 0-5.2-1.9-6-4.4H2.3v2.8A11 11 0 0012 23z" />
      <path fill="#FBBC05" d="M6 14.3a6.6 6.6 0 010-4.2V7.3H2.3a11 11 0 000 9.8L6 14.3z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3 .5 4.1 1.6l3.1-3.1A11 11 0 002.3 7.3L6 10.1c.8-2.5 3.2-4.4 6-4.4z" />
    </svg>
  )
}

function GithubMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.5 2 2 6.6 2 12.2c0 4.5 2.9 8.3 6.8 9.7.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.4-3.4-1.4-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 015 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10.2 10.2 0 0022 12.2C22 6.6 17.5 2 12 2z" />
    </svg>
  )
}

function SsoButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-[46px] w-full items-center justify-center gap-2.5 rounded-[10px]",
        "border border-border bg-secondary text-[14.5px] font-medium text-ink-strong",
        "transition-colors outline-none hover:bg-card focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      {children}
    </button>
  )
}

export default function SignInPage() {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      <aside className="hidden flex-col border-r border-border bg-secondary p-11 md:flex">
        <Link to="/" className="flex items-center gap-2.5 text-[17px] font-semibold text-ink-strong">
          <SentinelMark className="size-[22px] text-ink-strong" />
          Sentinel
        </Link>

        <div className="flex flex-1 flex-col justify-center gap-7">
          <h1 className="max-w-[16ch] text-[clamp(26px,2.6vw,36px)] font-semibold leading-[1.15] text-ink-strong">
            Catch the exploit at the audit. Then watch for it on-chain.
          </h1>

          <div className="rounded-xl border border-border bg-background px-5 py-[18px]">
            <div className="mb-2.5 font-mono text-[12px] text-faint">a real finding, reproduced</div>
            <p className="text-[14px] leading-[1.55] text-foreground">
              "One authorized contract could drive the Zest sBTC vault's total assets to zero.
              Sentinel found it, and proved it in an airgapped sandbox, 15 of 15 assertions green."
            </p>
          </div>
        </div>

        <p className="font-mono text-[12px] text-faint">
          Audit-informed security monitoring for Stacks. Powered by secondlayer.
        </p>
      </aside>

      <main className="flex items-center justify-center px-7 py-11">
        <div className="w-full max-w-[360px]">
          <h2 className="text-2xl font-semibold">Sign in to Sentinel</h2>
          <p className="mt-2 mb-[26px] text-[14px] text-muted-foreground">
            Watch your contracts the way an auditor would.
          </p>

          <div className="grid gap-2.5">
            <SsoButton>
              <GoogleMark />
              Continue with Google
            </SsoButton>
            <SsoButton>
              <GithubMark />
              Continue with GitHub
            </SsoButton>
          </div>

          <div className="my-5 flex items-center gap-3 text-[12.5px] text-faint">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <Input
              type="email"
              placeholder="you@protocol.xyz"
              className="h-[46px] rounded-[10px] border-border bg-secondary pl-9 text-[14.5px]"
            />
          </div>

          <Button className="mt-3 h-[46px] w-full rounded-[10px] text-[14.5px]">
            Continue with email
          </Button>

          <button
            type="button"
            className={cn(
              "mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-[10px]",
              "border border-dashed border-border bg-transparent text-[13.5px] text-muted-foreground",
              "transition-colors outline-none hover:border-primary hover:text-foreground",
              "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            )}
          >
            <Wallet className="size-[15px]" strokeWidth={1.5} />
            Connect a Stacks wallet
          </button>

          <p className="mt-6 text-center text-[13px] text-muted-foreground">
            New to Sentinel?{" "}
            <Link to="/onboarding" className="font-medium text-primary">
              Start monitoring
            </Link>
          </p>
          <p className="mt-[18px] text-center text-[12px] leading-normal text-faint">
            By continuing you agree to the terms and the coordinated-disclosure policy.
          </p>
        </div>
      </main>
    </div>
  )
}
