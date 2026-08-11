import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  Download,
  FileText,
  Info,
  Layers3,
  Lightbulb,
  MapPinned,
  MessageSquareText,
  RefreshCw,
  RadioTower,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  auditLogQuery,
  communityAlertsQuery,
  dispatchesQuery,
  incidentsQuery,
  logAudit,
  officersQuery,
  safetyActivityQuery,
  type Dispatch,
  type Incident,
  type OfficerProfile,
  type SafetyActivity,
} from "@/lib/police";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/analytics")({
  head: () => ({
    meta: [
      { title: "Safety Intelligence — Allma Safety AI" },
      {
        name: "description",
        content: "Authorized operational intelligence, trends, response analysis and prevention signals.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntelligenceCenter,
});

type RangeKey = "today" | "7d" | "30d" | "90d" | "year" | "custom";
type SectionKey =
  | "overview"
  | "live"
  | "trends"
  | "geography"
  | "time"
  | "category"
  | "resources"
  | "response"
  | "community"
  | "insights"
  | "reports"
  | "alerts";
type ReviewStatus = "New" | "Reviewing" | "Acknowledged" | "Action recommended" | "Resolved";

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
];

const INTELLIGENCE_NAV: { key: SectionKey; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "live", label: "Live Intelligence", icon: RadioTower },
  { key: "trends", label: "Incident Trends", icon: Sparkles },
  { key: "geography", label: "Geographic Intelligence", icon: MapPinned },
  { key: "time", label: "Time Patterns", icon: Clock3 },
  { key: "category", label: "Category Analysis", icon: Layers3 },
  { key: "resources", label: "Resource Intelligence", icon: Users },
  { key: "response", label: "Response Intelligence", icon: Target },
  { key: "community", label: "Community Safety", icon: Wifi },
  { key: "insights", label: "AI Insights", icon: BrainCircuit },
  { key: "reports", label: "Reports", icon: FileText },
  { key: "alerts", label: "Alerts", icon: BellRing },
];

const TOOLTIP_STYLE = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
};

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--gold))",
  "hsl(var(--alert))",
  "hsl(var(--success))",
  "#818cf8",
  "#f472b6",
];

const REVIEW_FLOW: ReviewStatus[] = ["New", "Reviewing", "Acknowledged", "Action recommended", "Resolved"];

