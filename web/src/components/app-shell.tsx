import { NavLink, Outlet } from "react-router-dom"
import {
  Bell, ScrollText, SlidersHorizontal, ClipboardCheck, Settings, Search,
  type LucideIcon,
} from "lucide-react"
import { SentinelMark } from "@/components/sentinel-mark"
import { CONTRACTS } from "@/lib/mock"
import { cn } from "@/lib/utils"

// Coverage stat derived from the watched set, so it can't drift from the data it summarizes.
const LIVE = CONTRACTS.filter((c) => c.status === "live")
const WATCHED_FNS = LIVE.reduce((n, c) => n + (c.fns ?? 0), 0)

type NavDef = { to: string; label: string; icon: LucideIcon; badge?: number }

const NAV: NavDef[] = [
  { to: "/alerts", label: "Alerts", icon: Bell, badge: 4 },
  { to: "/contracts", label: "Contracts", icon: ScrollText },
  { to: "/monitoring-plan", label: "Monitoring Plan", icon: SlidersHorizontal },
  { to: "/audits", label: "Audits", icon: ClipboardCheck },
]

function NavItem({ to, label, icon: Icon, badge }: NavDef) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent/60",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn("size-4", isActive ? "text-primary" : "text-faint")} strokeWidth={1.6} />
          {label}
          {badge ? (
            <span className={cn("ml-auto font-mono text-[11px] tnum", isActive ? "text-primary" : "text-faint")}>
              {badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  )
}

function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border px-6">
      <button className="flex w-[320px] max-w-[36vw] items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-[7px] text-[13px] text-muted-foreground transition-colors hover:bg-secondary">
        <Search className="size-[15px]" strokeWidth={1.6} />
        <span className="flex-1 text-left">Search</span>
        <kbd className="rounded border border-border px-1.5 py-px font-mono text-[11px] text-faint">⌘K</kbd>
      </button>
      <div className="flex-1" />
      <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <span className="size-[7px] rounded-full bg-success" />
        Watching <b className="font-medium text-foreground tnum">{LIVE.length}</b> contracts ·{" "}
        <b className="font-medium text-foreground tnum">{WATCHED_FNS}</b> functions
      </span>
    </header>
  )
}

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-[236px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3">
        <div className="flex items-center gap-2.5 px-2 pb-5 pt-1">
          <SentinelMark className="size-5 text-ink-strong" />
          <span className="text-[16px] font-semibold text-ink-strong">Sentinel</span>
        </div>
        <nav className="grid gap-0.5">
          {NAV.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
        <div className="flex-1" />
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60",
            )
          }
        >
          {({ isActive }) => (
            <>
              <Settings className={cn("size-4", isActive ? "text-primary" : "text-faint")} strokeWidth={1.6} />
              Settings
            </>
          )}
        </NavLink>
        <p className="mt-3 px-2.5 text-[11.5px] text-faint">Powered by secondlayer</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
