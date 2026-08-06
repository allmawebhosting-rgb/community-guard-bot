import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart2,
  Bot,
  ClipboardList,
  LayoutDashboard,
  ListFilter,
  LogOut,
  Map,
  Megaphone,
  Radio,
  Search,
  Settings,
  Shield,
  UserSearch,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { rankLabel, type OfficerProfile } from "@/lib/police";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Operations",
    items: [
      { to: "/police",           label: "Command",      icon: LayoutDashboard, exact: true },
      { to: "/police/incidents", label: "Incidents",    icon: ListFilter,      exact: false },
      { to: "/police/map",       label: "Live Map",     icon: Map,             exact: false },
      { to: "/police/dispatch",  label: "Dispatch",     icon: Radio,           exact: false },
    ],
  },
  {
    label: "Community",
    items: [
      { to: "/police/persons",   label: "Persons",      icon: UserSearch,  exact: false },
      { to: "/police/alerts",    label: "Alerts",       icon: Megaphone,   exact: false },
      { to: "/police/comms",     label: "Comms",        icon: Activity,    exact: false },
      { to: "/police/officers",  label: "Officers",     icon: Users,       exact: false },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/police/analytics", label: "Analytics",    icon: BarChart2,     exact: false },
      { to: "/police/search",    label: "Search",       icon: Search,        exact: false },
      { to: "/police/ai",        label: "AI Assistant", icon: Bot,           exact: false },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/police/audit",     label: "Audit Log",    icon: ClipboardList, exact: false },
      { to: "/police/settings",  label: "Settings",     icon: Settings,      exact: false },
    ],
  },
] as const;

const MOBILE_NAV_PATHS = ["/police", "/police/incidents", "/police/dispatch", "/police/comms", "/police/officers"];
type NavItem = (typeof NAV_GROUPS)[number]["items"][number];
const MOBILE_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items as readonly NavItem[]).filter((i) =>
  MOBILE_NAV_PATHS.includes(i.to),
);

function LiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="tabular-nums font-mono text-[11px] text-muted-foreground tracking-wide">
      {time.toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

export function CommandShell({
  officer,
  children,
}: {
  officer: OfficerProfile | null;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fullName = officer?.full_name ?? "Officer";
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className="hidden w-[228px] shrink-0 flex-col border-r border-sidebar-border/70 bg-sidebar lg:flex relative overflow-hidden">
        {/* Subtle ambient glow behind sidebar */}
        <div className="pointer-events-none absolute -top-16 -left-16 h-48 w-48 rounded-full bg-primary/[0.07] blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-32 w-32 rounded-full bg-gold/[0.05] blur-2xl" />

        {/* Brand */}
        <div className="relative flex items-center gap-3 border-b border-sidebar-border/60 px-4 py-4">
          <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary via-primary to-primary-glow shadow-lift">
            <Shield className="h-4.5 w-4.5 text-primary-foreground" />
            {/* Pulse ring */}
            <span className="absolute -inset-0.5 rounded-2xl border border-primary/40 animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-[13.5px] font-bold leading-none tracking-tight text-foreground">
              Allma Command
            </p>
            <p className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-primary/70">
              Police Integration Ready
            </p>
          </div>
        </div>

        {/* Nav groups */}
        <nav className="relative flex-1 overflow-y-auto py-3 px-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-1">
              <p className="px-3 pb-1 pt-3 text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50">
                {group.label}
              </p>
              {group.items.map((item) => {
                const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-all duration-150",
                      active
                        ? "bg-primary/[0.12] text-foreground font-semibold shadow-sm"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                    )}
                  >
                    {active && (
                      <>
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
                      </>
                    )}
                    <item.icon
                      className={cn(
                        "h-[15px] w-[15px] shrink-0 transition-colors",
                        active ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground/80",
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                    {active && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.8)]" />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Officer card */}
        <div className="relative border-t border-sidebar-border/60 p-2.5">
          <div className="flex items-center gap-2.5 rounded-xl bg-sidebar-accent/60 px-3 py-2.5 transition-colors hover:bg-sidebar-accent">
            {/* Avatar with gradient ring */}
            <div className="relative shrink-0">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-primary/70 to-gold/70 text-[10px] font-bold text-white shadow-soft">
                {initials || "UP"}
              </div>
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-sidebar bg-success shadow-[0_0_4px_hsl(var(--success)/0.6)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold leading-none text-foreground">{fullName}</p>
              <p className="mt-0.5 truncate text-[10px] leading-none text-muted-foreground">{rankLabel(officer?.rank)}</p>
            </div>
            <button
              aria-label="Sign out"
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground/60 transition hover:bg-background/60 hover:text-foreground"
              onClick={async () => {
                await qc.cancelQueries();
                qc.clear();
                await supabase.auth.signOut();
                navigate({ to: "/auth", replace: true });
              }}
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Content column ───────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/50 bg-background/80 px-5 backdrop-blur-md lg:px-7">
          <div className="flex items-center gap-4 min-w-0">
            {/* Mobile brand */}
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow shadow-sm lg:hidden">
              <Shield className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <span className="font-display text-[13px] font-bold text-foreground">
                {officer?.jurisdiction_level ?? "National"} Command
              </span>
              <span className="mx-2 text-muted-foreground/30">·</span>
              <span className="text-[13px] text-muted-foreground">{officer?.jurisdiction_area ?? "Uganda"}</span>
            </div>
            {officer?.badge_number && (
              <span className="hidden rounded-full border border-border/50 bg-secondary/60 px-2.5 py-0.5 text-[10.5px] font-medium text-muted-foreground lg:block">
                Badge {officer.badge_number}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <LiveClock />
            {/* Live indicator */}
            <span className="flex items-center gap-1.5 rounded-full border border-success/30 bg-success/[0.08] px-2.5 py-1 text-[10.5px] font-semibold text-success">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              Live
            </span>
            <Link
              to="/chat"
              className="hidden rounded-xl border border-border/50 bg-secondary/40 px-3 py-1.5 text-[11.5px] font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-primary/[0.06] hover:text-foreground sm:block"
            >
              Citizen app
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="min-w-0 flex-1 overflow-y-auto px-5 pb-8 pt-6 lg:px-8">{children}</main>
      </div>

      {/* ── Mobile bottom nav ────────────────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/95 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5 px-2 pb-[env(safe-area-inset-bottom)]">
          {MOBILE_NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className={cn("h-4.5 w-4.5", active && "drop-shadow-[0_0_4px_hsl(var(--primary)/0.7)]")} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
