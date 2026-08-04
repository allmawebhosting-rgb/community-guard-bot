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

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-primary",
  high: "bg-primary/70",
  medium: "bg-gold",
  low: "bg-muted-foreground/50",
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

  const critical = (alerts ?? []).filter((a) => a.severity === "critical" || a.severity === "high");
  const other = (alerts ?? []).filter((a) => a.severity !== "critical" && a.severity !== "high");

  return (
    <AppShell title="Community alerts">
      <div className="mx-auto w-full max-w-6xl px-5 pt-6 pb-6 lg:px-10 lg:pt-8">

        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12">
            <Bell className="h-6 w-6 text-primary" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-black tracking-[-0.02em] lg:text-3xl">Safety Alerts</h1>
            <p className="text-[12px] text-muted-foreground lg:text-[13px]">Verified notices published for your community</p>
          </div>
          {!isLoading && alerts && (
            <span className="ml-auto rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-[12px] font-semibold text-muted-foreground">
              {alerts.length} active
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-36 animate-pulse rounded-[1.4rem] border border-border/50 bg-card/50" />
            ))}
          </div>
        ) : !alerts || alerts.length === 0 ? (
          <div className="rounded-[2rem] border border-border/60 bg-card/70 p-16 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <p className="mt-4 font-display text-lg font-bold">No active alerts</p>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Your area is quiet right now. Ask Allma anytime if something feels unsafe.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Critical / High section */}
            {critical.length > 0 && (
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/70">
                  ⚠️ Priority alerts
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {critical.map((alert) => (
                    <AlertCard key={alert.id} alert={alert} />
                  ))}
                </div>
              </div>
            )}

            {/* Other alerts */}
            {other.length > 0 && (
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60">
                  Community notices
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {other.map((alert) => (
                    <AlertCard key={alert.id} alert={alert} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function AlertCard({ alert }: { alert: { id: string; title: string; body: string; area: string | null; severity: string; alert_type: string; starts_at: string } }) {
  return (
    <article className="flex flex-col rounded-[1.4rem] border border-border/60 bg-card/80 p-5 shadow-soft backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-center gap-2">
        <span className={cn(
          "h-2 w-2 rounded-full shrink-0",
          SEVERITY_DOT[alert.severity] ?? "bg-muted-foreground/50",
        )} />
        <span className={cn(
          "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]",
          SEVERITY[alert.severity] ?? SEVERITY.low,
        )}>
          {alert.severity}
        </span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {alert.alert_type}
        </span>
      </div>
      <h2 className="mt-3 text-[15px] font-bold leading-snug">{alert.title}</h2>
      <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">{alert.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground/70">
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
  );
}