function IntelligenceCenter() {
  const queryClient = useQueryClient();
  const incidentsResult = useQuery(incidentsQuery);
  const officersResult = useQuery(officersQuery);
  const dispatchesResult = useQuery(dispatchesQuery);
  const activityResult = useQuery(safetyActivityQuery);
  const alertsResult = useQuery(communityAlertsQuery);
  const { data: auditEntries = [] } = useQuery(auditLogQuery(25));
  const incidents = incidentsResult.data ?? [];
  const officers = officersResult.data ?? [];
  const dispatches = dispatchesResult.data ?? [];
  const activity = activityResult.data ?? [];
  const alerts = alertsResult.data ?? [];
  const [range, setRange] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [section, setSection] = useState<SectionKey>("overview");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [selectedDistrict, setSelectedDistrict] = useState("all");
  const [explanation, setExplanation] = useState<string | null>(null);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [reportType, setReportType] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [reportOpen, setReportOpen] = useState(false);
  const [plannerArea, setPlannerArea] = useState("");
  const [plannerCategory, setPlannerCategory] = useState("all");
  const [reviewStatuses, setReviewStatuses] = useState<Record<string, ReviewStatus>>({});
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "online" | "limited">("connecting");

  useEffect(() => {
    const channel = supabase
      .channel("police-intelligence-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["police", "incidents"] });
      })
      .subscribe((status) => setRealtimeStatus(status === "SUBSCRIBED" ? "online" : "limited"));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const period = useMemo(() => getPeriod(range, customFrom, customTo), [range, customFrom, customTo]);
  const scopedIncidents = useMemo(
    () =>
      incidents.filter((incident) => {
        const timestamp = new Date(incident.created_at).getTime();
        const categoryMatch = selectedCategory === "all" || (incident.category ?? "Other") === selectedCategory;
        const severityMatch = selectedSeverity === "all" || incident.priority === selectedSeverity;
        const districtMatch = selectedDistrict === "all" || (incident.district ?? "Unspecified") === selectedDistrict;
        return timestamp >= period.from && timestamp <= period.to && categoryMatch && severityMatch && districtMatch;
      }),
    [incidents, period, selectedCategory, selectedDistrict, selectedSeverity],
  );
  const priorIncidents = useMemo(() => {
    const duration = period.to - period.from;
    return incidents.filter((incident) => {
      const timestamp = new Date(incident.created_at).getTime();
      return timestamp >= period.from - duration && timestamp < period.from;
    });
  }, [incidents, period]);
  const scopedDispatches = dispatches.filter((dispatch) => {
    const timestamp = new Date(dispatch.created_at).getTime();
    return timestamp >= period.from && timestamp <= period.to;
  });
  const active = scopedIncidents.filter((incident) => !["resolved", "closed"].includes(incident.status));
  const resolved = scopedIncidents.filter((incident) => ["resolved", "closed"].includes(incident.status));
  const critical = scopedIncidents.filter((incident) => incident.priority === "critical");
  const high = scopedIncidents.filter((incident) => incident.priority === "high");
  const unassigned = active.filter((incident) => !incident.assigned_officer_id);
  const responderActivity = activity.filter((event) => event.activity_type.toLowerCase().includes("responder"));
  const responseMinutes = averageMinutes(resolved.map((incident) => differenceMinutes(incident.created_at, incident.resolved_at)));
  const acknowledgementMinutes = averageMinutes(scopedDispatches.map((dispatch) => differenceMinutes(dispatch.created_at, dispatch.notified_at)));
  const dispatchMinutes = averageMinutes(scopedDispatches.map((dispatch) => differenceMinutes(dispatch.created_at, dispatch.on_scene_at)));
  const escalationRate = scopedIncidents.length
    ? Math.round((scopedIncidents.filter((incident) => incident.status === "escalated" || incident.priority === "critical").length / scopedIncidents.length) * 100)
    : 0;
  const categoryData = countBy(scopedIncidents, (incident) => incident.category ?? "Other").slice(0, 8);
  const districtData = countBy(scopedIncidents, (incident) => incident.district ?? "Unspecified").slice(0, 8);
  const trendData = buildTrend(scopedIncidents, period.from, period.to);
  const timeData = buildTimeData(scopedIncidents);
  const priorCategoryData = countBy(priorIncidents, (incident) => incident.category ?? "Other");
  const spikeData = categoryData
    .map((current) => {
      const prior = priorCategoryData.find((entry) => entry.name === current.name)?.value ?? 0;
      const change = prior ? Math.round(((current.value - prior) / prior) * 100) : current.value ? 100 : 0;
      return { ...current, prior, change };
    })
    .filter((entry) => entry.change >= 50)
    .sort((a, b) => b.change - a.change);
  const cluster = districtData.find((entry) => entry.value >= 3);
  const delays = scopedDispatches.filter((dispatch) => {
    const minutes = differenceMinutes(dispatch.created_at, dispatch.notified_at);
    return minutes != null && minutes > 30;
  });
  const dataQuality = getDataQuality(scopedIncidents);
  const health = [
    { label: "Database", value: incidentsResult.isError ? "Unavailable" : "Operational", detail: incidentsResult.isError ? "Query failed" : "Authorized records loaded" },
    { label: "Realtime", value: realtimeStatus === "online" ? "Operational" : "Degraded", detail: realtimeStatus === "online" ? "Reports channel connected" : "Polling data only" },
    { label: "AI", value: "Available", detail: "Assistant remains separate from core workflow" },
    { label: "Maps", value: "Degraded", detail: "Aggregated district view only" },
    { label: "Alerts", value: alertsResult.isError ? "Unavailable" : "Operational", detail: `${alerts.length} alert records available` },
    { label: "Data freshness", value: "Current session", detail: "Last query returned authorized records" },
  ];

  const updateReviewStatus = (id: string, status: ReviewStatus) => {
    setReviewStatuses((previous) => ({ ...previous, [id]: status }));
    void logAudit("intelligence_alert_status", "intelligence_signal", id, { status, data_period: getRangeLabel(range) });
  };

  const explain = (text: string) => setExplanation(text);

  const generateBriefing = () => {
    setBriefingOpen(true);
    void logAudit("intelligence_briefing_generated", "intelligence", undefined, {
      data_period: getRangeLabel(range),
      incident_count: scopedIncidents.length,
    });
  };

  const exportCsv = () => {
    const rows = [
      ["metric", "value", "data_period"],
      ["total_incidents", scopedIncidents.length, getRangeLabel(range)],
      ["critical_incidents", critical.length, getRangeLabel(range)],
      ["active_incidents", active.length, getRangeLabel(range)],
      ["resolved_incidents", resolved.length, getRangeLabel(range)],
      ["average_resolution_minutes", responseMinutes ?? "unavailable", getRangeLabel(range)],
      ["average_acknowledgement_minutes", acknowledgementMinutes ?? "unavailable", getRangeLabel(range)],
      ["escalation_rate_percent", escalationRate, getRangeLabel(range)],
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `allma-safety-intelligence-${range}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    void logAudit("intelligence_exported", "intelligence", undefined, { format: "csv", data_period: getRangeLabel(range) });
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
            <BrainCircuit className="h-3.5 w-3.5" /> Authorized intelligence center
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">Allma Safety Intelligence</h1>
          <p className="mt-1 text-sm text-muted-foreground">Operational intelligence for safer communities.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={generateBriefing} className="inline-flex items-center gap-1.5 rounded-full border border-gold/35 bg-gold/10 px-3 py-1.5 text-[10px] font-semibold text-gold">
            <Sparkles className="h-3 w-3" /> Brief me
          </button>
          <button type="button" onClick={() => setPlannerOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-3 py-1.5 text-[10px] font-semibold text-primary">
            <Lightbulb className="h-3 w-3" /> Prevention planner
          </button>
          <span className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold", realtimeStatus === "online" ? "border-success/25 bg-success/10 text-success" : "border-gold/30 bg-gold/10 text-gold")}>
            <Wifi className="h-3 w-3" /> {realtimeStatus === "online" ? "Live authorized view" : "Limited connectivity"}
          </span>
        </div>
      </header>

      <nav className="premium-surface flex gap-1 overflow-x-auto rounded-2xl border border-border/55 p-1.5 shadow-soft" aria-label="Intelligence sections">
        {INTELLIGENCE_NAV.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={cn("flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-medium transition", section === key ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground")}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </nav>

      <section className="premium-surface rounded-3xl border border-border/55 p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Data period</span>
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRange(option.value)}
              className={cn("rounded-full border px-3 py-1.5 text-[11px] transition", range === option.value ? "border-primary/50 bg-primary/12 text-foreground" : "border-border/50 bg-secondary/30 text-muted-foreground hover:text-foreground")}
            >
              {option.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground">{formatDate(period.from)} — {formatDate(period.to)}</span>
        </div>
        {range === "custom" && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border/40 pt-3">
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">From <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="rounded-xl border border-border/60 bg-background px-2 py-1.5 text-foreground" /></label>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">To <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="rounded-xl border border-border/60 bg-background px-2 py-1.5 text-foreground" /></label>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-info/25 bg-info/[0.06] px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p className="flex-1 text-[11px] leading-relaxed text-muted-foreground">
          This center uses authorized records and aggregated observations. Exact citizen, officer, and responder locations are not shown here. AI assists; authorized humans decide. Current analytics use the latest authorized records returned by the existing data service, not fabricated production numbers.
        </p>
        <span className="rounded-full border border-border/50 bg-secondary/35 px-2 py-1 text-[9px] text-muted-foreground">Human oversight required</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="rounded-xl border border-border/60 bg-background px-3 py-2 text-[11px] text-foreground">
          <option value="all">All categories</option>
          {uniqueCategories(incidents).map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select value={selectedSeverity} onChange={(event) => setSelectedSeverity(event.target.value)} className="rounded-xl border border-border/60 bg-background px-3 py-2 text-[11px] text-foreground">
          <option value="all">All severity</option>
          <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
        <select value={selectedDistrict} onChange={(event) => setSelectedDistrict(event.target.value)} className="rounded-xl border border-border/60 bg-background px-3 py-2 text-[11px] text-foreground">
          <option value="all">All districts</option>
          {uniqueDistricts(incidents).map((district) => <option key={district} value={district}>{district}</option>)}
        </select>
        <span className="ml-auto self-center text-[10px] text-muted-foreground">{scopedIncidents.length} authorized incident records in view</span>
      </div>

      {(section === "overview" || section === "live") && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Total incidents" value={scopedIncidents.length} icon={BarChart3} tone="primary" />
            <Kpi label="Critical" value={critical.length} icon={ShieldAlert} tone="critical" />
            <Kpi label="High priority" value={high.length} icon={AlertTriangle} tone="alert" />
            <Kpi label="Active" value={active.length} icon={RadioTower} tone="gold" />
            <Kpi label="Resolved" value={resolved.length} icon={CheckCircle2} tone="success" />
            <Kpi label="Escalation rate" value={`${escalationRate}%`} icon={Target} tone="primary" />
          </div>
          {section === "live" && <LiveIntelligence incidents={scopedIncidents} activity={activity} statuses={reviewStatuses} onStatusChange={updateReviewStatus} />}
        </>
      )}

      {(section === "overview" || section === "trends") && (
        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <ChartCard title="Incident volume over time" subtitle="Reported events in the selected period" onExplain={() => explain("This chart buckets authorized report creation timestamps across the selected period. It shows volume and resolution status; it does not prove cause, risk, or criminality.")}>
            <ResponsiveContainer width="100%" height={235}>
              <AreaChart data={trendData}>
                <defs><linearGradient id="incidentFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.35} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="incidents" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#incidentFill)" name="Incidents" />
                <Line type="monotone" dataKey="resolved" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="Resolved" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
          <SpikePanel spikeData={spikeData} current={scopedIncidents.length} prior={priorIncidents.length} />
        </div>
      )}

      {(section === "overview" || section === "category") && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Category analysis" subtitle="Volume by configured incident category" onExplain={() => explain("Category counts are derived from the category field on authorized reports. Categories with insufficient records are not treated as trends or predictions.")}>
            <ResponsiveContainer width="100%" height={235}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.35} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Reports">{categoryData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <CategoryTable incidents={scopedIncidents} categoryData={categoryData} responseMinutes={responseMinutes} />
        </div>
      )}

      {(section === "overview" || section === "geography") && (
        <AggregatedMap incidents={scopedIncidents} districtData={districtData} onExplain={() => explain("This is an aggregated district activity view. It intentionally avoids exact citizen locations and does not assign a danger rating to a neighborhood.")} />
      )}

      {section === "time" && <TimePatterns timeData={timeData} incidents={scopedIncidents} />}
      {section === "resources" && <ResourcePanel officers={officers} incidents={scopedIncidents} unassigned={unassigned.length} responders={responderActivity.length} />}
      {section === "response" && <ResponsePanel dispatches={scopedDispatches} incidents={scopedIncidents} responseMinutes={responseMinutes} acknowledgementMinutes={acknowledgementMinutes} dispatchMinutes={dispatchMinutes} delays={delays} />}
      {section === "community" && <CommunitySafety incidents={scopedIncidents} activity={activity} alerts={alerts} />}
      {section === "insights" && <InsightsPanel cluster={cluster} spikeData={spikeData} unassigned={unassigned.length} delays={delays.length} dataQuality={dataQuality} period={getRangeLabel(range)} />}

      {(section === "overview" || section === "reports") && (
        <ReportsPanel reportType={reportType} setReportType={setReportType} reportOpen={reportOpen} setReportOpen={setReportOpen} scopedIncidents={scopedIncidents} critical={critical} resolved={resolved} responseMinutes={responseMinutes} onExport={exportCsv} onPrint={() => window.print()} />
      )}

      {(section === "overview" || section === "alerts") && <AlertCenter cluster={cluster} spikeData={spikeData} delays={delays.length} dataQuality={dataQuality} statuses={reviewStatuses} onStatusChange={updateReviewStatus} />}

      {section === "overview" && <SystemHealth health={health} auditCount={auditEntries.length} />}

      <footer className="flex flex-wrap items-center justify-center gap-3 pb-4 text-center text-[10px] text-muted-foreground/70">
        <span className="flex items-center gap-1.5"><MapPinned className="h-3 w-3" /> Aggregated intelligence only</span>
        <span>·</span>
        <Link to="/police/audit" className="hover:text-foreground">Audit trail</Link>
        <span>·</span>
        <span>AI-generated analysis based on available system data. Human review required.</span>
      </footer>

      {explanation && <Dialog title="Explain this" onClose={() => setExplanation(null)}><p className="text-sm leading-relaxed text-muted-foreground">{explanation}</p><Badge label="What this does not prove" tone="neutral" /><p className="text-xs leading-relaxed text-muted-foreground">It does not prove causation, intent, identity, criminality, or a legal connection between reports.</p></Dialog>}
      {briefingOpen && <BriefingDialog incidents={scopedIncidents} critical={critical} active={active} unassigned={unassigned.length} cluster={cluster} spikeData={spikeData} period={getRangeLabel(range)} onClose={() => setBriefingOpen(false)} />}
      {plannerOpen && <PreventionPlanner area={plannerArea} category={plannerCategory} setArea={setPlannerArea} setCategory={setPlannerCategory} categories={uniqueCategories(incidents)} incidents={scopedIncidents} onClose={() => setPlannerOpen(false)} />}
    </div>
  );
}

function LiveIntelligence({ incidents, activity, statuses, onStatusChange }: { incidents: Incident[]; activity: SafetyActivity[]; statuses: Record<string, ReviewStatus>; onStatusChange: (id: string, status: ReviewStatus) => void }) {
  const signals: { id: string; label: string; evidence: string; tone: "critical" | "warning" | "info" }[] = [
    { id: "live-critical", label: "Critical incident signal", evidence: `${incidents.filter((incident) => incident.priority === "critical" && !["resolved", "closed"].includes(incident.status)).length} critical records remain active.`, tone: "critical" },
    { id: "live-activity", label: "Community safety activity", evidence: `${activity.length} recent activity records are available to authorized command.`, tone: "info" },
  ];
  return <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><SectionHeading icon={RadioTower} title="Live intelligence" subtitle="Safe operational signals, not a continuous stream of sensitive locations" /><div className="grid gap-3 md:grid-cols-2">{signals.map((signal) => <SignalCard key={signal.id} {...signal} status={statuses[signal.id] ?? "New"} onStatusChange={onStatusChange} />)}</div></section>;
}

function SpikePanel({ spikeData, current, prior }: { spikeData: { name: string; value: number; prior: number; change: number }[]; current: number; prior: number }) {
  return <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><SectionHeading icon={Sparkles} title="Spike detection" subtitle="Comparison with the immediately preceding period" />{spikeData.length ? <div className="space-y-2">{spikeData.slice(0, 3).map((entry) => <div key={entry.name} className="rounded-2xl border border-gold/25 bg-gold/[0.06] p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">Potential increase in {entry.name}</span><span className="text-sm font-bold text-gold">+{entry.change}%</span></div><p className="mt-1 text-[10px] text-muted-foreground">Current: {entry.value} · Comparison: {entry.prior}. Possible explanations are not established by this comparison.</p></div>)}</div> : <EmptyState text={`No category spike detected. Current period: ${current} reports; comparison period: ${prior} reports.`} />}</section>;
}

function AggregatedMap({ incidents, districtData, onExplain }: { incidents: Incident[]; districtData: { name: string; value: number }[]; onExplain: () => void }) {
  const max = Math.max(...districtData.map((entry) => entry.value), 1);
  return <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><SectionHeading icon={MapPinned} title="Geographic intelligence" subtitle="Aggregated district activity — not a danger rating" /><button type="button" onClick={onExplain} className="text-[10px] text-muted-foreground hover:text-foreground">Explain this</button></div><div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]"><div className="relative min-h-[240px] overflow-hidden rounded-3xl border border-border/40 bg-[radial-gradient(circle_at_50%_42%,hsl(var(--primary)/.13),transparent_52%),linear-gradient(135deg,hsl(var(--secondary)/.65),hsl(var(--background)))] p-4"><div className="absolute inset-4 rounded-[45%] border border-primary/15 bg-primary/[0.025]" /><div className="absolute inset-[15%] rounded-[42%] border border-gold/10" /><div className="relative grid h-full grid-cols-3 gap-2">{districtData.slice(0, 9).map((entry, index) => <div key={entry.name} className="flex min-h-16 flex-col items-center justify-center rounded-2xl border border-border/40 bg-background/60 p-2 text-center" style={{ boxShadow: `0 0 ${8 + (entry.value / max) * 22}px hsl(var(--primary) / ${0.08 + (entry.value / max) * 0.18})` }}><span className="text-lg font-bold tabular-nums">{entry.value}</span><span className="text-[9px] text-muted-foreground">{entry.name}</span><span className={cn("mt-1 rounded-full px-1.5 py-0.5 text-[8px]", index === 0 ? "bg-gold/15 text-gold" : "bg-secondary text-muted-foreground")}>{index === 0 ? "Elevated activity" : "Reported activity"}</span></div>)}</div></div><div className="space-y-2"><div className="flex items-center justify-between rounded-2xl border border-border/40 bg-secondary/25 p-3"><span className="text-[11px] text-muted-foreground">Records with coordinates</span><strong className="text-sm">{incidents.filter((incident) => incident.latitude != null && incident.longitude != null).length}</strong></div><div className="rounded-2xl border border-info/25 bg-info/[0.06] p-3 text-[11px] leading-relaxed text-muted-foreground"><Info className="mr-1 inline h-3 w-3 text-info" /> Exact coordinates are intentionally omitted from this intelligence view. Drill-down to an operational case requires separate authorization.</div><div className="flex flex-wrap gap-1.5">{districtData.map((entry) => <span key={entry.name} className="rounded-full border border-border/50 bg-secondary/35 px-2 py-1 text-[10px] text-muted-foreground">{entry.name}: {entry.value}</span>)}</div></div></div></section>;
}

function TimePatterns({ timeData, incidents }: { timeData: { label: string; reports: number }[]; incidents: Incident[] }) {
  const busiest = [...timeData].sort((a, b) => b.reports - a.reports)[0];
  return <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><SectionHeading icon={Clock3} title="Time pattern analysis" subtitle="Hourly distribution from report timestamps; not a prediction" /><ResponsiveContainer width="100%" height={280}><BarChart data={timeData}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.35} vertical={false} /><XAxis dataKey="label" interval={2} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} /><YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} /><Tooltip contentStyle={TOOLTIP_STYLE} /><Bar dataKey="reports" fill="hsl(var(--primary))" radius={[5, 5, 0, 0]} name="Reports" /></BarChart></ResponsiveContainer><div className="mt-3 flex items-start gap-2 rounded-2xl border border-border/40 bg-secondary/25 p-3 text-[11px] leading-relaxed text-muted-foreground">{busiest?.reports ? <><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" /> Reports have historically been highest around {busiest.label} in this selected data. This describes reported timing only and does not predict future incidents.</> : <EmptyState text="Not enough timestamped records to identify a time pattern." />}</div><p className="mt-3 text-[10px] text-muted-foreground">{incidents.filter((incident) => incident.occurred_at).length} of {incidents.length} records include an occurrence timestamp. Monthly and seasonal patterns require more historical data.</p></section>;
}

function CategoryTable({ incidents, categoryData, responseMinutes }: { incidents: Incident[]; categoryData: { name: string; value: number }[]; responseMinutes: number | null }) {
  return <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><SectionHeading icon={Layers3} title="Category intelligence" subtitle="Volume, severity, location distribution and resolution status" /><div className="space-y-2">{categoryData.map((entry) => { const subset = incidents.filter((incident) => (incident.category ?? "Other") === entry.name); const critical = subset.filter((incident) => incident.priority === "critical").length; const closed = subset.filter((incident) => ["resolved", "closed"].includes(incident.status)).length; return <div key={entry.name} className="rounded-2xl border border-border/40 bg-secondary/20 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{entry.name}</span><span className="text-sm font-bold tabular-nums">{entry.value}</span></div><div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span>{critical} critical</span><span>·</span><span>{closed} resolved</span><span>·</span><span>{new Set(subset.map((incident) => incident.district ?? "Unspecified")).size} districts</span></div></div>; })}</div><p className="mt-4 text-[10px] text-muted-foreground">Overall resolution timing: {responseMinutes != null ? `${responseMinutes} minutes average` : "unavailable from available timestamps"}.</p></section>;
}

function ResourcePanel({ officers, incidents, unassigned, responders }: { officers: OfficerProfile[]; incidents: Incident[]; unassigned: number; responders: number }) {
  const available = officers.filter((officer) => ["available", "on_duty"].includes(officer.duty_status)).length;
  const stationWorkload = countBy(incidents, (incident) => incident.station_id ?? "Unassigned station").slice(0, 5);
  return <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><SectionHeading icon={Users} title="Resource intelligence" subtitle="Current authorized availability signals; no automatic reassignment" /><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Available officers" value={available} /><Metric label="Active assignments" value={incidents.filter((incident) => incident.assigned_officer_id && !["resolved", "closed"].includes(incident.status)).length} /><Metric label="Pending incidents" value={unassigned} /><Metric label="Responder activity" value={responders} /></div><div className="mt-4"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Station workload signal</p><div className="space-y-2">{stationWorkload.length ? stationWorkload.map((entry) => <div key={entry.name} className="flex items-center gap-3 text-[11px]"><span className="w-32 truncate text-muted-foreground">{entry.name}</span><div className="h-2 flex-1 rounded-full bg-secondary"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(8, Math.min(100, (entry.value / Math.max(stationWorkload[0].value, 1)) * 100))}%` }} /></div><strong>{entry.value}</strong></div>) : <EmptyState text="No station assignments are available for this period." />}</div></div></section>;
}

