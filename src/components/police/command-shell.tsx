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
      { to: "/police",           label: "Command",     icon: LayoutDashboard, exact: true },
      { to: "/police/incidents", label: "Incidents",   icon: ListFilter,      exact: false },
      { to: "/police/map",       label: "Live Map",    icon: Map,             exact: false },
      { to: "/police/dispatch",  label: "Dispatch",    icon: Radio,           exact: false },
    ],
  },
  {
    label: "Community",
    items: [
      { to: "/police/persons",   label: "Persons",     icon: UserSearch,  exact: false },
      { to: "/police/alerts",    label: "Alerts",      icon: Megaphone,   exact: false },
      { to: "/police/comms",     label: "Comms",       icon: Activity,    exact: false },
      { to: "/police/officers",  label: "Officers",    icon: Users,       exact: false },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/police/analytics", label: "Analytics",   icon: BarChart2,     exact: false },
      { to: "/police/search",    label: "Search",      icon: Search,        exact: false },
      { to: "/police/ai",        label: "AI Assistant", icon: Bot,          exact: false },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/police/audit",     label: "Audit Log",   icon: ClipboardList, exact: false },
      { to: "/police/settings",  label: "Settings",    icon: Settings,      exact: false },
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
    <span className="tabular-nums text-[11px] text-muted-foreground">
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
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        {/* Brand */}
        <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-3.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow shadow-sm">
            <Shield className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-[13px] font-semibold leading-none tracking-tight">Allma Command</p>
             <p className="mt-0.5 text-[10px] text-muted-foreground">Police Integration Ready</p>
          </div>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-1">
              <p className="px-4 pb-1 pt-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                {group.label}
              </p>
              {group.items.map((item) => {
                const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "relative mx-1.5 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
                      active
                        ? "bg-primary/10 text-foreground font-medium"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                    )}
                    <item.icon className={cn("h-[15px] w-[15px] shrink-0", active ? "text-primary" : "")} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Officer card */}
        <div className="border-t border-sidebar-border p-2">
          <div className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-primary text-[9px] font-bold text-primary-foreground">
              {initials || "UP"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium leading-none">{fullName}</p>
              <p className="mt-0.5 truncate text-[10px] leading-none text-muted-foreground">{rankLabel(officer?.rank)}</p>
            </div>
            <button
              aria-label="Sign out"
              className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-background hover:text-foreground"
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

      {/* ── Content column ──────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-border/60 bg-background/90 px-5 backdrop-blur-sm lg:px-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <span className="font-display text-[13px] font-semibold">
                {officer?.jurisdiction_level ?? "National"} Command
              </span>
              <span className="mx-2 text-muted-foreground/40">·</span>
              <span className="text-[13px] text-muted-foreground">{officer?.jurisdiction_area ?? "Uganda"}</span>
            </div>
            {officer?.badge_number && (
              <span className="hidden border-l border-border/40 pl-4 text-[11px] text-muted-foreground lg:block">
                Badge {officer.badge_number}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <LiveClock />
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-success">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              Live
            </span>
            <Link
              to="/chat"
              className="rounded-lg border border-border/60 px-3 py-1 text-[12px] text-muted-foreground transition hover:border-border hover:text-foreground"
            >
              Citizen app
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="min-w-0 flex-1 overflow-y-auto px-5 pb-6 pt-5 lg:px-8">{children}</main>
      </div>

      {/* ── Mobile bottom nav ───────────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5 px-2 pb-[env(safe-area-inset-bottom)]">
          {MOBILE_NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 text-[10px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
