import { useEffect, useRef, useState } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import { ArrowLeft, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SentinelMark } from "@/components/sentinel-mark"
import { EASE, DUR } from "@/lib/motion"
import { cn } from "@/lib/utils"

type NavKey = "log" | "pricing" | "signin" | null

const NAV: { key: Exclude<NavKey, null>; to: string; label: string }[] = [
  { key: "log", to: "/log", label: "Findings log" },
  { key: "pricing", to: "/pricing", label: "Pricing" },
  { key: "signin", to: "/sign-in", label: "Sign in" },
]

const ACTIVE_BY_PATH: Record<string, Exclude<NavKey, null>> = {
  "/log": "log",
  "/pricing": "pricing",
  "/sign-in": "signin",
}

/**
 * "Get early access" — one persistent form, button pinned right. Clicking it while
 * collapsed only expands (type="button"); once expanded it becomes the submit button.
 * The input's width/opacity animate in via inline style (mirrors secondlayer.tools'
 * auth-bar pattern) rather than swapping DOM nodes, so the reveal is a smooth widen,
 * not a layout snap.
 */
function EarlyAccessCta() {
  const [expanded, setExpanded] = useState(false)
  const [email, setEmail] = useState("")
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (expanded) inputRef.current?.focus()
  }, [expanded])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!expanded) {
      setExpanded(true)
      return
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return
    setDone(true)
  }

  if (done) {
    return (
      <span className="flex items-center gap-1.5 text-[13px] font-medium text-success">
        <Check className="size-4" strokeWidth={2.4} /> Check your email
      </span>
    )
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        "flex items-center rounded-lg border border-transparent p-[3px] transition-[background-color,border-color,padding] duration-300",
        expanded && "border-border bg-card pl-3",
      )}
    >
      <label htmlFor="nav-email" className="sr-only">
        Work email
      </label>
      <input
        id="nav-email"
        ref={inputRef}
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@protocol.xyz"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onBlur={() => !email && setExpanded(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setExpanded(false)
            setEmail("")
          }
        }}
        tabIndex={expanded ? 0 : -1}
        style={{
          width: expanded ? 168 : 0,
          marginRight: expanded ? 8 : 0,
          opacity: expanded ? 1 : 0,
          transition: expanded
            ? `width ${DUR}ms ${EASE}, margin ${DUR}ms ${EASE}, opacity 150ms ease 80ms`
            : `width ${DUR}ms ${EASE}, margin ${DUR}ms ${EASE}, opacity 100ms ease`,
        }}
        className="border-none bg-transparent font-mono text-[13px] text-foreground outline-none placeholder:text-faint"
      />
      <Button
        type={expanded ? "submit" : "button"}
        size="sm"
        className="shrink-0"
        onClick={() => !expanded && setExpanded(true)}
      >
        Get early access
      </Button>
    </form>
  )
}

/**
 * The one nav header for every marketing page. Active link and the CTA are never
 * per-page choices — active is derived from the route, the CTA is always
 * EarlyAccessCta — so no page can drift from any other. `back` is the sole
 * intentional exception, for hard-nav detail pages (e.g. /log/:id) that replace
 * the nav with a single "back to X" link instead.
 */
export function SiteHeader({
  maxWidth = "1280px",
  back,
}: {
  maxWidth?: string
  back?: { label: string; to: string }
}) {
  const location = useLocation()
  const active = ACTIVE_BY_PATH[location.pathname] ?? null

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 items-center gap-3 px-6" style={{ maxWidth }}>
        <Link to="/" className="flex items-center gap-2 font-semibold text-ink-strong">
          <SentinelMark className="size-[21px] text-ink-strong" />
          Sentinel
        </Link>
        <span className="flex-1" />
        {back ? (
          <Link
            to={back.to}
            className="flex items-center gap-1.5 text-[14px] text-muted-foreground transition-colors hover:text-ink-strong"
          >
            <ArrowLeft className="size-4" /> {back.label}
          </Link>
        ) : (
          <>
            <nav className="hidden items-center gap-5 sm:flex">
              {NAV.map((n) => (
                <Link
                  key={n.key}
                  to={n.to}
                  className={cn(
                    "text-[14px] transition-colors hover:text-ink-strong",
                    active === n.key ? "text-ink-strong" : "text-muted-foreground",
                  )}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <EarlyAccessCta />
          </>
        )}
      </div>
    </header>
  )
}

/** Wraps every top-level marketing page (home, pricing, log index, sign-in, onboarding) in the identical header + footer — rendered once, so it can't drift per page. Hard-nav detail pages (e.g. /log/:id) render SiteHeader with `back` directly instead, outside this layout. */
export function MarketingLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <Outlet />
      <SiteFooter />
    </div>
  )
}

/** secondlayer's own logomark (their real SVG) — colored with their brand blue, not ours; pure attribution. */
function SecondlayerMark({ className }: { className?: string }) {
  return (
    <svg viewBox="4 7 40 28" width="17" height="12" fill="none" aria-hidden="true" className={className}>
      <polygon points="8,25 28,17 42,25 22,33" fill="var(--secondlayer-blue)" opacity={0.24} />
      <polygon points="8,19 28,11 42,19 22,27" fill="var(--secondlayer-blue)" />
    </svg>
  )
}

export function SiteFooter({ maxWidth = "1280px" }: { maxWidth?: string }) {
  return (
    <footer className="border-t border-border py-5 text-[12.5px] text-muted-foreground">
      <div className="mx-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 px-6" style={{ maxWidth }}>
        <span className="flex items-center gap-1.5 font-medium text-ink-strong">
          <SentinelMark className="size-[14px] text-ink-strong" />
          Sentinel
        </span>
        <span className="font-mono text-faint">© 2026</span>
        <span className="text-faint">·</span>
        <span>Audit-informed security monitoring for Stacks.</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-faint">Powered by</span>
          <SecondlayerMark />
          <span className="font-medium text-ink-strong">secondlayer</span>
        </span>
      </div>
    </footer>
  )
}