function ResponsePanel({ dispatches, incidents, responseMinutes, acknowledgementMinutes, dispatchMinutes, delays }: { dispatches: Dispatch[]; incidents: Incident[]; responseMinutes: number | null; acknowledgementMinutes: number | null; dispatchMinutes: number | null; delays: Dispatch[] }) {
  return <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><SectionHeading icon={Target} title="Response intelligence" subtitle="Aggregated timing observations; never use these metrics to punish individual officers" /><div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Metric label="Acknowledgement" value={formatMinutes(acknowledgementMinutes)} /><Metric label="Dispatch to scene" value={formatMinutes(dispatchMinutes)} /><Metric label="Resolution" value={formatMinutes(responseMinutes)} /><Metric label="Delayed acknowledgement" value={delays.length} /></div><div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-2xl border border-border/40 bg-secondary/20 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Evidence available</p><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{dispatches.length} dispatch records and {incidents.length} incident records were used. Travel time and officer acceptance are only shown where the existing schema provides timestamps.</p></div><div className="rounded-2xl border border-gold/25 bg-gold/[0.06] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold">Possible response delay</p><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{delays.length ? `${delays.length} dispatch records had more than 30 minutes before notification. Further review recommended; no blame is assigned.` : "No delayed acknowledgement signal was detected in the available dispatch records."}</p></div></div></section>;
}

