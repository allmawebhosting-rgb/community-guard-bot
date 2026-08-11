import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  Info,
  MapPinned,
  RadioTower,
  ShieldAlert,
  Sparkles,
  Users,
  Wifi,
} from "lucide-react";
import {
  dispatchesQuery,
  incidentsQuery,
  officersQuery,
  safetyActivityQuery,
  type Incident,
} from "@/lib/police";
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

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
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

function IntelligenceCenter() {
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const { data: officers = [] } = useQuery(officersQuery);
  const { data: dispatches = [] } = useQuery(dispatchesQuery);
  const { data: activity = [] } = useQuery(safetyActivityQuery);
  const [range, setRange] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const period = useMemo(() => getPeriod(range, customFrom, customTo), [range, customFrom, customTo]);
  const scopedIncidents = useMemo(
    () => incidents.filter((incident) => new Date(incident.created_at).getTime() >= period.from && new Date(incident.created_at).getTime() <= period.to),
    [incidents, period],
  );
  const scopedDispatches = useMemo(
    () => dispatches.filter((dispatch) => new Date(dispatch.created_at).getTime() >= period.from && new Date(dispatch.created_at).getTime() <= period.to),
    [dispatches, period],
  );

  const active = scopedIncidents.filter((incident) => !["resolved", "closed"].includes(incident.status));
  const resolved = scopedIncidents.filter((incident) => ["resolved", "closed"].includes(incident.status));
  const critical = scopedIncidents.filter((incident) => incident.priority === "critical");
  const high = scopedIncidents.filter((incident) => incident.priority === "high");
  const unassigned = active.filter((incident) => !incident.assigned_officer_id);
  const responderActivity = activity.filter((event) => event.activity_type.toLowerCase().includes("responder"));
  const responseMinutes = averageMinutes(resolved.map((incident) => differenceMinutes(incident.created_at, incident.resolved_at)));
  const acknowledgementMinutes = averageMinutes(
    scopedDispatches.map((dispatch) => differenceMinutes(dispatch.created_at, dispatch.notified_at)),
  );
  const escalationRate = scopedIncidents.length ? Math.round((scopedIncidents.filter((i) => i.status === "escalated" || i.priority === "critical").length / scopedIncidents.length) * 100) : 0;
  const categoryData = countBy(scopedIncidents, (incident) => incident.category ?? "Other").slice(0, 7);
  const districtData = countBy(scopedIncidents, (incident) => incident.district ?? "Unspecified").slice(0, 7);
  const trendData = buildTrend(scopedIncidents, period.from, period.to);
  const cluster = districtData.find((entry) => entry.value >= 3);
  const dataQuality = getDataQuality(scopedIncidents);

  const insightCards = [
    {
      label: "POSSIBLE PATTERN",
      title: cluster ? `${cluster.name} has the highest reported activity` : "No concentration signal in the selected data",
      body: cluster
        ? `${cluster.value} reports are grouped at the district level. This is an aggregated observation, not a finding about people or places.`
        : "A larger or longer data period may be needed before a concentration signal can be reviewed.",
      action: "Review underlying incidents",
    },
    {
      label: "RESOURCE SIGNAL",
      title: unassigned.length ? `${unassigned.length} incident${unassigned.length === 1 ? "" : "s"} remain unassigned` : "No unassigned incident signal",
      body: unassigned.length
        ? "Current queue data suggests a possible coverage gap. Authorized command should review availability before taking action."
        : "No unassigned cases were found in the selected period.",
      action: "Review resource availability",
    },
    {
      label: "RESPONSE OBSERVATION",
      title: responseMinutes != null ? `Average resolution is ${responseMinutes} minutes` : "Resolution timing is unavailable",
      body: responseMinutes != null ? "This describes observed case timing only and should not be used to assign individual blame." : "More resolved records with timestamps are required to calculate this metric.",
      action: "Explain this metric",
    },
  ];

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
        <div className="flex items-center gap-2 rounded-full border border-success/25 bg-success/10 px-3 py-1.5 text-[10px] font-semibold text-success">
          <Wifi className="h-3 w-3" /> Authorized data view
        </div>
      </header>

      <section className="premium-surface rounded-3xl border border-border/55 p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Data period</span>
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRange(option.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[11px] transition",
                range === option.value
                  ? "border-primary/50 bg-primary/12 text-foreground"
                  : "border-border/50 bg-secondary/30 text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {formatDate(period.from)} — {formatDate(period.to)}
          </span>
        </div>
        {range === "custom" && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border/40 pt-3">
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              From <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="rounded-xl border border-border/60 bg-background px-2 py-1.5 text-foreground" />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              To <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="rounded-xl border border-border/60 bg-background px-2 py-1.5 text-foreground" />
            </label>
          </div>
        )}
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-info/25 bg-info/[0.06] px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          This center uses authorized records returned for the selected period and reports aggregated observations. It does not expose exact citizen locations, officer locations, or private case details. AI assists; authorized humans decide.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total incidents" value={scopedIncidents.length} icon={BarChart3} tone="primary" />
        <Kpi label="Critical" value={critical.length} icon={ShieldAlert} tone="critical" />
        <Kpi label="High priority" value={high.length} icon={AlertTriangle} tone="alert" />
        <Kpi label="Active" value={active.length} icon={RadioTower} tone="gold" />
        <Kpi label="Resolved" value={resolved.length} icon={CheckCircle2} tone="success" />
        <Kpi label="Escalation rate" value={`${escalationRate}%`} icon={TrendingIcon} tone="primary" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <ChartCard title="Incident volume over time" subtitle="Reported events in the selected period">
          <ResponsiveContainer width="100%" height={235}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.35} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="incidents" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} name="Incidents" />
              <Line type="monotone" dataKey="resolved" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="Resolved" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Category analysis" subtitle="Volume by configured incident category">
          <ResponsiveContainer width="100%" height={235}>
            <BarChart data={categoryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.35} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Reports">
                {categoryData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Geographic intelligence" subtitle="Aggregated district activity — not a danger rating">
          <ResponsiveContainer width="100%" height={235}>
            <BarChart data={districtData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.35} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis dataKey="name" type="category" width={92} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} name="Reports" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ResourcePanel officers={officers} unassigned={unassigned.length} responders={responderActivity.length} />
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">AI insight cards</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Non-binding observations from the selected data period</p>
          </div>
          <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[10px] font-semibold text-gold">Human review required</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {insightCards.map((card) => <InsightCard key={card.label} {...card} />)}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-2"><Database className="h-4 w-4 text-alert" /><h2 className="font-display text-sm font-semibold">Data quality</h2></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Quality label="Missing locations" value={dataQuality.missingLocation} />
            <Quality label="Unverified" value={dataQuality.unverified} />
            <Quality label="Possible duplicates" value={dataQuality.duplicates} />
            <Quality label="Missing timestamps" value={dataQuality.missingTime} />
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">Quality flags identify records needing review. They are not findings about the underlying incident.</p>
        </section>
        <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-2"><Clock3 className="h-4 w-4 text-gold" /><h2 className="font-display text-sm font-semibold">Response intelligence</h2></div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Average resolution" value={responseMinutes != null ? `${responseMinutes} min` : "Unavailable"} />
            <Metric label="Average acknowledgement" value={acknowledgementMinutes != null ? `${acknowledgementMinutes} min` : "Unavailable"} />
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">Timing is shown only where system timestamps exist. Do not use aggregated metrics to unfairly punish individual officers.</p>
        </section>
      </div>

      <p className="flex items-center justify-center gap-1.5 pb-4 text-center text-[10px] text-muted-foreground/70">
        <MapPinned className="h-3 w-3" /> Exact citizen, officer, and responder locations remain restricted to legitimate operational views.
      </p>
    </div>
  );
}

