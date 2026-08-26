import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  ChevronRight,
  FileText,
  Home,
  LogOut,
  MapPin,
  MessageSquare,
  Menu,
  Moon,
  Plus,
  Shield,
  Sun,
  UserRound,
  X,
  PhoneCall,
  Users,
  PackageSearch,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MascotAvatar } from "@/components/allma/mascot";
import { BrandLockup } from "@/components/allma/brand";
import { NotificationsBell } from "@/components/allma/notifications-bell";
import { ConnectionRequestsBanner } from "@/components/allma/safety-network/connection-requests-banner";
import { SosButton } from "@/components/allma/sos-button";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/lib/theme";
import { createThread, threadsQueryOptions } from "@/lib/threads";
import { QUICK_ACTIONS } from "@/lib/allma";
import { cn } from "@/lib/utils";

type TabPath = "/chat" | "/alerts" | "/reports" | "/profile" | "/calls" | "/lost-found";

const NAV_ITEMS: { label: string; to: TabPath; icon: typeof Home }[] = [
  { label: "Home", to: "/chat", icon: Home },
  { label: "Alerts", to: "/alerts", icon: Bell },
  { label: "Reports", to: "/reports", icon: FileText },
  { label: "Profile", to: "/profile", icon: UserRound },
  { label: "Emergency calls", to: "/calls", icon: PhoneCall },
  { label: "Lost & Found", to: "/lost-found", icon: PackageSearch },
];