function CommunitySafety({ incidents, activity, alerts }: { incidents: Incident[]; activity: SafetyActivity[]; alerts: { is_published: boolean; title: string; severity: string }[] }) {
  const published = alerts.filter((alert) => alert.is_published);
  return <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><SectionHeading icon={MessageSquareText} title="Community safety view" subtitle="Aggregated signals separated from police operational detail" /><div className="grid gap-3 md:grid-cols-4"><Metric label="Incident reports" value={incidents.length} /><Metric label="Safety activity" value={activity.length} /><Metric label="Published alerts" value={published.length} /><Metric label="Resolved cases" value={incidents.filter((incident) => ["resolved", "closed"].includes(incident.status)).length} /></div><div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-2xl border border-success/25 bg-success/[0.05] p-4"><p className="text-xs font-semibold">Public layer boundary</p><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Only explicitly approved alerts are published. This view does not include officer locations, active dispatch details, private citizen information, or sensitive investigations.</p></div><div className="rounded-2xl border border-border/40 bg-secondary/20 p-4"><p className="text-xs font-semibold">Community safety signals</p><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Repeated reports may become a community safety signal for human review. The system does not automatically classify every complaint as a crime.</p></div></div></section>;
}

function InsightsPanel({ cluster, spikeData, unassigned, delays, dataQuality, period }: { cluster?: { name: string; value: number }; spikeData: { name: string; value: number; prior: number; change: number }[]; unassigned: number; delays: number; dataQuality: ReturnType<typeof getDataQuality>; period: string }) {
  const insights = [
    cluster ? { id: "cluster", label: "POSSIBLE CONCENTRATION", title: `${cluster.value} reports grouped in ${cluster.name}`, body: "Reports share an aggregated district attribute. Further review may be useful; this is not a finding about people or places." } : { id: "cluster", label: "POSSIBLE CONCENTRATION", title: "No cluster signal detected", body: "No district met the current review threshold in the selected data." },
    spikeData[0] ? { id: "spike", label: "POTENTIAL INCREASE", title: `${spikeData[0].name} is up ${spikeData[0].change}% versus the comparison period`, body: "A comparison signal is present. The data does not establish causation or explain why reports changed." } : { id: "spike", label: "POTENTIAL INCREASE", title: "No category increase signal", body: "No category met the current comparison threshold." },
    { id: "resources", label: "RESOURCE SIGNAL", title: `${unassigned} unassigned incident${unassigned === 1 ? "" : "s"} · ${delays} delay signal${delays === 1 ? "" : "s"}`, body: "Authorized command should review coverage and communication conditions before taking action." },
    { id: "quality", label: "DATA QUALITY", title: `${dataQuality.unverified + dataQuality.missingLocation} records need quality review`, body: "Quality flags identify incomplete or unverified records. They are not findings about the underlying incident." },
  ];
  return <section className="space-y-3"><div className="flex items-end justify-between gap-3"><SectionHeading icon={BrainCircuit} title="AI insight cards" subtitle={`Non-binding observations · ${period}`} /><Badge label="AI observation · human review required" tone="gold" /></div><div className="grid gap-3 lg:grid-cols-2">{insights.map((insight) => <article key={insight.id} className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gold"><BrainCircuit className="h-3.5 w-3.5" /> {insight.label}</div><h3 className="mt-3 font-display text-sm font-semibold">{insight.title}</h3><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{insight.body}</p><div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3"><span className="text-[10px] text-muted-foreground">Confidence: moderate where data is sufficient</span><span className="text-[10px] font-semibold text-primary">Further review recommended</span></div></article>)}</div></section>;
}

