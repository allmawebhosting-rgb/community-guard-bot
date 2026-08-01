import { useState, type ReactNode } from "react";
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
  Plus,
  Siren,
  UserRound,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MascotAvatar } from "@/components/allma/mascot";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { createThread, threadsQueryOptions } from "@/lib/threads";
import { QUICK_ACTIONS } from "@/lib/allma";
import { cn } from "@/lib/utils";

type TabPath = "/chat" | "/alerts" | "/sos" | "/reports" | "/profile";

const TABS: { label: string; to: TabPath; icon: typeof Home }[] = [
  { label: "Home", to: "/chat", icon: Home },
  { label: "Alerts", to: "/alerts", icon: Bell },
  { label: "Reports", to: "/reports", icon: FileText },
  { label: "Profile", to: "/profile", icon: UserRound },
];

function BottomTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/chat" || pathname.startsWith("/chat/");


  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl">
      <div className="mx-auto grid h-[4.5rem] w-full max-w-2xl grid-cols-5 items-center px-2 pb-[env(safe-area-inset-bottom)]">
        {TABS.slice(0, 2).map((tab) => (
          <TabLink key={tab.to} tab={tab} active={tab.to === "/" ? isHome : pathname === tab.to} />
        ))}

        <div className="relative grid place-items-center">
          <Link
            to="/sos"
            aria-label="Emergency SOS"
            className={cn(
              "sos-pulse -mt-7 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow font-display text-[13px] font-black tracking-[0.08em] text-primary-foreground shadow-lift ring-4 ring-background transition-transform active:scale-95",
              pathname === "/sos" && "ring-primary/40",
            )}
          >
            SOS
          </Link>
        </div>

        {TABS.slice(2).map((tab) => (
          <TabLink key={tab.to} tab={tab} active={pathname === tab.to} />
        ))}
      </div>
    </nav>
  );
}

function TabLink({ tab, active }: { tab: (typeof TABS)[number]; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      to={tab.to}
      className={cn(
        "flex flex-col items-center gap-1 py-2 text-[10.5px] font-semibold transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className={cn("h-[19px] w-[19px]", active && "drop-shadow-[0_0_10px_color-mix(in_oklab,var(--color-primary)_70%,transparent)]")} />
      {tab.label}
    </Link>
  );
}

function SideDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, signOut } = useAuth();
  const { data: threads = [] } = useQuery({ ...threadsQueryOptions(), enabled: isAuthenticated && open });
  const [tab, setTab] = useState<"menu" | "chats">("menu");

  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Guest";
  const initials = name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const startPrompt = (prompt: string) => {
    onClose();
    navigate({ to: "/", search: { q: prompt } });
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
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            key="panel"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-sm flex-col border-r border-border/60 bg-sidebar"
          >
            <div className="relative shrink-0 overflow-hidden px-5 pb-4 pt-5">
              <div className="signal-streak pointer-events-none absolute inset-0" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <MascotAvatar className="h-11 w-11" />
                  <div className="min-w-0 leading-tight">
                    <p className="brand-gradient-text truncate font-display text-[15px] font-black">ALLMA</p>
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
                <Button className="relative mt-4 w-full rounded-2xl" size="sm" asChild onClick={onClose}>
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
                    tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground",
                  )}
                >
                  {key}
                </button>
              ))}
            </div>

            {tab === "menu" ? (
              <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
                <Link to="/nearby" onClick={onClose} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-accent">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/12">
                    <MapPin className="h-4 w-4 text-primary" />
                  </span>
                  <span className="flex-1 text-[13px] font-medium">Nearby help</span>
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
                      <span className="block truncate text-[11px] text-muted-foreground">{action.description}</span>
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

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="signal-streak pointer-events-none fixed inset-0 -z-10 opacity-70" />

      <header className="no-print sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto grid h-14 w-full max-w-2xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4">
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
                <span className="online-pulse inline-block h-1.5 w-1.5 rounded-full bg-success" /> Online
              </p>
            </div>
          </div>

          <Link
            to="/profile"
            aria-label="Profile"
            className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Siren className="h-[18px] w-[18px] text-primary" />
          </Link>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col pb-[5.5rem]">{children}</main>

      <BottomTabs />
      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
