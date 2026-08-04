import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, Clock,
  Siren, Users, UserSearch, Package, Car, Flame, TrendingUp,
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
    (i) => ["assigned", "under_review", "dispatched"].includes(i.status),
  );

  const avgResponse = (() => {
    const resolved = incidents.filter((i) => i.resolved_at && i.created_at);
    if (!resolved.length) return null;
    const total = resolved.reduce(
      (acc, i) => acc + (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()),
      0,
    );
    return Math.round(total / resolved.length / 60000);
  })();

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
    heatIndex === "High"     ? "text-alert" :
    heatIndex === "Moderate" ? "text-gold"  : "text-success";

  const byDistrict = Object.entries(
    open.reduce<Record<string, number>>((acc, i) => {
      const key = i.district ?? "Unassigned";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const maxDistrict = byDistrict[0]?.[1] ?? 1;

  return (
    <div className="w-full space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-base font-semibold">Command Overview</h1>
        <span className="text-[11px] text-muted-foreground">
          {new Date().toLocaleDateString("en-UG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </span>
      </div>

      {/* KPIs — 5 col on xl, 4 on lg, 2 on mobile */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
        <Stat label="Critical"          value={critical.length}       icon={Siren}         tone="text-primary"          />
        <Stat label="Open Incidents"    value={open.length}           icon={AlertTriangle}  tone="text-alert"            />
        <Stat label="Resolved (24h)"    value={resolvedToday.length}  icon={CheckCircle2}   tone="text-success"          />
        <Stat label="Officers On Duty"  value={available.length}      icon={Users}          tone="text-gold"             />
        <Stat label="Investigating"     value={investigating.length}  icon={TrendingUp}     tone="text-primary"          className="hidden xl:block" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
        <Stat label="Missing Persons"   value={activeMissing.length}  icon={UserSearch}     tone="text-alert"            />
        <Stat label="Lost Property"     value={unclaimedLost.length}  icon={Package}        tone="text-gold"             />
        <Stat label="Road Accidents"    value={accidents.length}      icon={Car}            tone="text-muted-foreground" />
        <div className="card-desktop col-span-1">
          <p className="label-xs">Avg Response</p>
          <p className={cn("mt-1.5 font-display text-2xl font-bold tabular-nums")}>
            {avgResponse != null ? `${avgResponse}m` : "—"}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {avgResponse == null ? "No data yet" : avgResponse > 120 ? "Above target" : "On target"}
          </p>
        </div>
        <div className="card-desktop col-span-1">
          <p className="label-xs">Heat Index</p>
          <p className={cn("mt-1.5 font-display text-2xl font-bold", heatColor)}>{heatIndex}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground flex items-center gap-1">
            <Flame className={cn("h-2.5 w-2.5", heatColor)} />
            Last 24h activity
          </p>
        </div>
      </div>

      {/* Main grid — wider feed, narrower sidebar panel */}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_340px]">
        {/* Live feed */}
        <section className="card-desktop overflow-hidden">
          <div className="mb-3 flex items-center justify-between border-b border-border/40 pb-3">
            <h2 className="text-[13px] font-semibold">Live Incident Feed</h2>
            <Link
              to="/police/incidents"
              className="flex items-center gap-1 text-[11px] text-muted-foreground transition hover:text-foreground"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border/30">
            {open.slice(0, 10).map((incident) => {
              const meta = PRIORITY_META[incident.priority as IncidentPriority];
              return (
                <Link
                  key={incident.id}
                  to="/police/cases/$caseId"
                  params={{ caseId: incident.id }}
                  className="group flex items-start gap-3 py-2.5 transition hover:bg-secondary/20 -mx-4 px-4"
                >
                  <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", meta?.dot ?? "bg-border")} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium leading-snug">{incident.title}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-mono">{incident.reference}</span>
                      {incident.district && <><span className="text-border/60">·</span><span>{incident.district}</span></>}
                      <span className="text-border/60">·</span>
                      <span>{statusLabel(incident.status)}</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(incident.created_at)}</span>
                </Link>
              );
            })}
            {open.length === 0 && (
              <p className="py-10 text-center text-[13px] text-muted-foreground">No open incidents.</p>
            )}
          </div>
        </section>

        {/* Right column */}
        <div className="space-y-4">
          {/* Open by district */}
          <section className="card-desktop">
            <h2 className="mb-3 border-b border-border/40 pb-3 text-[13px] font-semibold">Load by District</h2>
            <div className="space-y-2">
              {byDistrict.slice(0, 8).map(([district, count]) => (
                <div key={district} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-[11px] text-muted-foreground">{district}</span>
                  <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-border/30">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-gold transition-all"
                      style={{ width: `${(count / maxDistrict) * 100}%` }}
                    />
                  </div>
                  <span className="w-5 shrink-0 text-right text-[11px] font-medium tabular-nums">{count}</span>
                </div>
              ))}
              {byDistrict.length === 0 && (
                <p className="py-4 text-center text-[13px] text-muted-foreground">Nothing open.</p>
              )}
            </div>
          </section>

          {/* Officers on duty */}
          <section className="card-desktop">
            <div className="mb-3 flex items-center justify-between border-b border-border/40 pb-3">
              <h2 className="text-[13px] font-semibold">Officers on Duty</h2>
              <Link to="/police/officers" className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                All <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-border/30">
              {available.slice(0, 5).map((off) => (
                <div key={off.id} className="flex items-center gap-2.5 py-2">
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/40 to-gold/40 text-[9px] font-bold text-foreground">
                    {(off.full_name || "O").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium leading-none">{off.full_name || "Officer"}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground capitalize">{off.duty_status?.replace(/_/g, " ")}</p>
                  </div>
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                </div>
              ))}
              {available.length === 0 && (
                <p className="py-4 text-center text-[12px] text-muted-foreground">No officers on duty.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label, value, icon: Icon, tone, className,
}: {
  label: string;
  value: number;
  icon: typeof Siren;
  tone: string;
  className?: string;
}) {
  return (
    <div className={cn("card-desktop", className)}>
      <div className="flex items-center justify-between">
        <p className="label-xs">{label}</p>
        <Icon className={cn("h-3.5 w-3.5", tone)} />
      </div>
      <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