function ReportsPanel({ reportType, setReportType, reportOpen, setReportOpen, scopedIncidents, critical, resolved, responseMinutes, onExport, onPrint }: { reportType: "daily" | "weekly" | "monthly"; setReportType: (type: "daily" | "weekly" | "monthly") => void; reportOpen: boolean; setReportOpen: (open: boolean) => void; scopedIncidents: Incident[]; critical: Incident[]; resolved: Incident[]; responseMinutes: number | null; onExport: () => void; onPrint: () => void }) {
  return <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><div className="flex flex-wrap items-start justify-between gap-3"><SectionHeading icon={FileText} title="Intelligence reports" subtitle="Generate from the selected authorized data period" /><div className="flex flex-wrap gap-2"><select value={reportType} onChange={(event) => setReportType(event.target.value as typeof reportType)} className="rounded-xl border border-border/60 bg-background px-3 py-2 text-[11px]"><option value="daily">Daily safety brief</option><option value="weekly">Weekly safety report</option><option value="monthly">Monthly intelligence report</option></select><button type="button" onClick={() => setReportOpen(!reportOpen)} className="rounded-xl bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground">{reportOpen ? "Hide report" : "Generate report"}</button><button type="button" onClick={onExport} className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-[11px]"><Download className="h-3 w-3" /> CSV</button><button type="button" onClick={onPrint} className="rounded-xl border border-border/60 px-3 py-2 text-[11px]">Print / PDF</button></div></div>{reportOpen && <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.04] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">AI-generated analysis based on available system data</p><h3 className="mt-2 font-display text-lg font-semibold">{reportType === "daily" ? "Daily Safety Brief" : reportType === "weekly" ? "Weekly Safety Report" : "Monthly Safety Intelligence Report"}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Incident volume" value={scopedIncidents.length} /><Metric label="Critical events" value={critical.length} /><Metric label="Resolved cases" value={resolved.length} /><Metric label="Avg resolution" value={formatMinutes(responseMinutes)} /></div><div className="mt-4 grid gap-3 md:grid-cols-2 text-[11px] leading-relaxed text-muted-foreground"><p><strong className="text-foreground">Executive summary:</strong> {scopedIncidents.length ? `${scopedIncidents.length} authorized reports were recorded in this period, including ${critical.length} critical records.` : "No authorized reports were returned for this period."}</p><p><strong className="text-foreground">Limitations:</strong> This report reflects available system data only. It is not a complete view of every jurisdiction and does not establish causation or legal connection.</p></div></div>}</section>;
}

