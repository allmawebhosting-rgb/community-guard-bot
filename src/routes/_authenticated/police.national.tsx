import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Globe2,
  Layers3,
  LockKeyhole,
  MapPinned,
  RadioTower,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  hierarchyNodesQuery,
  organizationsQuery,
  majorIncidentsQuery,
  systemStatusQuery,
  handoverQuery,
  institutionalTableUnavailable,
} from "@/lib/institutional";
import { incidentsQuery, officersQuery, dispatchesQuery } from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/national")({
  component: NationalSafetyCommand,
});

type Scope = "national" | "regional" | "district" | "station";

function NationalSafetyCommand() {
  const { data: incidents = [], isError: incidentsError } = useQuery(incidentsQuery);
  const { data: officers = [], isError: officersError } = useQuery(officersQuery);
  const { data: dispatches = [], isError: dispatchesError } = useQuery(dispatchesQuery);
  const hierarchy = useQuery(hierarchyNodesQuery);
  const organizations = useQuery(organizationsQuery);
  const majorIncidents = useQuery(majorIncidentsQuery);
  const systemStatus = useQuery(systemStatusQuery);
  const handover = useQuery(handoverQuery);
  const [scope, setScope] = useState<Scope>("national");

  const open = incidents.filter((item) => !["resolved", "closed"].includes(item.status));
  const critical = open.filter((item) => item.priority === "critical");
  const responding = open.filter((item) => ["dispatched", "en_route", "responding", "on_scene"].includes(item.status));
  const awaiting = open.filter((item) => ["submitted", "under_review", "pending", "awaiting_update"].includes(item.status));
  const escalated = open.filter((item) => item.status === "escalated" || item.priority === "critical");
  const resolvedToday = incidents.filter((item) => item.resolved_at && Date.now() - new Date(item.resolved_at).getTime() < 864e5);
  const availableOfficers = officers.filter((item) => ["available", "on_duty"].includes(item.duty_status));
  const regions = unique(hierarchy.data?.filter((node) => node.node_type === "region").map((node) => node.name) ?? officers.map((item) => item.jurisdiction_area ?? "").filter(Boolean));
  const districts = unique(hierarchy.data?.filter((node) => node.node_type === "district").map((node) => node.name) ?? incidents.map((item) => item.district ?? "").filter(Boolean));
  const stations = hierarchy.data?.filter((node) => node.node_type === "police_station").length ?? 0;
  const institutionalTablesPending = [hierarchy, organizations, majorIncidents, systemStatus, handover].some((query) => query.isError && institutionalTableUnavailable(query.error));
  const systemRows = systemStatus.data ?? [];
  const liveSystemOutage = systemRows.some((row) => ["outage", "degraded"].includes(row.status) && row.environment === "production");

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-5 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1">
              <Globe2 className="h-3 w-3" /> Institutional infrastructure
            </span>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-muted-foreground">Phase 10</span>
          </div>
          <h1 className="font-display text-3xl font-black tracking-[-0.05em] sm:text-4xl">National Safety Command</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
            Authorized command overview for national activity, response capacity, system health and institutional readiness.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-success/25 bg-success/10 px-3 py-2 text-[10px] font-semibold text-success">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            Authorized view
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border/50 bg-secondary/30 px-3 py-2 text-[10px] font-medium text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" /> Live session
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden rounded-[1.75rem] border border-primary/25 bg-[radial-gradient(circle_at_88%_12%,hsl(var(--gold)/.2),transparent_25%),radial-gradient(circle_at_0%_100%,hsl(var(--primary)/.18),transparent_38%),linear-gradient(135deg,hsl(var(--primary)/.12),hsl(var(--card)/.98)_62%)] p-5 shadow-lift sm:p-6 lg:p-7">
        <div className="pointer-events-none absolute right-[-5%] top-[-70%] h-[420px] w-[420px] rounded-full border border-primary/10" />
        <div className="pointer-events-none absolute right-[5%] top-[-45%] h-[280px] w-[280px] rounded-full border border-gold/10" />
        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
              <ShieldCheck className="h-3.5 w-3.5" /> Allma institutional layer
            </div>
            <h2 className="mt-3 max-w-xl font-display text-2xl font-black leading-[1.05] tracking-[-0.05em] sm:text-3xl">Coordinate the response.<br /><span className="text-muted-foreground/75">Do not replace authority.</span></h2>
            <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              This workspace aggregates authorized records from the existing command systems. AI may summarize observations, but officials remain responsible for decisions, dispatch, enforcement and operations.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><CircleDot className="h-3 w-3 text-success" /> Human-reviewed surface</span>
              <span className="flex items-center gap-1.5"><LockKeyhole className="h-3 w-3 text-gold" /> Exact locations protected</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-[300px]">
            <BriefMetric label="Live incidents" value={open.length} tone="primary" />
            <BriefMetric label="Critical" value={critical.length} tone="critical" />
            <BriefMetric label="Resources available" value={availableOfficers.length} tone="success" />
            <BriefMetric label="Resolved today" value={resolvedToday.length} tone="gold" />
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card/60 p-2.5 shadow-soft sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 px-1.5 sm:mr-1">
          <Layers3 className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Command scope</span>
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-secondary/35 p-1 sm:flex sm:flex-1">
          {(["national", "regional", "district", "station"] as Scope[]).map((item) => (
            <button key={item} type="button" onClick={() => setScope(item)} aria-pressed={scope === item} className={cn("rounded-lg px-2 py-2 text-[10px] font-semibold capitalize transition sm:px-3", scope === item ? "bg-background text-primary shadow-soft" : "text-muted-foreground hover:text-foreground")}>
              {item}
            </button>
          ))}
        </div>
        <span className="px-1.5 text-[10px] text-muted-foreground sm:ml-auto sm:text-right">{scope === "national" ? "All authorized national records" : `${scope} drill-down is permission-scoped`}</span>
      </div>

      {institutionalTablesPending && (
        <div className="flex items-start gap-3 rounded-2xl border border-gold/30 bg-gold/[0.07] px-4 py-3">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <div>
            <p className="text-xs font-semibold text-gold">Institutional configuration is pending</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">The Phase 10 migration has not been applied to this database yet. Existing command data remains visible; no institutions, organizations, major incidents or system statuses are being invented.</p>
          </div>
        </div>
      )}

      {incidentsError || officersError || dispatchesError ? (
        <div className="rounded-2xl border border-alert/30 bg-alert/[0.06] px-4 py-3 text-[11px] text-muted-foreground">
          Some authorized operational records could not be loaded. KPI values below only reflect data successfully returned by the current session.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Active emergencies" value={open.length} icon={RadioTower} tone="primary" helper="Open now" />
        <Kpi label="Critical" value={critical.length} icon={ShieldAlert} tone="critical" helper="Immediate review" />
        <Kpi label="Awaiting response" value={awaiting.length} icon={AlertTriangle} tone="alert" helper="Needs attention" />
        <Kpi label="Responding" value={responding.length} icon={MapPinned} tone="gold" helper="In progress" />
        <Kpi label="Escalated" value={escalated.length} icon={Activity} tone="primary" helper="Command review" />
        <Kpi label="Resolved today" value={resolvedToday.length} icon={CheckCircle2} tone="success" helper="Last 24 hours" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className="card-desktop overflow-hidden">
          <SectionHeading icon={Layers3} title="National safety network" subtitle="Configured hierarchy and operational coverage" action="View structure" />
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <NetworkCard label="Regions" value={regions.length} detail={regions.length ? regions.slice(0, 2).join(" · ") : "No configured region records"} />
            <NetworkCard label="Districts" value={districts.length} detail={districts.length ? districts.slice(0, 2).join(" · ") : "No configured district records"} />
            <NetworkCard label="Stations" value={stations} detail={stations ? "Configured station nodes" : "No station nodes in Phase 10 hierarchy"} />
            <NetworkCard label="Organizations" value={organizations.data?.length ?? 0} detail={organizations.data?.length ? "Authorized records" : "No organization records"} />
          </div>
          <div className="mt-4 rounded-2xl border border-info/20 bg-info/[0.05] px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <MapPinned className="mr-2 inline h-3.5 w-3.5 text-info" /> Drill-down uses configured scope and existing jurisdiction fields. Exact citizen, officer and responder locations are not exposed on this national view.
          </div>
        </section>

        <section className="card-desktop overflow-hidden">
          <SectionHeading icon={Users} title="Resource availability" subtitle="Current authorized officer records" />
          <div className="mt-4 grid grid-cols-3 gap-2">
            <ResourceStat label="Available" value={availableOfficers.length} tone="success" />
            <ResourceStat label="On duty" value={officers.filter((item) => item.duty_status === "on_duty").length} tone="gold" />
            <ResourceStat label="Unavailable" value={officers.filter((item) => ["offline", "unavailable"].includes(item.duty_status)).length} tone="muted" />
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">No automatic dispatch has been triggered by this view. Resource counts are informational and may be limited by current permissions and data freshness.</p>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-desktop overflow-hidden">
          <SectionHeading icon={RadioTower} title="Major incident center" subtitle="Configured multi-location or multi-agency incidents" action="Open center" />
          <div className="mt-4 divide-y divide-border/30">
            {(majorIncidents.data ?? []).filter((item) => !["resolved", "closed"].includes(item.status)).slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-3">
                <span className={cn("h-2 w-2 rounded-full", item.priority === "critical" ? "bg-primary" : "bg-gold")} />
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{item.title}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.reference} · {item.scope_level} · {item.status}</p></div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
              </div>
            ))}
            {(majorIncidents.data ?? []).filter((item) => !["resolved", "closed"].includes(item.status)).length === 0 && <EmptyState text={majorIncidents.isError ? "Major incident records are not available until the Phase 10 schema is applied." : "No active major incidents recorded."} />}
          </div>
        </section>

        <section className="card-desktop overflow-hidden">
          <SectionHeading icon={Wifi} title="System health" subtitle="Configured service status only" action="View status" />
          <div className="mt-4 space-y-2">
            {systemRows.slice(0, 6).map((row) => <HealthRow key={row.id} label={row.display_name} status={row.status} detail={row.detail} />)}
            {systemRows.length === 0 && <EmptyState text={systemStatus.isError ? "System health records are not available until configured." : "No system status records configured."} />}
          </div>
          {liveSystemOutage && <div className="mt-3 flex items-center gap-2 rounded-xl border border-alert/30 bg-alert/[0.06] px-3 py-2 text-[11px] text-alert"><WifiOff className="h-3.5 w-3.5" /> One or more configured production services report degraded status.</div>}
        </section>
      </div>

      <section className="card-desktop overflow-hidden">
        <SectionHeading icon={Building2} title="Institutional readiness" subtitle="Governance records, handover status and authorization boundaries" />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <ReadinessCard label="Organizations" value={organizations.data?.length ?? 0} detail={organizations.isError ? "Configuration pending" : "Configured organization records"} />
          <ReadinessCard label="Handover records" value={handover.data?.length ?? 0} detail={handover.data?.[0]?.acceptance_status ? `Latest: ${handover.data[0].acceptance_status}` : "No handover acceptance recorded"} />
          <ReadinessCard label="Official integrations" value={0} detail="No confirmed government integration is configured in this workspace" />
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" /> Allma is the technology and intelligence layer. It is not the police, government or an emergency service. Official actions require authorized human approval and a confirmed provider response.
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/40 bg-secondary/15 px-4 py-3 text-[10px] text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5 text-primary" />
        <span>{dispatches.length} dispatch record{dispatches.length === 1 ? "" : "s"} loaded for this session.</span>
        <span>Scope: {scope}.</span>
        <span className="ml-auto flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Human-reviewed operational surface</span>
      </div>
    </div>
  );
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function SectionHeading({ icon: Icon, title, subtitle, action }: { icon: typeof Globe2; title: string; subtitle: string; action?: string }) {
  return <div className="flex items-start gap-2.5 border-b border-border/35 pb-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><h2 className="text-[13px] font-semibold">{title}</h2><p className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</p></div>{action && <span className="hidden items-center gap-1 text-[10px] font-medium text-muted-foreground sm:flex">{action}<ArrowUpRight className="h-3 w-3" /></span>}</div>;
}

