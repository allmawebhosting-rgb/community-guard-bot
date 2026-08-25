import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  MapPinned,
  Pause,
  Play,
  RadioTower,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  incidentsQuery,
  officersQuery,
  safetyActivityQuery,
  PRIORITY_META,
  statusLabel,
  timeAgo,
  type Incident,
  type IncidentPriority,
  myOfficerQuery,
} from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/")({
  component: CommandDashboard,
});

const QUEUE_FILTERS = [
  "all",
  "critical",
  "high",
  "medium",
  "low",
  "unassigned",
  "assigned",
  "responding",
  "awaiting_update",
  "escalated",
  "resolved",
] as const;

type QueueFilter = (typeof QUEUE_FILTERS)[number];

function CommandDashboard() {
  const qc = useQueryClient();
  const { data: officer } = useQuery(myOfficerQuery);
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const { data: officers = [] } = useQuery(officersQuery);
  const { data: activity = [] } = useQuery(safetyActivityQuery);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [demoMode, setDemoMode] = useState(false);
  const [surgeMode, setSurgeMode] = useState(false);
  const [liveState, setLiveState] = useState<"connecting" | "live" | "offline">("connecting");

  useEffect(() => {
    const channel = supabase
      .channel("police-command-activity-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "safety_activity" }, () => {
        qc.invalidateQueries({ queryKey: ["police", "safety-activity"] });
      })
      .subscribe((status) => {
        setLiveState(status === "SUBSCRIBED" ? "live" : status === "CHANNEL_ERROR" ? "offline" : "connecting");
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const open = incidents.filter((i) => !["resolved", "closed"].includes(i.status));
  const critical = open.filter((i) => i.priority === "critical");
  const unassigned = open.filter((i) => !i.assigned_officer_id);
  const responding = open.filter((i) => ["dispatched", "en_route", "responding", "on_scene"].includes(i.status));
  const pending = open.filter((i) => ["submitted", "under_review", "pending", "awaiting_update"].includes(i.status));
  const escalated = open.filter((i) => i.status === "escalated" || i.priority === "critical");
  const resolvedToday = incidents.filter(
    (i) => i.resolved_at && Date.now() - new Date(i.resolved_at).getTime() < 864e5,
  );
  const available = officers.filter((o) => ["available", "on_duty"].includes(o.duty_status));
  const firstName = officer?.full_name?.split(" ").filter(Boolean)[0] ?? "Officer";

  const byDistrict = Object.entries(
    open.reduce<Record<string, number>>((acc, incident) => {
      const district = incident.district ?? "Unassigned";
      acc[district] = (acc[district] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const cluster = byDistrict.find(([, count]) => count >= 3);

  const queueRows = useMemo(() => {
    return incidents
      .filter((incident) => {
        if (queueFilter === "all") return !["resolved", "closed"].includes(incident.status);
        if (queueFilter === "resolved") return ["resolved", "closed"].includes(incident.status);
        if (queueFilter === "unassigned") return !incident.assigned_officer_id && !["resolved", "closed"].includes(incident.status);
        if (queueFilter === "assigned") return Boolean(incident.assigned_officer_id) && !["resolved", "closed"].includes(incident.status);
        if (queueFilter === "responding") return ["dispatched", "en_route", "responding", "on_scene"].includes(incident.status);
        if (queueFilter === "awaiting_update") return ["pending", "awaiting_update", "under_review"].includes(incident.status);
        if (queueFilter === "escalated") return incident.status === "escalated" || incident.priority === "critical";
        return incident.priority === queueFilter;
      })
      .slice(0, 12);
  }, [incidents, queueFilter]);

  const queueCounts: Record<QueueFilter, number> = {
    all: open.length,
    critical: critical.length,
    high: open.filter((i) => i.priority === "high").length,
    medium: open.filter((i) => i.priority === "medium").length,
    low: open.filter((i) => i.priority === "low").length,
    unassigned: unassigned.length,
    assigned: open.filter((i) => Boolean(i.assigned_officer_id)).length,
    responding: responding.length,
    awaiting_update: pending.length,
    escalated: escalated.length,
    resolved: incidents.filter((i) => ["resolved", "closed"].includes(i.status)).length,
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-xs text-primary">Digital operations room</p>
          <h1 className="mt-1 font-display text-xl font-semibold">Command Overview</h1>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {new Date().toLocaleDateString("en-UG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </span>
      </div>

      <section className="relative isolate overflow-hidden rounded-[1.75rem] border border-primary/25 bg-[radial-gradient(circle_at_82%_15%,hsl(var(--gold)/.2),transparent_27%),linear-gradient(135deg,hsl(var(--primary)/.2),hsl(var(--card)/.96)_62%)] p-5 shadow-lift lg:p-7">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-5 flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-2xl border border-primary/30 bg-background/45 shadow-soft backdrop-blur">
                <Sparkles className="h-4 w-4 text-gold" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">AI-assisted operational intelligence</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Authorized Allma operations workspace · {officer?.jurisdiction_area ?? "Uganda"}</p>
              </div>
            </div>
            <h2 className="font-display text-2xl font-black tracking-[-0.04em] sm:text-3xl">Welcome back, {firstName}.</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Review the live queue, prioritize critical cases, and coordinate available resources. Humans remain in control. Allma assists operators by organizing current system data, identifying patterns, and highlighting important information.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link to="/police/ai" className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-lift transition hover:-translate-y-0.5">
                <Sparkles className="h-3.5 w-3.5" /> Ask Allma <ChevronRight className="h-3.5 w-3.5" />
              </Link>
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-success/25 bg-success/10 px-3.5 py-2 text-[11px] font-medium text-success">
                <ShieldCheck className="h-3.5 w-3.5" /> Secure officer view
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-[270px]">
            <BriefMetric label="Needs attention" value={critical.length} tone="critical" />
            <BriefMetric label="Unassigned" value={unassigned.length} tone="reported" />
          </div>
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-3">
        <Siren className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="text-xs font-semibold">Emergency-service integration workspace</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            This restricted workspace is designed to support authorized safety operations, incident coordination, SOS activity, locations, and evidence signals. Allma is currently independent and does not represent or contact official emergency services unless an authorized integration is established.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/50 bg-card/60 px-3 py-2.5 shadow-soft">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Operational controls</span>
        <button type="button" onClick={() => setDemoMode((value) => !value)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition", demoMode ? "border-gold/50 bg-gold/12 text-gold" : "border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground")}>
          {demoMode ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {demoMode ? "DEMO SIMULATION ACTIVE" : "Run DEMO simulation"}
        </button>
        <button type="button" onClick={() => setSurgeMode((value) => !value)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition", surgeMode ? "border-primary/50 bg-primary/12 text-primary" : "border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground")}>
          <BellRing className="h-3 w-3" /> {surgeMode ? "SURGE MODE ON" : "Activate surge mode"}
        </button>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {liveState === "live" ? <Wifi className="h-3 w-3 text-success" /> : <WifiOff className="h-3 w-3 text-alert" />}
          {liveState === "live" ? "Realtime connected" : liveState === "offline" ? "Realtime unavailable" : "Connecting realtime"}
        </span>
      </div>

      {demoMode && <ModeNotice icon={Play} title="DEMO MODE · No real notifications" text="This simulation is visual only. It does not contact police, ambulance, fire, responders, or any government system." tone="gold" />}
      {surgeMode && <ModeNotice icon={Siren} title="SURGE MODE · Manual command view" text="Priority cases, unassigned work, and available resources are highlighted for review. No automatic dispatch or escalation has been triggered." tone="primary" />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Critical" value={critical.length} icon={Siren} tone="text-primary" />
        <Stat label="Active" value={open.length} icon={AlertTriangle} tone="text-alert" />
        <Stat label="Unassigned" value={unassigned.length} icon={RadioTower} tone="text-primary" />
        <Stat label="Responding" value={responding.length} icon={MapPinned} tone="text-gold" />
        <Stat label="Pending" value={pending.length} icon={Clock} tone="text-alert" />
        <Stat label="Resolved today" value={resolvedToday.length} icon={CheckCircle2} tone="text-success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_310px] xl:grid-cols-[1fr_340px]">
        <section className="card-desktop overflow-hidden">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
            <div>
              <h2 className="flex items-center gap-2 text-[13px] font-semibold"><RadioTower className="h-3.5 w-3.5 text-primary" /> Live incident queue</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Real case state · choose a queue to review</p>
            </div>
            <Link to="/police/incidents" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">View all <ArrowUpRight className="h-3 w-3" /></Link>
          </div>
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            {QUEUE_FILTERS.map((filter) => (
              <button key={filter} type="button" onClick={() => setQueueFilter(filter)} className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium capitalize transition", queueFilter === filter ? "border-primary/50 bg-primary/12 text-foreground" : "border-border/50 bg-secondary/30 text-muted-foreground hover:text-foreground")}>
                {filter.replace("_", " ")} <span className="ml-0.5 tabular-nums opacity-70">{queueCounts[filter]}</span>
              </button>
            ))}
          </div>
          <div className="divide-y divide-border/30">
            {queueRows.map((incident) => <QueueRow key={incident.id} incident={incident} />)}
            {queueRows.length === 0 && <p className="py-10 text-center text-[13px] text-muted-foreground">No incidents match this queue.</p>}
          </div>
        </section>

        <div className="space-y-4">
          <section className={cn("card-desktop", cluster && "border-alert/35 bg-alert/[0.05]")}>
            <div className="flex items-start gap-2.5">
              {cluster ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-alert" /> : <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              <div>
                <h2 className="text-[13px] font-semibold">{cluster ? "Possible incident cluster" : "Escalation watch"}</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {cluster ? `${cluster[1]} reports are in ${cluster[0]}. Possible pattern detected; incidents are not confirmed connected.` : unassigned.length ? `${unassigned.length} incident${unassigned.length === 1 ? "" : "s"} awaiting assignment. Review before escalating.` : "No unassigned cases require escalation review."}
                </p>
              </div>
            </div>
            <Link to="/police/dispatch" className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">Open dispatch queue <ArrowUpRight className="h-3 w-3" /></Link>
          </section>

          <section className="card-desktop">
            <div className="mb-3 flex items-center justify-between border-b border-border/40 pb-3">
              <h2 className="text-[13px] font-semibold">Officer availability</h2>
              <Link to="/police/officers" className="text-[11px] text-muted-foreground hover:text-foreground">Manage <ArrowUpRight className="ml-0.5 inline h-3 w-3" /></Link>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-1.5">
              <AvailabilityCount label="Available" value={officers.filter((o) => o.duty_status === "available").length} tone="success" />
              <AvailabilityCount label="Busy" value={officers.filter((o) => o.duty_status === "on_duty").length} tone="gold" />
              <AvailabilityCount label="Offline" value={officers.filter((o) => ["offline", "unavailable"].includes(o.duty_status)).length} tone="muted" />
            </div>
            <div className="divide-y divide-border/30">
              {available.slice(0, 5).map((off) => (
                <div key={off.id} className="flex items-center gap-2.5 py-2">
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/40 to-gold/40 text-[9px] font-bold">{(off.full_name || "O").slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium leading-none">{off.full_name || "Officer"}</p>
                    <p className="mt-0.5 truncate text-[10px] capitalize text-muted-foreground">{off.duty_status?.replace(/_/g, " ")} · location restricted</p>
                  </div>
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                </div>
              ))}
              {available.length === 0 && <p className="py-4 text-center text-[12px] text-muted-foreground">No officers on duty.</p>}
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PriorityLane title="Critical cases" description="Immediate review recommended" incidents={critical.slice(0, 4)} empty="No critical cases in the open queue." />
        <PriorityLane title="Live citizen activity" description="Realtime events before or alongside formal reports" incidents={[]} empty={activity.length ? `${activity.length} event${activity.length === 1 ? "" : "s"} available in the activity feed.` : "No citizen activity has arrived yet."} />
      </div>
    </div>
  );
}

function QueueRow({ incident }: { incident: Incident }) {
  const meta = PRIORITY_META[incident.priority as IncidentPriority];
  return (
    <Link to="/police/cases/$caseId" params={{ caseId: incident.id }} className="group flex items-start gap-3 py-2.5 transition hover:bg-secondary/20 -mx-4 px-4">
      <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", meta?.dot ?? "bg-border")} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-snug group-hover:text-primary">{incident.title}</p>
        <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-mono">{incident.reference}</span>
          {incident.district && <><span className="text-border/60">·</span><span>{incident.district}</span></>}
          <span className="text-border/60">·</span><span>{statusLabel(incident.status)}</span>
        </p>
      </div>
      <span className={cn("hidden shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase sm:block", incident.assigned_officer_id ? "border-success/30 bg-success/10 text-success" : "border-primary/30 bg-primary/10 text-primary")}>{incident.assigned_officer_id ? "Assigned" : "Unassigned"}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(incident.created_at)}</span>
    </Link>
  );
}

function ModeNotice({ icon: Icon, title, text, tone }: { icon: typeof Play; title: string; text: string; tone: "gold" | "primary" }) {
  return <div className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3", tone === "gold" ? "border-gold/30 bg-gold/[0.08]" : "border-primary/35 bg-primary/[0.08]")}><Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "gold" ? "text-gold" : "text-primary")} /><div><p className={cn("text-xs font-semibold", tone === "gold" ? "text-gold" : "text-primary")}>{title}</p><p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{text}</p></div></div>;
}

function AvailabilityCount({ label, value, tone }: { label: string; value: number; tone: "success" | "gold" | "muted" }) {
  return <div className="rounded-xl border border-border/40 bg-secondary/25 px-2 py-2 text-center"><p className={cn("text-[16px] font-bold tabular-nums", tone === "success" ? "text-success" : tone === "gold" ? "text-gold" : "text-muted-foreground")}>{value}</p><p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p></div>;
}

function PriorityLane({ title, description, incidents, empty }: { title: string; description: string; incidents: Incident[]; empty: string }) {
  return <section className="premium-surface overflow-hidden rounded-3xl border border-border/55 shadow-soft"><div className="flex items-center justify-between border-b border-border/40 px-5 py-4"><div><h2 className="font-display text-sm font-semibold">{title}</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p></div><span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] font-semibold tabular-nums text-primary">{incidents.length} open</span></div><div className="divide-y divide-border/30 px-5">{incidents.map((incident) => <Link key={incident.id} to="/police/cases/$caseId" params={{ caseId: incident.id }} className="group flex items-center gap-3 py-3"><span className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_META[incident.priority as IncidentPriority]?.dot ?? "bg-border")} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold group-hover:text-primary">{incident.title}</p><p className="mt-1 text-[10px] text-muted-foreground">{incident.reference} · {incident.district ?? "Unassigned"} · {timeAgo(incident.created_at)}</p></div><ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" /></Link>)}{incidents.length === 0 && <p className="py-7 text-center text-xs text-muted-foreground">{empty}</p>}</div></section>;
}

function BriefMetric({ label, value, tone }: { label: string; value: number; tone: "critical" | "reported" }) {
  return <div className={cn("rounded-2xl border bg-background/35 p-3 backdrop-blur-sm", tone === "critical" ? "border-primary/25" : "border-gold/25")}><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className={cn("mt-1 font-display text-2xl font-black tabular-nums", tone === "critical" ? "text-primary" : "text-gold")}>{value}</p></div>;
}

function Stat({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Siren; tone: string }) {
  return <div className="card-desktop"><div className="flex items-center justify-between"><p className="label-xs">{label}</p><Icon className={cn("h-3.5 w-3.5", tone)} /></div><p className="mt-1.5 font-display text-2xl font-bold tabular-nums">{value}</p></div>;
}