function AlertCenter({ cluster, spikeData, delays, dataQuality, statuses, onStatusChange }: { cluster?: { name: string; value: number }; spikeData: { name: string; value: number; prior: number; change: number }[]; delays: number; dataQuality: ReturnType<typeof getDataQuality>; statuses: Record<string, ReviewStatus>; onStatusChange: (id: string, status: ReviewStatus) => void }) {
  const alerts = [
    ...(cluster ? [{ id: "cluster-alert", label: "Possible cluster", evidence: `${cluster.value} reports grouped in ${cluster.name}.` }] : []),
    ...(spikeData[0] ? [{ id: "spike-alert", label: "Trend detected", evidence: `${spikeData[0].name} shows a potential increase versus the comparison period.` }] : []),
    ...(delays ? [{ id: "delay-alert", label: "Response delay", evidence: `${delays} dispatch records exceeded the acknowledgement review threshold.` }] : []),
    ...((dataQuality.missingLocation + dataQuality.unverified) ? [{ id: "quality-alert", label: "Data anomaly", evidence: `${dataQuality.missingLocation + dataQuality.unverified} records have location or verification gaps.` }] : []),
  ];
  return <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><div className="flex items-start justify-between gap-3"><SectionHeading icon={BellRing} title="Command alerts" subtitle="New → reviewing → acknowledged → human decision → resolved" /><Badge label="No automatic action" tone="neutral" /></div>{alerts.length ? <div className="mt-4 space-y-2">{alerts.map((alert) => <SignalCard key={alert.id} id={alert.id} label={alert.label} evidence={alert.evidence} tone="warning" status={statuses[alert.id] ?? "New"} onStatusChange={onStatusChange} />)}</div> : <EmptyState text="No intelligence alerts generated from the available records." />}</section>;
}

