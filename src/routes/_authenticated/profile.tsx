import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bell, ChevronRight, FileText, LogOut, MapPin, MessageSquare,
  Moon, Shield, Sun, UserRound,
} from "lucide-react";
import { AppShell } from "@/components/allma/app-shell";
import { MascotAvatar } from "@/components/allma/mascot";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/lib/theme";
import { DISCLAIMER } from "@/lib/allma";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile — Allma Safety AI" },
      {
        name: "description",
        content: "Manage your Allma Safety AI account, review your reporting activity and app preferences.",
      },
      { property: "og:title", content: "My profile — Allma Safety AI" },
      { property: "og:description", content: "Manage your account, activity and preferences in Allma Safety AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfileScreen,
});

function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["profile-stats"],
    queryFn: async () => {
      const [reports, emergencies] = await Promise.all([
        supabase.from("reports").select("id", { count: "exact", head: true }),
        supabase.from("reports").select("id", { count: "exact", head: true }).eq("report_type", "emergency"),
      ]);
      return { reports: reports.count ?? 0, emergencies: emergencies.count ?? 0 };
    },
  });

  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Community member";
  const initials = name.split(" ").map((p: string) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <AppShell title="Profile">
      <div className="mx-auto w-full max-w-6xl px-5 pb-6 pt-6 lg:px-10 lg:pt-8">

        {/* Page header */}
        <h1 className="mb-6 font-display text-2xl font-black tracking-[-0.02em] lg:text-3xl">My Profile</h1>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start">

          {/* Left column: user card + stats */}
          <div className="space-y-4">
            {/* User card */}
            <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card/80 p-6 shadow-soft backdrop-blur-sm">
              <div className="absolute inset-0 hero-glow opacity-40 pointer-events-none" />
              <div className="relative flex flex-col items-center gap-4 text-center">
                <MascotAvatar className="h-20 w-20" />
                <div>
                  <p className="font-display text-[19px] font-black tracking-[-0.02em]">{name}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{user?.email}</p>
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-3 py-1 text-[11px] font-semibold text-muted-foreground">
                    <UserRound className="h-3 w-3" /> Community member
                  </span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[1.4rem] border border-border/60 bg-card/70 p-5 text-center">
                <p className="font-display text-3xl font-black text-primary">{stats?.reports ?? 0}</p>
                <p className="mt-1 text-[11.5px] font-semibold text-muted-foreground">Reports filed</p>
              </div>
              <div className="rounded-[1.4rem] border border-gold/25 bg-gold/[0.07] p-5 text-center">
                <p className="font-display text-3xl font-black text-gold">{stats?.emergencies ?? 0}</p>
                <p className="mt-1 text-[11.5px] font-semibold text-muted-foreground">Emergencies raised</p>
              </div>
            </div>

            {/* Account info */}
            <div className="rounded-[1.4rem] border border-border/60 bg-card/70 p-4">
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Account</p>
              <div className="space-y-2 text-[13px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium truncate max-w-[160px]">{user?.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Member since</span>
                  <span className="font-medium">
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString("en-UG", { month: "short", year: "numeric" }) : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right column: navigation + actions */}
          <div className="space-y-4">
            {/* Quick links */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Quick links</p>
              <nav className="overflow-hidden rounded-[1.4rem] border border-border/60 bg-card/70">
                {[
                  { to: "/chat", icon: MessageSquare, label: "Start a conversation", desc: "Chat with Allma Safety AI" },
                  { to: "/reports", icon: FileText, label: "My reports", desc: "View your filed cases and references" },
                  { to: "/alerts", icon: Bell, label: "Community alerts", desc: "Live safety notices for your area" },
                  { to: "/nearby", icon: MapPin, label: "Nearby help", desc: "Find hospitals and police stations" },
                  { to: "/police", icon: Shield, label: "Police command center", desc: "For verified officers only" },
                ].map(({ to, icon: Icon, label, desc }, idx, arr) => (
                  <Link
                    key={to}
                    to={to as "/chat"}
                    className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent ${idx < arr.length - 1 ? "border-b border-border/50" : ""}`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold">{label}</span>
                      <span className="block text-[11.5px] text-muted-foreground">{desc}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  </Link>
                ))}
              </nav>
            </div>

            {/* Preferences */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Preferences</p>
              <div className="overflow-hidden rounded-[1.4rem] border border-border/60 bg-card/70">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex w-full items-center gap-4 border-b border-border/50 px-5 py-4 text-left transition-colors hover:bg-accent"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-card">
                    {theme === "dark" ? <Sun className="h-4 w-4 text-gold" /> : <Moon className="h-4 w-4 text-primary" />}
                  </span>
                  <div className="flex-1">
                    <span className="block text-[13.5px] font-semibold">{theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}</span>
                    <span className="block text-[11.5px] text-muted-foreground">Currently: {theme === "dark" ? "Dark" : "Light"}</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    navigate({ to: "/", replace: true });
                  }}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left text-destructive transition-colors hover:bg-destructive/5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-destructive/10">
                    <LogOut className="h-4 w-4 text-destructive" />
                  </span>
                  <div className="flex-1">
                    <span className="block text-[13.5px] font-semibold">Sign out</span>
                    <span className="block text-[11.5px] text-destructive/70">You will be returned to the homepage</span>
                  </div>
                </button>
              </div>
            </div>

            <p className="text-[10px] leading-relaxed text-muted-foreground/55">{DISCLAIMER}</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