/* ─── Desktop Sidebar ──────────────────────────────────────────────────── */
function DesktopSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { data: threads = [] } = useQuery({ ...threadsQueryOptions(), enabled: isAuthenticated });
  const isHome = pathname === "/chat" || pathname.startsWith("/chat/");

  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Guest";
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const newChat = async () => {
    if (!isAuthenticated) {
      navigate({ to: "/auth" });
      return;
    }
    try {
      const thread = await createThread();
      await queryClient.invalidateQueries({ queryKey: ["threads"] });
      navigate({ to: "/chat/$threadId", params: { threadId: thread.id } });
    } catch {
      toast.error("Could not start a new conversation.");
    }
  };

  return (
    <aside className="no-print hidden lg:flex lg:flex-col lg:w-[260px] lg:shrink-0 lg:border-r lg:border-border/60 lg:bg-sidebar lg:fixed lg:inset-y-0 lg:z-30 lg:overflow-hidden">
      {/* Top: Brand */}
      <div className="relative shrink-0 overflow-hidden px-5 pb-5 pt-5 border-b border-border/40">
        <div className="signal-streak pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative">
          <Link to="/chat">
            <BrandLockup />
          </Link>
        </div>
      </div>

      {/* Nav Links */}
      <nav className="shrink-0 px-3 pb-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.to === "/chat" ? isHome : pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-all",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
              {item.label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
            </Link>
          );
        })}
        <Link
          to="/nearby"
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-all",
            pathname === "/nearby"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <MapPin className="h-4 w-4 shrink-0" />
          Nearby Help
          {pathname === "/nearby" && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </Link>
        <Link
          to="/responder"
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-all",
            pathname === "/responder"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Users className="h-4 w-4 shrink-0" />
          Community responder
          {pathname === "/responder" && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
        </Link>
        <Link
          to="/police"
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-all",
            pathname === "/police" || pathname.startsWith("/police/")
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Shield className="h-4 w-4 shrink-0" />
          Police command
          {(pathname === "/police" || pathname.startsWith("/police/")) && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </Link>
      </nav>

      {/* New chat + thread list */}
      <div className="flex min-h-0 flex-1 flex-col border-t border-border/40 px-3 py-3 overflow-hidden">
        <button
          type="button"
          onClick={newChat}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-card/50 py-2 text-[12.5px] font-semibold text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> New conversation
        </button>

        <p className="mb-1.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50">
          Recent
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-0.5 scrollbar-thin">
          {!isAuthenticated ? (
            <p className="px-2 pt-4 text-center text-[12px] text-muted-foreground/60">
              Sign in to keep conversations
            </p>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-center gap-2 pt-6 text-center">
              <MessageSquare className="h-6 w-6 text-muted-foreground/25" />
              <p className="text-[12px] text-muted-foreground/60">No conversations yet</p>
            </div>
          ) : (
            threads.slice(0, 20).map((thread) => (
              <Link
                key={thread.id}
                to="/chat/$threadId"
                params={{ threadId: thread.id }}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] transition-all group",
                  pathname === `/chat/${thread.id}`
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="truncate">{thread.title}</span>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Bottom: user + theme */}
      <div className="shrink-0 border-t border-border/40 p-3">
        {isAuthenticated ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-card/50 px-3 py-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-[11px] font-bold text-primary-foreground">
              {initials || "A"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold leading-tight">{name}</p>
              <p className="text-[10px] text-muted-foreground">Community member</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Toggle theme"
                onClick={toggleTheme}
                className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {theme === "dark" ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                aria-label="Sign out"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/", replace: true });
                }}
                className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" className="flex-1 rounded-xl text-[12.5px]" asChild>
              <Link to="/auth">
                <UserRound className="mr-1.5 h-3.5 w-3.5" />
                Sign in
              </Link>
            </Button>
            <button
              type="button"
              aria-label="Toggle theme"
              onClick={toggleTheme}
              className="grid h-8 w-8 place-items-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {theme === "dark" ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ─── Mobile side drawer ───────────────────────────────────────────────── */
function SideDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: threads = [] } = useQuery({
    ...threadsQueryOptions(),
    enabled: isAuthenticated && open,
  });
  const [tab, setTab] = useState<"menu" | "chats">("menu");

  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Guest";
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const startPrompt = (prompt: string) => {
    onClose();
    navigate({ to: "/chat", search: { q: prompt } });
  };

  const newChat = async () => {
    if (!isAuthenticated) {
      onClose();
      navigate({ to: "/auth" });
      return;
    }
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
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={onClose}
          />
          <motion.aside
            key="panel"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-sm flex-col border-r border-border/60 bg-sidebar pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] lg:hidden"
          >
            <div className="relative shrink-0 overflow-hidden px-5 pb-4 pt-5">
              <div className="signal-streak pointer-events-none absolute inset-0" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <MascotAvatar className="h-11 w-11" />
                  <div className="min-w-0 leading-tight">
                    <p className="brand-gradient-text truncate font-display text-[15px] font-black">
                      ALLMA
                    </p>
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Safety AI
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close menu"
                  className="grid h-8 w-8 place-items-center rounded-full bg-card text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {isAuthenticated ? (
                <div className="relative mt-4 flex items-center gap-3 rounded-2xl border border-border/60 bg-card/80 px-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-[11px] font-bold text-primary-foreground">
                    {initials || "A"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{name}</p>
                    <p className="text-[10px] text-muted-foreground">Community member</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Sign out"
                    onClick={async () => {
                      await signOut();
                      onClose();
                      navigate({ to: "/", replace: true });
                    }}
                    className="grid h-7 w-7 place-items-center rounded-full bg-background/60 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  className="relative mt-4 w-full rounded-2xl"
                  size="sm"
                  asChild
                  onClick={onClose}
                >
                  <Link to="/auth">
                    <UserRound className="mr-1.5 h-4 w-4" /> Sign in to save reports
                  </Link>
                </Button>
              )}
            </div>

            <div className="flex shrink-0 gap-4 border-b border-border/60 px-5">
              {(["menu", "chats"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn(
                    "border-b-2 pb-2 text-[13px] font-semibold capitalize transition-colors",
                    tab === key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground",
                  )}
                >
                  {key}
                </button>
              ))}
            </div>

            {tab === "menu" ? (
              <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.to === "/chat"
                      ? pathname === "/chat" || pathname.startsWith("/chat/")
                      : pathname === item.to;

                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-accent",
                        active ? "bg-primary/10 text-primary" : "text-foreground",
                      )}
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/12">
                        <Icon className="h-4 w-4 text-primary" />
                      </span>
                      <span className="flex-1 text-[13px] font-medium">{item.label}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </Link>
                  );
                })}
                <Link
                  to="/police"
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-accent",
                    pathname === "/police" || pathname.startsWith("/police/")
                      ? "bg-primary/10 text-primary"
                      : "text-foreground",
                  )}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/12">
                    <Shield className="h-4 w-4 text-primary" />
                  </span>
                  <span className="flex-1 text-[13px] font-medium">Police command</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                </Link>
                <Link
                  to="/nearby"
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-accent"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/12">
                    <MapPin className="h-4 w-4 text-primary" />
                  </span>
                  <span className="flex-1 text-[13px] font-medium">Nearby help</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                </Link>
                <Link
                  to="/responder"
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-accent",
                    pathname === "/responder" ? "bg-primary/10 text-primary" : "text-foreground",
                  )}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/12">
                    <Users className="h-4 w-4 text-primary" />
                  </span>
                  <span className="flex-1 text-[13px] font-medium">Community responder</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                </Link>
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => startPrompt(action.prompt)}
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-accent"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-card text-base">
                      {action.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{action.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {action.description}
                      </span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                  </button>
                ))}
              </nav>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col p-3">
                <button
                  type="button"
                  onClick={newChat}
                  className="mb-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-glow py-2.5 text-[13px] font-semibold text-primary-foreground shadow-soft"
                >
                  <Plus className="h-4 w-4" /> New chat
                </button>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                  {!isAuthenticated ? (
                    <p className="px-2 pt-6 text-center text-sm text-muted-foreground">
                      Sign in to keep your conversations.
                    </p>
                  ) : threads.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 pt-8 text-center">
                      <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No conversations yet.</p>
                    </div>
                  ) : (
                    threads.map((thread) => (
                      <Link
                        key={thread.id}
                        to="/chat/$threadId"
                        params={{ threadId: thread.id }}
                        onClick={onClose}
                        className="block truncate rounded-xl px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        {thread.title}
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

/* ─── AppShell ─────────────────────────────────────────────────────────── */
export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAuthenticated } = useAuth();
  const isChat = pathname === "/" || pathname === "/chat" || pathname.startsWith("/chat/");


  useEffect(() => {
    document.documentElement.classList.toggle("viewport-locked", isChat);
    document.body.classList.toggle("viewport-locked", isChat);

    return () => {
      document.documentElement.classList.remove("viewport-locked");
      document.body.classList.remove("viewport-locked");
    };
  }, [isChat]);

  return (
    <div
      className={cn(
        "relative flex w-full min-w-0 overflow-x-hidden bg-background",
        isChat ? "h-[100dvh] max-h-[100dvh] overflow-hidden" : "min-h-[100dvh]",
      )}
    >
      <div className="signal-streak pointer-events-none fixed inset-0 -z-10 opacity-70" />

      {/* Desktop persistent sidebar */}
      <DesktopSidebar />

      {/* Content column — shifts right on desktop to clear the sidebar */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col lg:ml-[260px]",
          isChat ? "min-h-0 overflow-hidden" : "min-h-[100dvh]",
        )}
      >
        {/* Mobile-only header */}
        <header className="no-print sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur-xl lg:hidden">
          <div className="mx-auto grid h-14 w-full max-w-2xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:gap-3 sm:px-4">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Menu className="h-[18px] w-[18px]" />
            </button>

            <div className="flex min-w-0 items-center justify-center gap-2.5">
              <MascotAvatar className="h-8 w-8" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-semibold">{title ?? "Allma Safety AI"}</p>
                <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="online-pulse inline-block h-1.5 w-1.5 rounded-full bg-success" />{" "}
                  Online
                </p>
              </div>
            </div>

            {isAuthenticated ? (
              <NotificationsBell />
            ) : (
              <span className="h-9 w-9" aria-hidden="true" />
            )}
          </div>

        </header>

        {/* Desktop top bar — branding strip + status */}
        <header className="no-print sticky top-0 z-30 hidden border-b border-border/40 bg-background/80 backdrop-blur-xl lg:flex">
          <div className="flex h-13 w-full items-center justify-between gap-4 px-6">
            <div className="flex items-center gap-2.5">
              <span className="online-pulse inline-block h-2 w-2 rounded-full bg-success" />
              <span className="text-[13px] font-semibold text-foreground/80">
                {title ?? "Allma Safety AI"}
              </span>
              <span className="text-[12px] text-muted-foreground">— Online & ready</span>
            </div>
            <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-1.5 rounded-full border border-border/50 bg-card/50 px-3 py-1">
                🇺🇬 Uganda Coverage
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-border/50 bg-card/50 px-3 py-1">
                🔒 End-to-end encrypted
              </span>
              {isAuthenticated && <NotificationsBell />}
            </div>
          </div>
        </header>

        {isAuthenticated && <ConnectionRequestsBanner />}

        {/* Main content — no max-w constraint; children control their own width */}
        <main className={cn("flex min-h-0 flex-1 flex-col", isChat && "overflow-hidden")}>

          {children}
        </main>
      </div>

      {/* Mobile drawer */}
      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* One emergency control shared by every app-shell screen. */}
      <SosButton />

      {/* The call overlay + ZEGOCLOUD RTC session is mounted once in __root. */}

    </div>
  );
}