function SystemHealth({ health, auditCount }: { health: { label: string; value: string; detail: string }[]; auditCount: number }) {
  return <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><div className="flex items-start justify-between gap-3"><SectionHeading icon={RefreshCw} title="System health" subtitle="Failures and limitations remain visible to command" /><span className="text-[10px] text-muted-foreground">{auditCount} recent audit entries loaded</span></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{health.map((item) => <div key={item.label} className="flex items-start gap-3 rounded-2xl border border-border/40 bg-secondary/20 p-3"><span className={cn("mt-1 h-2 w-2 rounded-full", item.value === "Operational" || item.value === "Available" ? "bg-success" : item.value === "Degraded" || item.value === "Current session" ? "bg-gold" : "bg-primary")} /><div><p className="text-xs font-semibold">{item.label} · {item.value}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.detail}</p></div></div>)}</div><p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">AI is an enhancement, not a single point of failure. SOS, incident creation, dispatch, notifications, and manual reporting continue through their existing workflows when AI is unavailable.</p></section>;
}

function SignalCard({ id, label, evidence, tone, status, onStatusChange }: { id: string; label: string; evidence: string; tone: "critical" | "warning" | "info"; status: ReviewStatus; onStatusChange: (id: string, status: ReviewStatus) => void }) {
  const next = REVIEW_FLOW[Math.min(REVIEW_FLOW.indexOf(status) + 1, REVIEW_FLOW.length - 1)];
  return <div className="rounded-2xl border border-border/45 bg-secondary/20 p-3"><div className="flex flex-wrap items-center gap-2"><span className={cn("h-2 w-2 rounded-full", tone === "critical" ? "bg-primary" : tone === "warning" ? "bg-gold" : "bg-info")} /><span className="text-xs font-semibold">{label}</span><span className="ml-auto rounded-full border border-border/50 px-2 py-0.5 text-[9px] text-muted-foreground">{status}</span></div><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{evidence}</p><div className="mt-3 flex flex-wrap items-center gap-2"><Badge label="AI observation · unconfirmed" tone="gold" /><button type="button" disabled={status === "Resolved"} onClick={() => onStatusChange(id, next)} className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-primary disabled:opacity-40">{status === "Resolved" ? "Archived" : `Move to ${next}`} <ChevronRight className="h-3 w-3" /></button></div></div>;
}

function BriefingDialog({ incidents, critical, active, unassigned, cluster, spikeData, period, onClose }: { incidents: Incident[]; critical: Incident[]; active: Incident[]; unassigned: number; cluster?: { name: string; value: number }; spikeData: { name: string; value: number; prior: number; change: number }[]; period: string; onClose: () => void }) {
  return <Dialog title="What command needs to know right now" onClose={onClose}><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold">AI-generated analysis based on available system data</p><div className="mt-4 space-y-3"><BriefItem title="3 most important developments" body={`${incidents.length} reports in period · ${critical.length} critical · ${active.length} still active`} /><BriefItem title="Resource issues" body={`${unassigned} unassigned incident${unassigned === 1 ? "" : "s"} require human review`} /><BriefItem title="Emerging patterns" body={cluster ? `Possible concentration in ${cluster.name}. ${spikeData[0] ? `Potential increase in ${spikeData[0].name}.` : ""}` : "No concentration signal met the current review threshold."} /><BriefItem title="Required decisions" body="Review alerts, confirm coverage, and decide whether a prevention action is appropriate." /><BriefItem title="Unknowns" body="Data completeness, jurisdiction coverage, and causation are not established by this briefing." /></div><p className="mt-4 border-t border-border/40 pt-3 text-[10px] text-muted-foreground">Data period: {period} · Human approval is required before action.</p></Dialog>;
}

function PreventionPlanner({ area, category, setArea, setCategory, categories, incidents, onClose }: { area: string; category: string; setArea: (value: string) => void; setCategory: (value: string) => void; categories: string[]; incidents: Incident[]; onClose: () => void }) {
  const scoped = incidents.filter((incident) => (!area || (incident.district ?? "").toLowerCase().includes(area.toLowerCase())) && (category === "all" || (incident.category ?? "Other") === category));
  const [approved, setApproved] = useState(false);
  const approve = () => {
    setApproved(true);
    void logAudit("prevention_recommendation_approved", "prevention_plan", undefined, { area: area || "all authorized areas", category, evidence_count: scoped.length });
  };
  return <Dialog title="Prevention planner" onClose={onClose}><p className="text-[11px] leading-relaxed text-muted-foreground">Generate a non-binding planning prompt from observed reports. No recommendation may use protected characteristics or individual risk scores.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Area<input value={area} onChange={(event) => setArea(event.target.value)} placeholder="District or configured area" className="mt-1.5 w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground" /></label><label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Problem category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground"><option value="all">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="mt-4 rounded-2xl border border-primary/25 bg-primary/[0.05] p-4"><Badge label="AI observation · reported data" tone="gold" /><h3 className="mt-2 text-sm font-semibold">Observed issue</h3><p className="mt-1 text-[11px] text-muted-foreground">{scoped.length} matching authorized reports are available for review.</p><h3 className="mt-3 text-sm font-semibold">Potential intervention</h3><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Consider community awareness activity, response coverage review, or infrastructure coordination if supported by local evidence.</p><h3 className="mt-3 text-sm font-semibold">Measurement method</h3><p className="mt-1 text-[11px] text-muted-foreground">Review incident volume, response performance, and community feedback after the selected review date.</p></div><div className="mt-4 flex items-center justify-between gap-3"><span className="text-[10px] text-muted-foreground">{approved ? "Human approval recorded in audit log." : "Human approval required before action."}</span><button type="button" onClick={approve} disabled={approved} className="rounded-full bg-primary px-4 py-2 text-[11px] font-semibold text-primary-foreground disabled:opacity-50">{approved ? "Approved for review" : "Approve recommendation"}</button></div></Dialog>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border/60 bg-card p-5 shadow-lift"><div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg font-semibold">{title}</h2><button type="button" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button></div>{children}</div></div>;
}

