import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronRight, FileText, LogOut, MapPin, Moon, Sun } from "lucide-react";
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

  return (
    <AppShell title="Profile">
      <div className="px-4 pb-6 pt-5">
        <div className="flex items-center gap-3.5 rounded-[1.5rem] border border-border/60 bg-card/80 p-4 shadow-soft backdrop-blur-sm">
          <MascotAvatar className="h-14 w-14" />
          <div className="min-w-0">
            <p className="truncate font-display text-[17px] font-black tracking-[-0.02em]">{name}</p>
            <p className="truncate text-[11.5px] text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-[1.4rem] border border-border/60 bg-card/70 p-4">
            <p className="font-display text-2xl font-black text-primary">{stats?.reports ?? 0}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Reports filed</p>
          </div>
          <div className="rounded-[1.4rem] border border-gold/25 bg-gold/[0.07] p-4">
            <p className="font-display text-2xl font-black text-gold">{stats?.emergencies ?? 0}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Emergencies raised</p>
          </div>
        </div>

        <nav className="mt-3 overflow-hidden rounded-[1.4rem] border border-border/60 bg-card/70">
          <Link to="/reports" className="flex items-center gap-3 border-b border-border/50 px-4 py-3.5 hover:bg-accent">
            <FileText className="h-4 w-4 text-primary" />
            <span className="flex-1 text-[13px] font-medium">My reports</span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          </Link>
          <Link to="/alerts" className="flex items-center gap-3 border-b border-border/50 px-4 py-3.5 hover:bg-accent">
            <Bell className="h-4 w-4 text-primary" />
            <span className="flex-1 text-[13px] font-medium">Community alerts</span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          </Link>
          <Link to="/nearby" className="flex items-center gap-3 border-b border-border/50 px-4 py-3.5 hover:bg-accent">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="flex-1 text-[13px] font-medium">Nearby help</span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 border-b border-border/50 px-4 py-3.5 text-left hover:bg-accent"
          >
            {theme === "dark" ? <Sun className="h-4 w-4 text-gold" /> : <Moon className="h-4 w-4 text-primary" />}
            <span className="flex-1 text-[13px] font-medium">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate({ to: "/", replace: true });
            }}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-primary hover:bg-accent"
          >
            <LogOut className="h-4 w-4" />
            <span className="flex-1 text-[13px] font-semibold">Sign out</span>
          </button>
        </nav>

        <p className="mt-5 text-center text-[10px] leading-relaxed text-muted-foreground/55">{DISCLAIMER}</p>
      </div>
    </AppShell>
  );
}
