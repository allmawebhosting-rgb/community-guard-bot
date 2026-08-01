import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Ambulance,
  Backpack,
  Flame,
  Hospital,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  MessageSquareText,
  PanelLeft,
  Shield,
  ShieldAlert,
  Siren,
  Sun,
  UserRound,
  UserSearch,
} from "lucide-react";
import { BrandMark } from "@/components/allma/brand";
import { ThreadList } from "@/components/allma/thread-list";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  icon: typeof Shield;
  to?: "/" | "/dashboard";
  prompt?: string;
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Safety",
    items: [
      { label: "Assistant", icon: MessageSquareText, to: "/" },
      { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
      {
        label: "Community alerts",
        icon: Megaphone,
        prompt: "Show me the latest community safety alerts near me.",
      },
    ],
  },
  {
    label: "Report",
    items: [
      { label: "Report crime", icon: ShieldAlert, prompt: "I want to report a crime." },
      { label: "Missing person", icon: UserSearch, prompt: "I need to report a missing person." },
      {
        label: "Lost & found",
        icon: Backpack,
        prompt: "I want to report something lost or found.",
      },
      {
        label: "Emergency SOS",
        icon: Siren,
        prompt: "This is an emergency. I need help right now.",
      },
    ],
  },
  {
    label: "Nearby help",
    items: [
      { label: "Police stations", icon: Shield, prompt: "Find the nearest police station." },
      { label: "Hospitals", icon: Hospital, prompt: "Find the nearest hospital." },
      { label: "Fire brigade", icon: Flame, prompt: "There is a fire. I need help." },
      { label: "Ambulance", icon: Ambulance, prompt: "I need an ambulance." },
    ],
  },
];

function NavRail({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const { user, isAuthenticated, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const startPrompt = (prompt: string) => {
    onNavigate?.();
    navigate({ to: "/", search: { q: prompt } });
  };

  const name =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Guest";
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex h-16 shrink-0 items-center gap-2.5 px-4", collapsed && "px-3")}>
        <BrandMark className="h-8 w-8 shrink-0 rounded-xl" />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="brand-gradient-text truncate font-display text-sm font-bold">
              Allma Safety
            </p>
            <p className="truncate text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Community AI
            </p>
          </div>
        )}
      </div>

      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            {!collapsed && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.to ? pathname === item.to : false;
              const classes = cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                collapsed && "justify-center px-0",
              );
              const content = (
                <>
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </>
              );

              return item.to ? (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={onNavigate}
                  className={classes}
                  title={collapsed ? item.label : undefined}
                >
                  {content}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => startPrompt(item.prompt as string)}
                  className={classes}
                  title={collapsed ? item.label : undefined}
                >
                  {content}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        {isAuthenticated ? (
          <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-xs font-bold text-primary-foreground">
              {initials || "A"}
            </span>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Member
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Sign out"
                  onClick={async () => {
                    await signOut();
                    onNavigate?.();
                    navigate({ to: "/", replace: true });
                  }}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ) : (
          <Button className="w-full rounded-xl" size="sm" asChild onClick={onNavigate}>
            <Link to="/auth">
              <UserRound className="mr-1.5 h-4 w-4" /> Sign in
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export function AppShell({
  children,
  activeThreadId,
  showThreads = true,
}: {
  children: ReactNode;
  activeThreadId?: string | null;
  showThreads?: boolean;
}) {
  const { theme, toggleTheme } = useTheme();
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside
        className={cn(
          "hidden shrink-0 border-r border-sidebar-border lg:block",
          railCollapsed ? "w-[68px]" : "w-60",
        )}
      >
        <NavRail collapsed={railCollapsed} />
      </aside>

      {showThreads && (
        <aside className="hidden w-64 shrink-0 border-r border-border/70 bg-surface/40 xl:block">
          <ThreadList activeId={activeThreadId} />
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 shrink-0 items-center gap-2 border-b border-border/70 px-3 glass">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[19rem] p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <div className="flex h-full">
                <div className="w-48 border-r border-sidebar-border">
                  <NavRail onNavigate={() => setMobileOpen(false)} />
                </div>
                <div className="min-w-0 flex-1">
                  <ThreadList
                    activeId={activeThreadId}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            aria-label="Toggle sidebar"
            onClick={() => setRailCollapsed((value) => !value)}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>

          <Link to="/" className="flex min-w-0 items-center gap-2">
            <BrandMark className="h-6 w-6 rounded-lg lg:hidden" />
            <span className="truncate font-display text-sm font-semibold">Allma Safety AI</span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" className="hidden rounded-full sm:inline-flex" asChild>
              <Link to="/dashboard">Dashboard</Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle colour theme"
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