function BriefItem({ title, body }: { title: string; body: string }) {
  return <div className="rounded-2xl border border-border/40 bg-secondary/20 p-3"><p className="text-xs font-semibold">{title}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{body}</p></div>;
}

function ChartCard({ title, subtitle, children, onExplain }: { title: string; subtitle: string; children: ReactNode; onExplain: () => void }) {
  return <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><div className="mb-3"><h2 className="font-display text-sm font-semibold">{title}</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p></div>{children}<button type="button" onClick={onExplain} className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"><Info className="h-3 w-3" /> Explain this</button></section>;
}

function SectionHeading({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
  return <div className="flex items-start gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><h2 className="font-display text-sm font-semibold">{title}</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p></div></div>;
}

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: number | string; icon: LucideIcon; tone: string }) {
  return <div className="premium-surface rounded-3xl border border-border/55 p-4 shadow-soft"><div className="flex items-center justify-between"><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><Icon className={cn("h-4 w-4", tone === "critical" ? "text-primary" : tone === "alert" ? "text-alert" : tone === "gold" ? "text-gold" : tone === "success" ? "text-success" : "text-primary")} /></div><p className="mt-2 font-display text-2xl font-bold tabular-nums">{value}</p></div>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-2xl border border-border/40 bg-secondary/25 p-3"><p className="font-display text-lg font-bold tabular-nums">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{label}</p></div>;
}

function Badge({ label, tone }: { label: string; tone: "gold" | "neutral" }) {
  return <span className={cn("inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold", tone === "gold" ? "border-gold/30 bg-gold/10 text-gold" : "border-border/50 bg-secondary/40 text-muted-foreground")}>{label}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-border/50 bg-secondary/15 p-4 text-[11px] text-muted-foreground">{text}</p>;
}

function getPeriod(range: RangeKey, customFrom: string, customTo: string) {
  const now = new Date();
  const to = range === "custom" && customTo ? new Date(`${customTo}T23:59:59`).getTime() : now.getTime();
  if (range === "custom" && customFrom) return { from: new Date(`${customFrom}T00:00:00`).getTime(), to };
  if (range === "today") return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), to };
  if (range === "year") return { from: new Date(now.getFullYear(), 0, 1).getTime(), to };
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  return { from: now.getTime() - days * 864e5, to };
}

function getRangeLabel(range: RangeKey) {
  return RANGE_OPTIONS.find((option) => option.value === range)?.label ?? "Selected period";
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
}

function formatMinutes(value: number | null) {
  return value == null ? "Unavailable" : `${value} min`;
}

function differenceMinutes(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const minutes = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  return minutes >= 0 ? minutes : null;
}

function averageMinutes(values: (number | null)[]) {
  const usable = values.filter((value): value is number => value != null);
  return usable.length ? Math.round(usable.reduce((total, value) => total + value, 0) / usable.length) : null;
}

function countBy(items: Incident[], getKey: (item: Incident) => string) {
  const counts: Record<string, number> = {};
  items.forEach((item) => {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name: name.length > 22 ? `${name.slice(0, 21)}…` : name, value }));
}

function uniqueCategories(items: Incident[]) {
  return Array.from(new Set(items.map((item) => item.category ?? "Other"))).sort();
}

function uniqueDistricts(items: Incident[]) {
  return Array.from(new Set(items.map((item) => item.district ?? "Unspecified"))).sort();
}

function buildTrend(items: Incident[], from: number, to: number) {
  const days = Math.max(1, Math.ceil((to - from) / 864e5));
  const buckets = days <= 2 ? 12 : days <= 14 ? 7 : 6;
  const bucketSize = (to - from) / buckets;
  return Array.from({ length: buckets }, (_, index) => {
    const start = from + index * bucketSize;
    const end = index === buckets - 1 ? to + 1 : start + bucketSize;
    const bucket = items.filter((item) => {
      const timestamp = new Date(item.created_at).getTime();
      return timestamp >= start && timestamp < end;
    });
    return { label: new Date(start).toLocaleDateString("en-UG", { month: "short", day: "numeric" }), incidents: bucket.length, resolved: bucket.filter((item) => ["resolved", "closed"].includes(item.status)).length };
  });
}

function buildTimeData(items: Incident[]) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, "0")}:00`, reports: 0 }));
  items.forEach((item) => { const timestamp = item.occurred_at ?? item.created_at; const hour = new Date(timestamp).getHours(); hours[hour].reports += 1; });
  return hours;
}

function getDataQuality(items: Incident[]) {
  const missingLocation = items.filter((item) => !item.location_text && item.latitude == null && item.longitude == null).length;
  const unverified = items.filter((item) => !item.verified_at).length;
  const duplicates = items.filter((item) => item.is_possible_duplicate).length;
  const missingTime = items.filter((item) => !item.occurred_at).length;
  return { missingLocation, unverified, duplicates, missingTime };
}