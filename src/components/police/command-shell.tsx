import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart2,
  Bot,
  ClipboardList,
  Globe2,
  LayoutDashboard,
  Landmark,
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
      { to: "/police",           label: "Command",              icon: LayoutDashboard, exact: true },
      { to: "/police/national",  label: "Operations Overview",  icon: Globe2,          exact: false },
      { to: "/police/incidents", label: "Incidents",           icon: ListFilter,      exact: false },
      { to: "/police/map",       label: "Live Map",            icon: Map,             exact: false },
      { to: "/police/dispatch",  label: "Dispatch",            icon: Radio,           exact: false },
      { to: "/police/authority", label: "Authority",           icon: Landmark,        exact: false },
    ],
  },
  {
    label: "Community",
    items: [
      { to: "/police/persons",   label: "Persons",              icon: UserSearch,  exact: false },
      { to: "/police/alerts",    label: "Nearby Help",          icon: Megaphone,   exact: false },
      { to: "/police/comms",     label: "Comms",                icon: Activity,    exact: false },
      { to: "/police/officers",  label: "Authorized Responders", icon: Users,       exact: false },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/police/analytics", label: "Intelligence", icon: BarChart2,     exact: false },
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
    <span className="tabular-nums font-mono text-[11px] text-muted-foreground/80 tracking-wider">
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

  const isPoliceAI = pathname === "/police/ai";

  useEffect(() => {
    document.documentElement.classList.toggle("viewport-locked", isPoliceAI);
    document.body.classList.toggle("viewport-locked", isPoliceAI);

    return () => {
      document.documentElement.classList.remove("viewport-locked");
      document.body.classList.remove("viewport-locked");
    };
  }, [isPoliceAI]);

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden bg-background">

      {/* ── SIDEBAR premium dark ─────────────────────────────────────────── */}
      <aside
        className="hidden w-[230px] shrink-0 flex-col lg:flex relative overflow-hidden"
        style={{
          background: "linear-gradient(180deg, oklch(0.09 0.018 25) 0%, oklch(0.07 0.014 25) 100%)",
          borderRight: "1px solid oklch(0.18 0.02 25)",
        }}
      >
        {/* Ambient glow orbs */}
        <div
          className="pointer-events-none absolute -top-20 -left-20 h-64 w-64 rounded-full opacity-40"
          style={{ background: "radial-gradient(circle, oklch(0.575 0.235 26 / 0.35), transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute bottom-20 -right-16 h-48 w-48 rounded-full opacity-30"
          style={{ background: "radial-gradient(circle, oklch(0.855 0.175 88 / 0.25), transparent 70%)" }}
        />

        {/* ── Brand ── */}
        <div
          className="relative flex items-center gap-3 px-4 py-4"
          style={{ borderBottom: "1px solid oklch(0.18 0.02 25)" }}
        >
          {/* Shield badge with glow */}
          <div className="relative shrink-0">
            <div
              className="grid h-10 w-10 place-items-center rounded-2xl shadow-lift"
              style={{
                background: "linear-gradient(135deg, oklch(0.575 0.235 26), oklch(0.7 0.21 36))",
                boxShadow: "0 0 20px oklch(0.575 0.235 26 / 0.5), 0 4px 12px oklch(0 0 0 / 0.4)",
              }}
            >
              <Shield className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="font-display text-[14px] font-bold leading-none tracking-tight text-white">
              Allma Operations Center
            </p>
            <p
              className="mt-1 text-[9px] font-bold uppercase tracking-[0.22em]"
              style={{ color: "oklch(0.855 0.175 88)" }}
            >
              Private Platform • Authorized Access
            </p>
          </div>
        </div>

        {/* ── Nav groups ── */}
        <nav className="relative flex-1 overflow-y-auto py-3 px-2.5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-2">
              <p
                className="px-2.5 pb-1.5 pt-3 text-[9px] font-bold uppercase tracking-[0.2em]"
                style={{ color: "oklch(0.4 0.015 25)" }}
              >
                {group.label}
              </p>
              {group.items.map((item) => {
                const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-all duration-150 mb-0.5",
                    )}
                    style={
                      active
                        ? {
                            background: "linear-gradient(135deg, oklch(0.575 0.235 26 / 0.25), oklch(0.7 0.21 36 / 0.12))",
                            border: "1px solid oklch(0.575 0.235 26 / 0.35)",
                            color: "white",
                            fontWeight: 600,
                          }
                        : {
                            color: "oklch(0.55 0.015 25)",
                            border: "1px solid transparent",
                          }
                    }
                  >
                    {/* Active left glow bar */}
                    {active && (
                      <span
                        className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full"
                        style={{
                          background: "linear-gradient(180deg, oklch(0.575 0.235 26), oklch(0.7 0.21 36))",
                          boxShadow: "0 0 8px oklch(0.575 0.235 26 / 0.8)",
                        }}
                      />
                    )}
                    <item.icon
                      className="h-4 w-4 shrink-0 transition-colors"
                      style={active ? { color: "oklch(0.7 0.21 36)" } : {}}
                    />
                    <span className="truncate">{item.label}</span>
                    {active && (
                      <span
                        className="ml-auto h-1.5 w-1.5 rounded-full shrink-0"
                        style={{
                          background: "oklch(0.575 0.235 26)",
                          boxShadow: "0 0 6px oklch(0.575 0.235 26 / 0.9)",
                        }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* ── Officer card ── */}
        <div
          className="p-3"
          style={{ borderTop: "1px solid oklch(0.18 0.02 25)" }}
        >
          <div
            className="flex items-center gap-2.5 rounded-2xl px-3 py-3 transition-colors"
            style={{ background: "oklch(0.12 0.016 25)" }}
          >
            {/* Avatar */}
            <div className="relative shrink-0">
              <div
                className="grid h-9 w-9 place-items-center rounded-full text-[11px] font-black text-white"
                style={{
                  background: "linear-gradient(135deg, oklch(0.575 0.235 26 / 0.9), oklch(0.855 0.175 88 / 0.9))",
                  boxShadow: "0 0 12px oklch(0.575 0.235 26 / 0.4)",
                }}
              >
                {initials || "UP"}
              </div>
              {/* Online dot */}
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
                style={{
                  background: "oklch(0.72 0.14 156)",
                  border: "2px solid oklch(0.09 0.018 25)",
                  boxShadow: "0 0 6px oklch(0.72 0.14 156 / 0.7)",
                }}
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold leading-none text-white">{fullName}</p>
              <p className="mt-0.5 truncate text-[10px] leading-none" style={{ color: "oklch(0.4 0.015 25)" }}>
                {rankLabel(officer?.rank)}
              </p>
            </div>

            <button
              aria-label="Sign out"
              className="shrink-0 rounded-xl p-1.5 transition"
              style={{ color: "oklch(0.4 0.015 25)" }}
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

      {/* ── CONTENT AREA ─────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Top bar */}
        <header
          className="flex h-13 shrink-0 items-center justify-between px-5 lg:px-7"
          style={{
            background: "color-mix(in oklab, var(--background) 92%, transparent)",
            borderBottom: "1px solid color-mix(in oklab, var(--border) 60%, transparent)",
            backdropFilter: "blur(12px)",
            height: "52px",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile brand mark */}
            <div
              className="grid h-7 w-7 shrink-0 place-items-center rounded-xl lg:hidden"
              style={{ background: "linear-gradient(135deg, oklch(0.575 0.235 26), oklch(0.7 0.21 36))" }}
            >
              <Shield className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-display text-[13.5px] font-bold text-foreground">
                {officer?.jurisdiction_level ?? "National"} Command
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-[13px] text-muted-foreground">{officer?.jurisdiction_area ?? "Uganda"}</span>
            </div>
            {officer?.badge_number && (
              <span className="hidden rounded-full border border-border/50 bg-muted/40 px-2.5 py-0.5 text-[10.5px] font-medium text-muted-foreground lg:block">
                Badge {officer.badge_number}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <LiveClock />

            {/* Live pill */}
            <span
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] font-semibold"
              style={{
                background: "oklch(0.62 0.13 160 / 0.1)",
                border: "1px solid oklch(0.62 0.13 160 / 0.3)",
                color: "oklch(0.62 0.13 160)",
              }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                  style={{ background: "oklch(0.62 0.13 160)" }}
                />
                <span
                  className="relative inline-flex h-1.5 w-1.5 rounded-full"
                  style={{ background: "oklch(0.62 0.13 160)" }}
                />
              </span>
              Live
            </span>

            <Link
              to="/chat"
              className="hidden rounded-xl px-3 py-1.5 text-[11.5px] font-medium text-muted-foreground transition hover:text-foreground sm:block"
              style={{
                border: "1px solid color-mix(in oklab, var(--border) 70%, transparent)",
                background: "color-mix(in oklab, var(--muted) 40%, transparent)",
              }}
            >
              Citizen app
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main
          className={cn(
            "min-h-0 min-w-0 flex-1 px-5 pt-6 lg:px-8",
            pathname === "/police/ai"
              ? "flex min-h-0 flex-col overflow-hidden pb-20 lg:pb-8"
              : "overflow-y-auto pb-8",
          )}
        >
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ────────────────────────────────────────────── */}
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
