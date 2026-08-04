import { type ReactNode } from "react";
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
import { Button } from "@/components/ui/button";
import { rankLabel, type OfficerProfile } from "@/lib/police";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/police",            label: "Command",    icon: LayoutDashboard, exact: true },
  { to: "/police/incidents",  label: "Incidents",  icon: ListFilter,      exact: false },
  { to: "/police/map",        label: "Live Map",   icon: Map,             exact: false },
  { to: "/police/dispatch",   label: "Dispatch",   icon: Radio,           exact: false },
  { to: "/police/persons",    label: "Persons",    icon: UserSearch,      exact: false },
  { to: "/police/alerts",     label: "Alerts",     icon: Megaphone,       exact: false },
  { to: "/police/comms",      label: "Comms",      icon: Activity,        exact: false },
  { to: "/police/officers",   label: "Officers",   icon: Users,           exact: false },
  { to: "/police/analytics",  label: "Analytics",  icon: BarChart2,       exact: false },
  { to: "/police/search",     label: "Search",     icon: Search,          exact: false },
  { to: "/police/ai",         label: "AI Assistant", icon: Bot,           exact: false },
  { to: "/police/audit",      label: "Audit Log",  icon: ClipboardList,   exact: false },
  { to: "/police/settings",   label: "Settings",   icon: Settings,        exact: false },
] as const;

const MOBILE_NAV = NAV.filter((item) =>
  ["/police", "/police/incidents", "/police/dispatch", "/police/comms", "/police/officers"].includes(
    item.to,
  ),
);

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
    <div className="min-h-screen bg-background lg:flex">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow shadow-lift">
            <Shield className="h-4.5 w-4.5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold tracking-tight">Allma Command</p>
            <p className="truncate text-[11px] text-muted-foreground">Uganda Police</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm transition",
                  active
                    ? "border border-primary/35 bg-primary/12 text-foreground"
                    : "border border-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                <item.icon className={cn("h-4 w-4", active && "text-primary")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-2xl bg-sidebar-accent/60 px-3 py-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-primary text-[11px] font-bold text-primary-foreground">
              {initials || "UP"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{fullName}</p>
              <p className="truncate text-[10px] text-muted-foreground">{rankLabel(officer?.rank)}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={async () => {
                await qc.cancelQueries();
                qc.clear();
                await supabase.auth.signOut();
                navigate({ to: "/auth", replace: true });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 glass border-b border-border/60">
          <div className="flex h-16 items-center justify-between gap-3 px-4 lg:px-6">
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold tracking-tight">
                {officer?.jurisdiction_level ?? "Station"} command ·{" "}
                <span className="text-muted-foreground">{officer?.jurisdiction_area ?? "Uganda"}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Badge {officer?.badge_number ?? "—"} · {rankLabel(officer?.rank)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-[11px] font-medium text-success sm:inline-flex">
                <Activity className="h-3.5 w-3.5" /> Live
              </span>
              <Button variant="outline" size="sm" className="rounded-full" asChild>
                <Link to="/chat">Citizen app</Link>
              </Button>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-5 lg:px-6 lg:pb-10">{children}</main>
      </div>

      {/* Mobile nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5 px-2 pb-[env(safe-area-inset-bottom)]">
          {MOBILE_NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[10px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="h-4.5 w-4.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
