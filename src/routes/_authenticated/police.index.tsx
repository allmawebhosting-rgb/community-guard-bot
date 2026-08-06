import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, Clock,
  Siren, Users, UserSearch, Package, Car, Flame, TrendingUp,
  BrainCircuit, ChevronRight, ShieldCheck, Sparkles,
} from "lucide-react";
import {
  incidentsQuery, officersQuery, missingPersonsQuery, lostFoundQuery, safetyActivityQuery,
  PRIORITY_META, statusLabel, timeAgo, type IncidentPriority, myOfficerQuery,
} from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/")({
  component: CommandDashboard,
});

function CommandDashboard() {
  const qc = useQueryClient();
  const { data: officer } = useQuery(myOfficerQuery);
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const { data: officers = [] } = useQuery(officersQuery);
  const { data: missing = [] } = useQuery(missingPersonsQuery);
  const { data: lostFound = [] } = useQuery(lostFoundQuery);
  const { data: activity = [] } = useQuery(safetyActivityQuery);

  useEffect(() => {
    const channel = supabase
      .channel("police-command-activity-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "safety_activity" }, () => {
        qc.invalidateQueries({ queryKey: ["police", "safety-activity"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

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
  const recentlyReported = [...open]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 4);
  const firstName = officer?.full_name?.split(" ").filter(Boolean)[0] ?? "Officer";

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

      {/* Allma officer briefing */}
      <section className="relative isolate overflow-hidden rounded-[1.75rem] border border-primary/25 bg-[radial-gradient(circle_at_82%_15%,hsl(var(--gold)/.2),transparent_27%),linear-gradient(135deg,hsl(var(--primary)/.2),hsl(var(--card)/.96)_62%)] p-5 shadow-lift lg:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border border-gold/20 bg-gold/[0.04] blur-[1px]" />
        <div className="pointer-events-none absolute bottom-0 right-16 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-5 flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-2xl border border-primary/30 bg-background/45 shadow-soft backdrop-blur">
                <Sparkles className="h-4 w-4 text-gold" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">Allma intelligence brief</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Your command center is ready</p>
              </div>
            </div>
            <h2 className="max-w-xl font-display text-2xl font-black tracking-[-0.04em] text-foreground sm:text-3xl lg:text-[2.55rem]">
              Welcome back, {firstName}.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              I’ve reviewed the command queue. Start with the cases that need immediate attention, then move through the latest citizen reports.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link
                to="/police/ai"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-lift transition hover:-translate-y-0.5"
              >
                <BrainCircuit className="h-3.5 w-3.5" /> Ask Allma
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-success/25 bg-success/10 px-3.5 py-2 text-[11px] font-medium text-success">
                <ShieldCheck className="h-3.5 w-3.5" /> Secure officer view
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-[270px]">
            <BriefMetric label="Needs attention" value={critical.length} tone="critical" />
            <BriefMetric label="Newly reported" value={recentlyReported.length} tone="reported" />
          </div>
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-3">
        <Siren className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="text-xs font-semibold text-foreground">Police integration-ready queue</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            AI intake, SOS activations, locations, evidence signals, and submitted reports appear here for verified officers.
            This workspace does not contact or represent an official emergency service.
          </p>
        </div>
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

      {/* Priority briefing lanes */}
      <div className="grid gap-4 xl:grid-cols-2">
        <PriorityLane
          title="Critical cases"
          description="Immediate review recommended"
          icon={Siren}
          tone="critical"
          incidents={critical.slice(0, 4)}
          empty="No critical cases in the open queue."
        />
        <PriorityLane
          title="Latest reports"
          description="Most recent citizen submissions"
          icon={AlertTriangle}
          tone="reported"
          incidents={recentlyReported}
          empty="No reports have arrived yet."
        />
      </div>

      <section className="card-desktop overflow-hidden">
        <div className="mb-3 flex items-center justify-between border-b border-border/40 pb-3">
          <div>
            <h2 className="text-[13px] font-semibold">Live Citizen Activity</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">AI and SOS events before or alongside formal reports</p>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Live
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {activity.slice(0, 8).map((event) => (
            <div key={event.id} className="rounded-2xl border border-border/40 bg-secondary/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold">{event.title}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{event.summary}</p>
                </div>
                <span className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                  event.severity === "critical" ? "bg-primary/12 text-primary" :
                  event.severity === "high" ? "bg-alert/12 text-alert" :
                  "bg-secondary text-muted-foreground",
                )}>
                  {event.severity}
                </span>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {event.location_text ?? "Location not shared"} · {timeAgo(event.created_at)}
              </p>
            </div>
          ))}
          {activity.length === 0 && (
            <p className="py-6 text-center text-[13px] text-muted-foreground md:col-span-2">No citizen activity has arrived yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function BriefMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "critical" | "reported";
}) {
  return (
    <div className={cn(
      "rounded-2xl border bg-background/35 p-3 backdrop-blur-sm",
      tone === "critical" ? "border-primary/25" : "border-gold/25",
    )}>
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-1 font-display text-2xl font-black tabular-nums",
        tone === "critical" ? "text-primary" : "text-gold",
      )}>{value}</p>
    </div>
  );
}

function PriorityLane({
  title,
  description,
  icon: Icon,
  tone,
  incidents,
  empty,
}: {
  title: string;
  description: string;
  icon: typeof Siren;
  tone: "critical" | "reported";
  incidents: Incident[];
  empty: string;
}) {
  return (
    <section className="premium-surface overflow-hidden rounded-3xl border border-border/55 shadow-soft">
      <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "grid h-9 w-9 place-items-center rounded-2xl",
            tone === "critical" ? "bg-primary/12 text-primary" : "bg-gold/12 text-gold",
          )}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-display text-sm font-semibold">{title}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
          </div>
        </div>
        <span className={cn(
          "rounded-full border px-2 py-1 text-[10px] font-semibold tabular-nums",
          tone === "critical" ? "border-primary/25 bg-primary/10 text-primary" : "border-gold/25 bg-gold/10 text-gold",
        )}>{incidents.length} open</span>
      </div>
      <div className="divide-y divide-border/30 px-5">
        {incidents.map((incident) => {
          const meta = PRIORITY_META[incident.priority as IncidentPriority];
          return (
            <Link
              key={incident.id}
              to="/police/cases/$caseId"
              params={{ caseId: incident.id }}
              className="group flex items-center gap-3 py-3 transition hover:translate-x-0.5"
            >
              <span className={cn("h-2 w-2 shrink-0 rounded-full", meta?.dot ?? "bg-border")} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold group-hover:text-primary">{incident.title}</p>
                <p className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="font-mono">{incident.reference}</span>
                  <span className="text-border/60">·</span>
                  <span>{incident.district ?? "Unassigned"}</span>
                  <span className="text-border/60">·</span>
                  <span>{timeAgo(incident.created_at)}</span>
                </p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          );
        })}
        {incidents.length === 0 && (
          <p className="py-7 text-center text-xs text-muted-foreground">{empty}</p>
        )}
      </div>
    </section>
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
