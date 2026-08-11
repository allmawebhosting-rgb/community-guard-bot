import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
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
import { incidentsQuery, officersQuery, dispatchesQuery, type Incident } from "@/lib/police";
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
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
            <Globe2 className="h-3.5 w-3.5" /> Phase 10 · Institutional infrastructure
          </div>
          <h1 className="font-display text-2xl font-black tracking-[-0.04em]">National Safety Command</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Authorized command overview for national activity, response capacity, system health and institutional readiness.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-success/25 bg-success/10 px-3 py-2 text-[10px] font-semibold text-success">
          <ShieldCheck className="h-3.5 w-3.5" /> Human command required
        </div>
      </header>

      <section className="relative overflow-hidden rounded-[1.75rem] border border-primary/25 bg-[radial-gradient(circle_at_85%_10%,hsl(var(--gold)/.18),transparent_30%),linear-gradient(135deg,hsl(var(--primary)/.15),hsl(var(--card)/.96)_62%)] p-5 shadow-lift lg:p-7">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Allma institutional layer</p>
            <h2 className="mt-2 font-display text-2xl font-black tracking-[-0.04em]">Coordinate the response. Do not replace authority.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              This workspace aggregates authorized records from the existing command systems. AI may summarize observations, but officials remain responsible for decisions, dispatch, enforcement and operations.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-[280px]">
            <BriefMetric label="Live incidents" value={open.length} tone="primary" />
            <BriefMetric label="Critical" value={critical.length} tone="critical" />
            <BriefMetric label="Resources available" value={availableOfficers.length} tone="success" />
            <BriefMetric label="Resolved today" value={resolvedToday.length} tone="gold" />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/50 bg-card/60 px-3 py-2.5 shadow-soft">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Command scope</span>
        {(["national", "regional", "district", "station"] as Scope[]).map((item) => (
          <button key={item} type="button" onClick={() => setScope(item)} className={cn("rounded-full border px-3 py-1.5 text-[11px] font-semibold capitalize transition", scope === item ? "border-primary/50 bg-primary/12 text-primary" : "border-border/50 bg-secondary/30 text-muted-foreground hover:text-foreground")}>
            {item}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground">{scope === "national" ? "All authorized national records" : `${scope} drill-down is permission-scoped`}</span>
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
        <Kpi label="Active emergencies" value={open.length} icon={RadioTower} tone="primary" />
        <Kpi label="Critical" value={critical.length} icon={ShieldAlert} tone="critical" />
        <Kpi label="Awaiting response" value={awaiting.length} icon={AlertTriangle} tone="alert" />
        <Kpi label="Responding" value={responding.length} icon={MapPinned} tone="gold" />
        <Kpi label="Escalated" value={escalated.length} icon={Activity} tone="primary" />
        <Kpi label="Resolved today" value={resolvedToday.length} icon={CheckCircle2} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className="card-desktop">
          <SectionHeading icon={Layers3} title="National safety network" subtitle="Configured hierarchy and operational coverage" />
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

        <section className="card-desktop">
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
        <section className="card-desktop">
          <SectionHeading icon={RadioTower} title="Major incident center" subtitle="Configured multi-location or multi-agency incidents" />
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

        <section className="card-desktop">
          <SectionHeading icon={Wifi} title="System health" subtitle="Configured service status only" />
          <div className="mt-4 space-y-2">
            {systemRows.slice(0, 6).map((row) => <HealthRow key={row.id} label={row.display_name} status={row.status} detail={row.detail} />)}
            {systemRows.length === 0 && <EmptyState text={systemStatus.isError ? "System health records are not available until configured." : "No system status records configured."} />}
          </div>
          {liveSystemOutage && <div className="mt-3 flex items-center gap-2 rounded-xl border border-alert/30 bg-alert/[0.06] px-3 py-2 text-[11px] text-alert"><WifiOff className="h-3.5 w-3.5" /> One or more configured production services report degraded status.</div>}
        </section>
      </div>

      <section className="card-desktop">
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

function SectionHeading({ icon: Icon, title, subtitle }: { icon: typeof Globe2; title: string; subtitle: string }) {
  return <div className="flex items-start gap-2.5"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><h2 className="text-[13px] font-semibold">{title}</h2><p className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</p></div></div>;
}

function BriefMetric({ label, value, tone }: { label: string; value: number; tone: "primary" | "critical" | "success" | "gold" }) {
  return <div className="rounded-2xl border border-border/40 bg-background/35 p-3 backdrop-blur-sm"><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className={cn("mt-1 font-display text-2xl font-black tabular-nums", tone === "critical" ? "text-primary" : tone === "success" ? "text-success" : tone === "gold" ? "text-gold" : "text-primary")}>{value}</p></div>;
}

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Globe2; tone: string }) {
  return <div className="card-desktop"><div className="flex items-center justify-between"><p className="label-xs">{label}</p><Icon className={cn("h-3.5 w-3.5", tone === "critical" ? "text-primary" : tone === "alert" ? "text-alert" : tone === "gold" ? "text-gold" : tone === "success" ? "text-success" : "text-primary")} /></div><p className="mt-1.5 font-display text-2xl font-bold tabular-nums">{value}</p></div>;
}

function NetworkCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="rounded-2xl border border-border/40 bg-secondary/20 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-display text-xl font-bold tabular-nums">{value}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{detail}</p></div>;
}

function ResourceStat({ label, value, tone }: { label: string; value: number; tone: "success" | "gold" | "muted" }) {
  return <div className="rounded-xl border border-border/40 bg-secondary/25 px-2 py-2 text-center"><p className={cn("text-[16px] font-bold tabular-nums", tone === "success" ? "text-success" : tone === "gold" ? "text-gold" : "text-muted-foreground")}>{value}</p><p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p></div>;
}

function ReadinessCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="rounded-2xl border border-border/40 bg-secondary/20 p-3"><p className="text-xs font-semibold">{label}</p><p className="mt-1 font-display text-xl font-bold tabular-nums">{value}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{detail}</p></div>;
}

function HealthRow({ label, status, detail }: { label: string; status: string; detail: string | null }) {
  const good = status === "operational";
  return <div className="flex items-center gap-3 rounded-xl border border-border/35 bg-secondary/15 px-3 py-2.5"><span className={cn("h-2 w-2 rounded-full", good ? "bg-success" : status === "unknown" ? "bg-border" : "bg-alert")} /><div className="min-w-0 flex-1"><p className="text-xs font-medium">{label}</p><p className="truncate text-[10px] text-muted-foreground">{detail ?? "No detail supplied"}</p></div><span className={cn("text-[10px] font-semibold capitalize", good ? "text-success" : status === "unknown" ? "text-muted-foreground" : "text-alert")}>{status.replace("_", " ")}</span></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-border/50 px-3 py-5 text-center text-[11px] text-muted-foreground">{text}</div>;
}