import { useState } from "react"
import {
  Bell,
  MessageSquare,
  Mail,
  Webhook,
  Plus,
  UserPlus,
  Eye,
  EyeOff,
  Copy,
  RotateCw,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Chip } from "@/components/primitives"
import { cn } from "@/lib/utils"

type Route = {
  icon: LucideIcon
  name: string
  dest: string
  scope: "pages" | "digest"
  on: boolean
}

const ROUTES: Route[] = [
  { icon: Bell, name: "PagerDuty", dest: "security-oncall", scope: "pages", on: true },
  { icon: MessageSquare, name: "Slack", dest: "#sentinel-alerts", scope: "pages", on: true },
  { icon: Mail, name: "Email", dest: "security@protocol.xyz", scope: "digest", on: true },
  { icon: Webhook, name: "Webhook", dest: "https://ops.protocol.xyz/sentinel", scope: "pages", on: false },
]

type Member = { name: string; email: string; role: string }

const TEAM: Member[] = [
  { name: "Ryan Waits", email: "ryan@protocol.xyz", role: "Owner" },
  { name: "A. Okafor", email: "ada@protocol.xyz", role: "Responder" },
  { name: "security (bot)", email: "svc-sentinel", role: "Read-only" },
]

const WEBHOOK_SECRET = "whsec_7Jd2k9Qf3mX1pR8vLtBw0cZ"
const WEBHOOK_MASK = "whsec_•••••••••••••••••••••••"
const API_KEY = "sk_live_••••••••••••4a91"

const GRID = "grid-cols-[1.4fr_1.5fr_0.9fr_60px]"

function Section({
  title,
  note,
  action,
  children,
}: {
  title: string
  note?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mb-[30px]">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-[15px] font-semibold text-ink-strong">{title}</h2>
        {note && <span className="text-[12.5px] text-muted-foreground">{note}</span>}
        <span className="flex-1" />
        {action}
      </div>
      <div className="overflow-hidden rounded-[11px] border border-border bg-secondary">{children}</div>
    </section>
  )
}

function RouteRow({ route }: { route: Route }) {
  const [on, setOn] = useState(route.on)
  const Icon = route.icon
  return (
    <div className={cn("grid items-center gap-3.5 border-t border-border bg-background px-4 py-[13px]", GRID)}>
      <span className="flex items-center gap-2.5">
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.5} />
        <span className="font-medium text-ink-strong">{route.name}</span>
      </span>
      <span className="truncate font-mono text-[12.5px] text-muted-foreground">{route.dest}</span>
      <span>{route.scope === "pages" ? <Chip tone="accent">WARN pages</Chip> : <Chip tone="ghost">daily digest</Chip>}</span>
      <span className="flex justify-end">
        <Switch checked={on} onCheckedChange={setOn} />
      </span>
    </div>
  )
}

export default function SettingsPage() {
  const [reveal, setReveal] = useState(false)
  return (
    <div className="mx-auto max-w-[800px] px-6 pb-[70px] pt-7">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mb-7 mt-[5px] text-[13.5px] text-muted-foreground">
        Where alerts go, what Sentinel is allowed to spend, and who has access.
      </p>

      <Section
        title="Notification routes"
        note="alerts are human-gated; these decide where they land"
        action={
          <Button size="sm" variant="outline">
            <Plus /> Add route
          </Button>
        }
      >
        <div className={cn("grid gap-3.5 px-4 py-[9px] font-mono text-[10.5px] uppercase tracking-wider text-faint", GRID)}>
          <span>Channel</span>
          <span>Destination</span>
          <span>Scope</span>
          <span className="text-right">On</span>
        </div>
        {ROUTES.map((route) => (
          <RouteRow key={route.name} route={route} />
        ))}
      </Section>

      <Section title="Spend ceiling" note="a hard cap on audit + monitoring compute per day">
        <div className="bg-background p-[18px]">
          <div className="flex flex-wrap items-center gap-3.5">
            <div className="flex items-center gap-2 rounded-[9px] border border-border bg-card px-3 py-2">
              <span className="font-mono text-faint">$</span>
              <Input
                defaultValue="50"
                className="h-auto w-14 border-0 bg-transparent p-0 font-mono font-medium tnum text-foreground focus-visible:ring-0"
              />
              <span className="text-[13px] text-muted-foreground">/ day</span>
            </div>
            <span className="text-[13px] text-muted-foreground">
              Sentinel pauses new audits when the cap is hit. It never pauses monitoring.
            </span>
            <span className="flex-1" />
            <Button size="sm">Save</Button>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-[12.5px] text-muted-foreground">
              <span>Today</span>
              <span className="font-mono tnum">
                <b className="font-medium text-foreground">$4.06</b> / $50
              </span>
            </div>
            <Progress value={8.12} />
          </div>
        </div>
      </Section>

      <Section
        title="Team"
        action={
          <Button size="sm" variant="outline">
            <UserPlus /> Invite
          </Button>
        }
      >
        {TEAM.map((m, i) => (
          <div
            key={m.email}
            className={cn("flex items-center gap-3 bg-background px-4 py-[13px]", i && "border-t border-border")}
          >
            <Avatar className="size-7">
              <AvatarFallback className="bg-primary-weak text-[12px] font-semibold text-primary">
                {m.name[0]}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium text-ink-strong">{m.name}</span>
            <span className="font-mono text-[12.5px] text-muted-foreground">{m.email}</span>
            <span className="flex-1" />
            <Chip tone={m.role === "Owner" ? "accent" : "ghost"}>{m.role}</Chip>
          </div>
        ))}
      </Section>

      <Section title="API & webhooks" note="the secondlayer signing secret and your API key">
        <div className="grid gap-4 bg-background p-[18px]">
          <div>
            <div className="mb-[7px] text-[12.5px] text-muted-foreground">secondlayer webhook signing secret</div>
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate rounded-lg border border-border bg-card px-3 py-[9px] font-mono text-[13px] text-foreground">
                {reveal ? WEBHOOK_SECRET : WEBHOOK_MASK}
              </span>
              <Button size="sm" variant="outline" onClick={() => setReveal((r) => !r)}>
                {reveal ? <EyeOff /> : <Eye />} {reveal ? "Hide" : "Reveal"}
              </Button>
              <Button size="sm" variant="ghost">
                <RotateCw /> Rotate
              </Button>
            </div>
          </div>
          <div>
            <div className="mb-[7px] text-[12.5px] text-muted-foreground">API key</div>
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate rounded-lg border border-border bg-card px-3 py-[9px] font-mono text-[13px] text-foreground">
                {API_KEY}
              </span>
              <Button size="sm" variant="outline">
                <Copy /> Copy
              </Button>
              <Button size="sm" variant="ghost">
                Revoke
              </Button>
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}
