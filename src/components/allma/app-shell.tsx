import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { MeshBackground } from "@/components/allma/mesh-background";
import {
  Ambulance,
  Backpack,
  ChevronRight,
  Flame,
  Hospital,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Moon,
  MessageSquareText,
  PanelLeft,
  Plus,
  Shield,
  ShieldAlert,
  Siren,
  Sun,
  UserRound,
  UserSearch,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BrandMark } from "@/components/allma/brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/lib/theme";
import { createThread, threadsQueryOptions } from "@/lib/threads";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  icon: typeof Shield;
  color: string;
  bg: string;
  to?: "/" | "/dashboard";
  prompt?: string;
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Safety",
    items: [
      { label: "Assistant", icon: MessageSquareText, to: "/", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-950/50" },
      { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-950/50" },
      { label: "Community alerts", icon: Megaphone, prompt: "Show me the latest community safety alerts near me.", color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-100 dark:bg-sky-950/50" },
    ],
  },
  {
    label: "Report",
    items: [
      { label: "Report crime", icon: ShieldAlert, prompt: "I want to report a crime.", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-950/50" },
      { label: "Missing person", icon: UserSearch, prompt: "I need to report a missing person.", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-950/50" },
      { label: "Lost & found", icon: Backpack, prompt: "I want to report something lost or found.", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-950/50" },
      { label: "Emergency SOS", icon: Siren, prompt: "This is an emergency. I need help right now.", color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-950/50" },
    ],
  },
  {
    label: "Nearby help",
    items: [
      { label: "Police stations", icon: Shield, prompt: "Find the nearest police station.", color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-950/50" },
      { label: "Hospitals", icon: Hospital, prompt: "Find the nearest hospital.", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-950/50" },
      { label: "Fire brigade", icon: Flame, prompt: "There is a fire. I need help.", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-950/50" },
      { label: "Ambulance", icon: Ambulance, prompt: "I need an ambulance.", color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-100 dark:bg-rose-950/50" },
    ],
  },
];

/* ─────────────────────────────────────────────────
   Desktop sidebar NavRail (unchanged from before)
───────────────────────────────────────────────── */
function NavRail({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { user, isAuthenticated, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Guest";
  const initials = name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const startPrompt = (prompt: string) => {
    onNavigate?.();
    navigate({ to: "/", search: { q: prompt } });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex h-16 shrink-0 items-center gap-2.5 px-4", collapsed && "px-3")}>
        <BrandMark className="h-8 w-8 shrink-0 rounded-xl" />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="brand-gradient-text truncate font-display text-sm font-bold">Allma Safety</p>
            <p className="truncate text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Community AI</p>
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
              const cls = cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                collapsed && "justify-center px-0",
              );
              const inner = (
                <>
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </>
              );
              return item.to ? (
                <Link key={item.label} to={item.to} onClick={onNavigate} className={cls} title={collapsed ? item.label : undefined}>{inner}</Link>
              ) : (
                <button key={item.label} type="button" onClick={() => startPrompt(item.prompt!)} className={cls} title={collapsed ? item.label : undefined}>{inner}</button>
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
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Member</p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Sign out"
                  onClick={async () => { await signOut(); onNavigate?.(); navigate({ to: "/", replace: true }); }}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ) : (
          <Button className="w-full rounded-xl" size="sm" asChild onClick={onNavigate}>
            <Link to="/auth"><UserRound className="mr-1.5 h-4 w-4" /> Sign in</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   Mobile full-screen drawer — nav + chats combined
───────────────────────────────────────────────── */
function MobileDrawer({
  open,
  onClose,
  activeThreadId,
}: {
  open: boolean;
  onClose: () => void;
  activeThreadId?: string | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: threads = [], isLoading } = useQuery({
    ...threadsQueryOptions(),
    enabled: isAuthenticated,
  });

  const [tab, setTab] = useState<"nav" | "chats">("nav");

  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Guest";
  const initials = name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const startPrompt = (prompt: string) => {
    onClose();
    navigate({ to: "/", search: { q: prompt } });
  };

  const newChat = async () => {
    if (!isAuthenticated) { onClose(); navigate({ to: "/auth" }); return; }
    try {
      const thread = await createThread();
      await queryClient.invalidateQueries({ queryKey: ["threads"] });
      onClose();
      navigate({ to: "/chat/$threadId", params: { threadId: thread.id } });
    } catch {
      toast.error("Could not start a new conversation.");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="bd"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.aside
            key="panel"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-sm flex-col bg-background shadow-2xl lg:hidden"
          >
            {/* ── Gradient header ── */}
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-primary to-primary-glow px-5 pb-4 pt-5">
              {/* Decorative blobs */}
              <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-4 left-10 h-20 w-20 rounded-full bg-white/8 blur-xl" />

              <div className="relative flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <BrandMark className="h-10 w-10 rounded-2xl shadow-md ring-2 ring-white/25" />
                  <div className="leading-tight">
                    <p className="font-display text-[15px] font-bold text-white">Allma Safety AI</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/65">Community AI</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close menu"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Auth row */}
              {isAuthenticated ? (
                <div className="relative mt-3.5 flex items-center gap-3 rounded-2xl bg-white/12 px-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20 text-[11px] font-bold text-white">
                    {initials || "A"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-white">{name}</p>
                    <p className="text-[10px] text-white/60">Member</p>
                  </div>
                  <button type="button" aria-label="Sign out"
                    onClick={async () => { await signOut(); onClose(); navigate({ to: "/", replace: true }); }}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white/80 transition-colors hover:bg-white/25"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative mt-3">
                  <Button className="w-full rounded-2xl bg-white/20 text-white backdrop-blur-sm hover:bg-white/30 border-0" size="sm" asChild onClick={onClose}>
                    <Link to="/auth"><UserRound className="mr-1.5 h-3.5 w-3.5" /> Sign in to save reports</Link>
                  </Button>
                </div>
              )}
            </div>

            {/* ── Tab switcher ── */}
            <div className="flex shrink-0 border-b border-border/60 px-4 pt-2">
              <button
                type="button"
                onClick={() => setTab("nav")}
                className={cn(
                  "mr-4 pb-2 text-[13px] font-semibold transition-colors border-b-2",
                  tab === "nav"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                Menu
              </button>
              <button
                type="button"
                onClick={() => setTab("chats")}
                className={cn(
                  "pb-2 text-[13px] font-semibold transition-colors border-b-2",
                  tab === "chats"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                Chats
              </button>
            </div>

            {/* ── Nav tab ── */}
            {tab === "nav" && (
              <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
                {NAV_GROUPS.map((group) => (
                  <div key={group.label} className="space-y-0.5">
                    <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/55">
                      {group.label}
                    </p>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = item.to ? pathname === item.to : false;
                      const row = (
                        <div className="flex w-full items-center gap-3">
                          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", item.bg)}>
                            <Icon className={cn("h-[15px] w-[15px]", item.color)} />
                          </span>
                          <span className={cn("flex-1 text-[13px] font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                            {item.label}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/35" />
                        </div>
                      );
                      const cls = cn("w-full rounded-2xl px-2 py-2 transition-all active:scale-[0.98] hover:bg-accent", active && "bg-accent/70");
                      return item.to ? (
                        <Link key={item.label} to={item.to} onClick={onClose} className={cls}>{row}</Link>
                      ) : (
                        <button key={item.label} type="button" onClick={() => startPrompt(item.prompt!)} className={cls}>{row}</button>
                      );
                    })}
                  </div>
                ))}
              </nav>
            )}

            {/* ── Chats tab ── */}
            {tab === "chats" && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="shrink-0 px-3 pt-3 pb-2">
                  <button
                    type="button"
                    onClick={newChat}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-glow py-2.5 text-[13px] font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90"
                  >
                    <Plus className="h-4 w-4" /> New chat
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
                  {!isAuthenticated ? (
                    <div className="flex flex-col items-center gap-3 px-2 pt-8 text-center">
                      <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">Sign in to save and revisit your conversations.</p>
                      <Button size="sm" className="rounded-xl" asChild onClick={onClose}>
                        <Link to="/auth">Sign in</Link>
                      </Button>
                    </div>
                  ) : isLoading ? (
                    <p className="px-2 pt-4 text-[13px] text-muted-foreground">Loading…</p>
                  ) : threads.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-2 pt-8 text-center">
                      <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No conversations yet. Start chatting!</p>
                    </div>
                  ) : (
                    threads.map((thread) => (
                      <Link
                        key={thread.id}
                        to="/chat/$threadId"
                        params={{ threadId: thread.id }}
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                          thread.id === activeThreadId && "bg-accent font-medium text-foreground",
                        )}
                      >
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary/60" />
                        <span className="truncate">{thread.title}</span>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─────────────────────────────────────────────────
   Main AppShell
───────────────────────────────────────────────── */
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
      {/* Animated Uganda-inspired mesh background */}
      <MeshBackground />

      {/* Desktop left nav */}
      <aside className={cn("hidden shrink-0 border-r border-sidebar-border lg:block", railCollapsed ? "w-[68px]" : "w-60")}>
        <NavRail collapsed={railCollapsed} />
      </aside>

      {/* Desktop thread list */}
      {showThreads && (
        <aside className="hidden w-64 shrink-0 border-r border-border/70 bg-surface/40 xl:block">
          {/* Inline thread list for desktop — reuse ThreadList */}
          <ThreadListDesktop activeId={activeThreadId} />
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Premium header ── */}
        <header className="no-print flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-3 glass">
          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-all active:scale-95 hover:bg-accent hover:text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Desktop sidebar toggle */}
          <Button variant="ghost" size="icon" className="hidden lg:inline-flex" aria-label="Toggle sidebar"
            onClick={() => setRailCollapsed((v) => !v)}>
            <PanelLeft className="h-4 w-4" />
          </Button>

          {/* Brand + online status */}
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <BrandMark className="h-7 w-7 rounded-xl lg:hidden" />
            <div className="min-w-0 leading-tight">
              <p className="brand-gradient-text truncate font-display text-sm font-bold">
                Allma Safety AI
              </p>
              <p className="hidden truncate text-[9px] text-muted-foreground/60 sm:block">
                Keeping Uganda safer with AI.
              </p>
            </div>
          </Link>

          {/* Online status badge */}
          <span className="hidden items-center gap-1.5 rounded-full border border-border/50 bg-card/60 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground backdrop-blur-sm sm:flex">
            <span className="online-pulse h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Online
          </span>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" className="hidden rounded-full sm:inline-flex" asChild>
              <Link to="/dashboard">Dashboard</Link>
            </Button>
            <button
              type="button"
              aria-label="Toggle theme"
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>

      {/* Premium mobile drawer */}
      <MobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        activeThreadId={activeThreadId}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────
   Desktop-only thread list (keeps desktop layout)
───────────────────────────────────────────────── */
function ThreadListDesktop({ activeId }: { activeId?: string | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { data: threads = [], isLoading } = useQuery({
    ...threadsQueryOptions(),
    enabled: isAuthenticated,
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2 px-3">
        <BrandMark className="h-7 w-7 rounded-lg" />
        <p className="brand-gradient-text font-display text-sm font-semibold">Allma chats</p>
      </div>

      <div className="px-3 pb-3">
        <Button
          className="w-full justify-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-soft hover:opacity-95"
          onClick={async () => {
            if (!isAuthenticated) { navigate({ to: "/auth" }); return; }
            try {
              const thread = await createThread();
              await queryClient.invalidateQueries({ queryKey: ["threads"] });
              navigate({ to: "/chat/$threadId", params: { threadId: thread.id } });
            } catch {
              toast.error("Could not start a new conversation.");
            }
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" /> New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {!isAuthenticated ? (
          <p className="px-2 text-xs text-muted-foreground">Sign in to save and revisit your conversations.</p>
        ) : isLoading ? (
          <p className="px-2 text-xs text-muted-foreground">Loading…</p>
        ) : threads.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">No conversations yet.</p>
        ) : (
          threads.map((thread) => (
            <Link
              key={thread.id}
              to="/chat/$threadId"
              params={{ threadId: thread.id }}
              className={cn(
                "flex items-center gap-2 truncate rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                thread.id === activeId && "bg-accent font-medium text-foreground",
              )}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{thread.title}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
