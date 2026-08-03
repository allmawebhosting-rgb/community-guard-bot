import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock, Siren } from "lucide-react";
import {
  incidentsQuery,
  officersQuery,
  PRIORITY_META,
  statusLabel,
  timeAgo,
  type IncidentPriority,
} from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/")({
  component: CommandDashboard,
});

function CommandDashboard() {
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const { data: officers = [] } = useQuery(officersQuery);

  const open = incidents.filter((i) => !["resolved", "closed"].includes(i.status));
  const critical = open.filter((i) => i.priority === "critical");
  const resolvedToday = incidents.filter(
    (i) => i.resolved_at && Date.now() - new Date(i.resolved_at).getTime() < 864e5,
  );
  const available = officers.filter((o) => o.duty_status === "available" || o.duty_status === "on_duty");

  const byDistrict = Object.entries(
    open.reduce<Record<string, number>>((acc, i) => {
      const key = i.district ?? "Unassigned";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const maxDistrict = byDistrict[0]?.[1] ?? 1;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Critical now" value={critical.length} icon={Siren} tone="text-primary" />
        <Stat label="Open incidents" value={open.length} icon={AlertTriangle} tone="text-alert" />
        <Stat label="Resolved (24h)" value={resolvedToday.length} icon={CheckCircle2} tone="text-success" />
        <Stat label="Officers on duty" value={available.length} icon={Clock} tone="text-gold" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="premium-surface rounded-3xl border border-border/55 p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Live incident feed</h2>
            <Link
              to="/police/incidents"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {open.slice(0, 8).map((incident) => {
              const meta = PRIORITY_META[incident.priority as IncidentPriority];
              return (
                <Link
                  key={incident.id}
                  to="/police/cases/$caseId"
                  params={{ caseId: incident.id }}
                  className="block rounded-2xl border border-border/50 bg-secondary/35 px-4 py-3 transition hover:border-border"
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{incident.title}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {timeAgo(incident.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 truncate pl-4 text-[11px] text-muted-foreground">
                    {incident.location_text ?? incident.district ?? "Location unknown"} ·{" "}
                    {statusLabel(incident.status)} · {incident.reference}
                  </p>
                </Link>
              );
            })}
            {open.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No open incidents.</p>
            )}
          </div>
        </section>

        <section className="premium-surface rounded-3xl border border-border/55 p-4 shadow-soft">
          <h2 className="mb-3 font-display text-sm font-semibold">Open load by district</h2>
          <div className="space-y-2.5">
            {byDistrict.map(([district, count]) => (
              <div key={district}>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">{district}</span>
                  <span className="font-medium">{count}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-border/40">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-gold"
                    style={{ width: `${(count / maxDistrict) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {byDistrict.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing open.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Siren;
  tone: string;
}) {
  return (
    <div className="premium-surface rounded-3xl border border-border/55 p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <Icon className={cn("h-4 w-4", tone)} />
      </div>
      <p className="mt-2 font-display text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
