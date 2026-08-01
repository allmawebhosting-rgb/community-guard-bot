import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, Clock, MapPin } from "lucide-react";
import { AppShell } from "@/components/allma/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Community safety alerts — Allma Safety AI" },
      {
        name: "description",
        content:
          "Live community safety alerts for your area: crime warnings, weather, road and health notices, published for Uganda communities.",
      },
      { property: "og:title", content: "Community safety alerts — Allma Safety AI" },
      {
        property: "og:description",
        content: "Live crime, weather, road and health safety alerts near you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AlertsScreen,
});

const SEVERITY: Record<string, string> = {
  critical: "border-primary/50 bg-primary/12 text-primary",
  high: "border-primary/40 bg-primary/10 text-primary",
  medium: "border-gold/40 bg-gold/10 text-gold",
  low: "border-border/60 bg-card/70 text-muted-foreground",
};

function AlertsScreen() {
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["community-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_alerts")
        .select("id, title, body, area, severity, alert_type, starts_at")
        .eq("is_published", true)
        .order("starts_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell title="Community alerts">
      <div className="px-4 pt-5">
        <header className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/12">
            <Bell className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-black tracking-[-0.02em]">Safety alerts</h1>
            <p className="text-[11.5px] text-muted-foreground">Verified notices published for your community</p>
          </div>
        </header>

        <div className="mt-5 space-y-3 pb-6">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-[1.4rem] border border-border/50 bg-card/50" />
            ))
          ) : !alerts || alerts.length === 0 ? (
            <div className="rounded-[1.4rem] border border-border/60 bg-card/70 p-8 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-semibold">No active alerts</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Your area is quiet right now. Ask Allma anytime if something feels unsafe.
              </p>
            </div>
          ) : (
            alerts.map((alert) => (
              <article
                key={alert.id}
                className="rounded-[1.4rem] border border-border/60 bg-card/80 p-4 shadow-soft backdrop-blur-sm"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]",
                      SEVERITY[alert.severity] ?? SEVERITY.low,
                    )}
                  >
                    {alert.severity}
                  </span>
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {alert.alert_type}
                  </span>
                </div>
                <h2 className="mt-2.5 text-[15px] font-bold leading-snug">{alert.title}</h2>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{alert.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground/80">
                  {alert.area && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" /> {alert.area}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3" /> {new Date(alert.starts_at).toLocaleString()}
                  </span>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