function BriefMetric({ label, value, tone }: { label: string; value: number; tone: "primary" | "critical" | "success" | "gold" }) {
  return <div className="rounded-2xl border border-border/40 bg-background/35 p-3.5 backdrop-blur-sm transition hover:border-border/70"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className={cn("mt-1 font-display text-2xl font-black tabular-nums", tone === "critical" ? "text-primary" : tone === "success" ? "text-success" : tone === "gold" ? "text-gold" : "text-primary")}>{value}</p></div>;
}

function Kpi({ label, value, icon: Icon, tone, helper }: { label: string; value: number; icon: typeof Globe2; tone: string; helper: string }) {
  const color = tone === "critical" ? "text-primary" : tone === "alert" ? "text-alert" : tone === "gold" ? "text-gold" : tone === "success" ? "text-success" : "text-primary";
  const border = tone === "critical" ? "border-primary/45" : tone === "alert" ? "border-alert/35" : tone === "gold" ? "border-gold/35" : tone === "success" ? "border-success/35" : "border-primary/30";
  return <div className={cn("card-desktop relative overflow-hidden border-t-2", border)}><div className="flex items-start justify-between gap-2"><div><p className="label-xs">{label}</p><p className="mt-2 font-display text-2xl font-bold tabular-nums tracking-[-0.04em]">{value}</p></div><span className={cn("grid h-8 w-8 place-items-center rounded-xl bg-secondary/60", color)}><Icon className="h-3.5 w-3.5" /></span></div><p className="mt-2 text-[10px] text-muted-foreground">{helper}</p></div>;
}

function NetworkCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="group rounded-2xl border border-border/40 bg-secondary/20 p-3.5 transition hover:border-primary/25 hover:bg-primary/[0.04]"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><ChevronRight className="h-3 w-3 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-primary" /></div><p className="mt-2 font-display text-xl font-bold tabular-nums">{value}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{detail}</p></div>;
}

function ResourceStat({ label, value, tone }: { label: string; value: number; tone: "success" | "gold" | "muted" }) {
  return <div className="rounded-xl border border-border/40 bg-secondary/25 px-2 py-2 text-center"><p className={cn("text-[16px] font-bold tabular-nums", tone === "success" ? "text-success" : tone === "gold" ? "text-gold" : "text-muted-foreground")}>{value}</p><p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p></div>;
}

function ReadinessCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="rounded-2xl border border-border/40 bg-secondary/20 p-3.5 transition hover:border-border/70"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{label}</p><span className="rounded-full border border-border/40 bg-background/30 px-2 py-0.5 text-[9px] font-medium text-muted-foreground">{value === 0 ? "Pending" : "Configured"}</span></div><p className="mt-2 font-display text-xl font-bold tabular-nums">{value}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{detail}</p></div>;
}

function HealthRow({ label, status, detail }: { label: string; status: string; detail: string | null }) {
  const good = status === "operational";
  return <div className="flex items-center gap-3 rounded-xl border border-border/35 bg-secondary/15 px-3 py-2.5 transition hover:bg-secondary/25"><span className={cn("relative h-2 w-2 shrink-0 rounded-full", good ? "bg-success" : status === "unknown" ? "bg-border" : "bg-alert")} /><div className="min-w-0 flex-1"><p className="text-xs font-medium">{label}</p><p className="truncate text-[10px] text-muted-foreground">{detail ?? "No detail supplied"}</p></div><span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-semibold capitalize", good ? "border-success/25 bg-success/10 text-success" : status === "unknown" ? "border-border/40 bg-secondary/30 text-muted-foreground" : "border-alert/25 bg-alert/10 text-alert")}>{status.replace("_", " ")}</span></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-border/50 px-3 py-5 text-center text-[11px] text-muted-foreground">{text}</div>;
}