function TrendingIcon() {
  return <Sparkles className="h-4 w-4" />;
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

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
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
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name: name.length > 18 ? `${name.slice(0, 17)}…` : name, value }));
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
    return {
      label: new Date(start).toLocaleDateString("en-UG", { month: "short", day: "numeric" }),
      incidents: bucket.length,
      resolved: bucket.filter((item) => ["resolved", "closed"].includes(item.status)).length,
    };
  });
}

function getDataQuality(items: Incident[]) {
  const missingLocation = items.filter((item) => !item.location_text && item.latitude == null && item.longitude == null).length;
  const unverified = items.filter((item) => !item.verified_at).length;
  const duplicates = items.filter((item) => item.is_possible_duplicate).length;
  const missingTime = items.filter((item) => !item.occurred_at).length;
  return { missingLocation, unverified, duplicates, missingTime };
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><div className="mb-3"><h2 className="font-display text-sm font-semibold">{title}</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p></div>{children}<button type="button" className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"><Info className="h-3 w-3" /> Explain this</button></section>;
}

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: number | string; icon: typeof BarChart3 | typeof TrendingIcon; tone: string }) {
  return <div className="premium-surface rounded-3xl border border-border/55 p-4 shadow-soft"><div className="flex items-center justify-between"><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><Icon className={cn("h-4 w-4", tone)} /></div><p className="mt-2 font-display text-2xl font-bold tabular-nums">{value}</p></div>;
}

function ResourcePanel({ officers, unassigned, responders }: { officers: { duty_status: string }[]; unassigned: number; responders: number }) {
  const available = officers.filter((officer) => ["available", "on_duty"].includes(officer.duty_status)).length;
  return <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><div className="mb-4 flex items-center gap-2"><Users className="h-4 w-4 text-success" /><div><h2 className="font-display text-sm font-semibold">Resource intelligence</h2><p className="text-[11px] text-muted-foreground">Current authorized availability signals</p></div></div><div className="grid grid-cols-3 gap-2"><Metric label="Available officers" value={available} /><Metric label="Unassigned cases" value={unassigned} /><Metric label="Responder events" value={responders} /></div><div className="mt-4 flex items-start gap-2 rounded-2xl border border-gold/25 bg-gold/[0.06] p-3 text-[11px] leading-relaxed text-muted-foreground"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" /> Potential resource pressure requires human review; the system does not automatically reassign officers.</div></section>;
}

function InsightCard({ label, title, body, action }: { label: string; title: string; body: string; action: string }) {
  return <article className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gold"><BrainCircuit className="h-3.5 w-3.5" /> {label}</div><h3 className="mt-3 font-display text-sm font-semibold">{title}</h3><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{body}</p><div className="mt-4 border-t border-border/40 pt-3 text-[10px] font-semibold text-primary">Recommended next step · {action}</div></article>;
}

function Quality({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-border/40 bg-secondary/25 p-3"><p className="font-display text-xl font-bold tabular-nums">{value}</p><p className="mt-1 text-[10px] leading-tight text-muted-foreground">{label}</p></div>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-2xl border border-border/40 bg-secondary/25 p-3"><p className="font-display text-lg font-bold tabular-nums">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{label}</p></div>;
}