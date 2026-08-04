import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, Clock, Siren,
  Users, UserSearch, Package, Car, Flame, TrendingUp,
} from "lucide-react";
import {
  incidentsQuery, officersQuery, missingPersonsQuery, lostFoundQuery,
  PRIORITY_META, statusLabel, timeAgo, type IncidentPriority,
} from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/")({
  component: CommandDashboard,
});

function CommandDashboard() {
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const { data: officers = [] } = useQuery(officersQuery);
  const { data: missing = [] } = useQuery(missingPersonsQuery);
  const { data: lostFound = [] } = useQuery(lostFoundQuery);

  const open = incidents.filter((i) => !["resolved", "closed"].includes(i.status));
  const critical = open.filter((i) => i.priority === "critical");
  const resolvedToday = incidents.filter(
    (i) => i.resolved_at && Date.now() - new Date(i.resolved_at).getTime() < 864e5,
  );
  const available = officers.filter(
    (o) => o.duty_status === "available" || o.duty_status === "on_duty",
  );
  const activeMissing = missing.filter((m) => m.status !== "found");
  const unclaimedLost = lostFound.filter((l) => l.status !== "claimed" && l.status !== "released");
  const accidents = open.filter(
    (i) => i.category?.toLowerCase().includes("accident") || i.category?.toLowerCase().includes("traffic"),
  );
  const investigating = open.filter(
    (i) => i.status === "assigned" || i.status === "under_review" || i.status === "dispatched",
  );

  // Avg response time (minutes)
  const avgResponse = (() => {
    const resolved = incidents.filter((i) => i.resolved_at && i.created_at);
    if (!resolved.length) return null;
    const total = resolved.reduce(
      (acc, i) => acc + (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()),
      0,
    );
    return Math.round(total / resolved.length / 60000);
  })();

  // Crime heat index: weighted score based on critical/high incidents in last 24h
  const heatIndex = (() => {
    const cutoff = Date.now() - 864e5;
    const recent = open.filter((i) => new Date(i.created_at).getTime() > cutoff);
    const score = recent.reduce((acc, i) => {
      if (i.priority === "critical") return acc + 4;
      if (i.priority === "high") return acc + 2;
      if (i.priority === "medium") return acc + 1;
      return acc + 0.5;
    }, 0);
    if (score === 0) return "Low";
    if (score < 5) return "Moderate";
    if (score < 15) return "High";
    return "Critical";
  })();

  const heatColor =
    heatIndex === "Critical" ? "text-primary" :
    heatIndex === "High" ? "text-alert" :
    heatIndex === "Moderate" ? "text-gold" : "text-success";

  // Open incidents by district for bar chart
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
      {/* KPI grid — 4 cols on desktop */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Critical Now"      value={critical.length}      icon={Siren}       tone="text-primary" />
        <Stat label="Open Incidents"    value={open.length}          icon={AlertTriangle} tone="text-alert" />
        <Stat label="Resolved (24h)"    value={resolvedToday.length} icon={CheckCircle2} tone="text-success" />
        <Stat label="Officers On Duty"  value={available.length}     icon={Users}       tone="text-gold" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Missing Persons"   value={activeMissing.length}  icon={UserSearch}  tone="text-alert" />
        <Stat label="Lost Property"     value={unclaimedLost.length}  icon={Package}     tone="text-gold" />
        <Stat label="Road Accidents"    value={accidents.length}      icon={Car}         tone="text-muted-foreground" />
        <Stat label="Under Investigation" value={investigating.length} icon={TrendingUp} tone="text-primary" />
      </div>

      {/* Bottom row: avg response + heat index */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="premium-surface col-span-1 rounded-3xl border border-border/55 p-4 shadow-soft lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Avg Response Time</p>
            <Clock className="h-4 w-4 text-success" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">
            {avgResponse != null ? `${avgResponse} min` : "—"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {avgResponse == null ? "Insufficient resolved cases" : avgResponse > 120 ? "Above 2-hour benchmark" : "Within target range"}
          </p>
        </div>
        <div className="premium-surface col-span-1 rounded-3xl border border-border/55 p-4 shadow-soft lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Crime Heat Index</p>
            <Flame className={cn("h-4 w-4", heatColor)} />
          </div>
          <p className={cn("mt-2 font-display text-3xl font-bold", heatColor)}>{heatIndex}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Based on last 24h critical/high incidents</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Live incident feed */}
        <section className="premium-surface rounded-3xl border border-border/55 p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Live Incident Feed</h2>
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
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", meta?.dot ?? "bg-border")} />
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

        {/* Open load by district */}
        <section className="premium-surface rounded-3xl border border-border/55 p-4 shadow-soft">
          <h2 className="mb-3 font-display text-sm font-semibold">Open Load by District</h2>
          <div className="space-y-2.5">
            {byDistrict.slice(0, 8).map(([district, count]) => (
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
