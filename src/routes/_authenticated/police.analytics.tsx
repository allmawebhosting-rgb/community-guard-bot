import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { TrendingUp, Clock, Award, Flame, Brain } from "lucide-react";
import {
  incidentsQuery, officersQuery, dispatchesQuery,
  type IncidentPriority,
} from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/analytics")({
  component: AnalyticsPage,
});

const PRIORITY_COLORS: Record<string, string> = {
  critical: "hsl(var(--primary))",
  high: "hsl(var(--alert))",
  medium: "hsl(var(--gold))",
  low: "hsl(var(--success))",
};

const CATEGORY_COLORS = [
  "hsl(var(--primary))", "hsl(var(--gold))", "hsl(var(--alert))",
  "hsl(var(--success))", "#818cf8", "#f472b6", "#34d399", "#fb923c",
];

function AnalyticsPage() {
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const { data: officers = [] } = useQuery(officersQuery);
  const { data: dispatches = [] } = useQuery(dispatchesQuery);

  // Monthly trend (last 6 months)
  const monthlyTrend = useMemo(() => {
    const months: Record<string, { month: string; reports: number; resolved: number }> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
      months[key] = { month: key, reports: 0, resolved: 0 };
    }
    incidents.forEach((inc) => {
      const d = new Date(inc.created_at);
      const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
      if (months[key]) {
        months[key].reports++;
        if (inc.status === "resolved" || inc.status === "closed") months[key].resolved++;
      }
    });
    return Object.values(months);
  }, [incidents]);

  // By priority
  const byPriority = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    incidents.forEach((i) => { if (i.priority && counts[i.priority] !== undefined) counts[i.priority]++; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [incidents]);

  // By district
  const byDistrict = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach((i) => {
      const k = i.district ?? "Unknown";
      counts[k] = (counts[k] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([district, count]) => ({ district: district.length > 14 ? district.slice(0, 13) + "…" : district, count }));
  }, [incidents]);

  // By category
  const byCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach((i) => {
      const k = i.category ?? "Other";
      counts[k] = (counts[k] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([name, value]) => ({ name, value }));
  }, [incidents]);

  // Avg response time (minutes)
  const avgResponseTime = useMemo(() => {
    const resolved = incidents.filter((i) => i.resolved_at && i.created_at);
    if (!resolved.length) return null;
    const total = resolved.reduce((acc, i) => {
      return acc + (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime());
    }, 0);
    return Math.round(total / resolved.length / 60000);
  }, [incidents]);

  // Officer performance (dispatches completed)
  const officerPerf = useMemo(() => {
    const counts: Record<string, { name: string; completed: number }> = {};
    dispatches.forEach((d) => {
      if (d.status !== "completed") return;
      const off = officers.find((o) => o.id === d.officer_id);
      if (!off) return;
      const k = d.officer_id;
      if (!counts[k]) counts[k] = { name: off.full_name || "Officer", completed: 0 };
      counts[k].completed++;
    });
    return Object.values(counts).sort((a, b) => b.completed - a.completed).slice(0, 6);
  }, [dispatches, officers]);

  // Resolution rate
  const resolutionRate = incidents.length
    ? Math.round((incidents.filter((i) => i.status === "resolved" || i.status === "closed").length / incidents.length) * 100)
    : 0;

  const aiInsights = useMemo(() => {
    const critCount = incidents.filter((i) => i.priority === "critical").length;
    const topDistrict = byDistrict[0]?.district ?? "N/A";
    const topCat = byCategory[0]?.name ?? "N/A";
    return [
      critCount > 5
        ? `⚠️ ${critCount} critical incidents require immediate command attention.`
        : `✅ Critical incident count is within acceptable range (${critCount}).`,
      `📍 ${topDistrict} district has the highest incident concentration — consider resource reallocation.`,
      `🔍 "${topCat}" is the most reported incident category — targeted prevention may reduce volume.`,
      avgResponseTime
        ? avgResponseTime > 120
          ? `⏱ Average response time of ${avgResponseTime} min exceeds the 2-hour benchmark — review dispatch efficiency.`
          : `⚡ Average response time of ${avgResponseTime} min is within acceptable limits.`
        : `📊 Insufficient resolved cases to calculate average response time.`,
      `📈 Resolution rate stands at ${resolutionRate}% — ${resolutionRate < 60 ? "below target, review case backlog." : "on track with targets."}`,
    ];
  }, [incidents, byDistrict, byCategory, avgResponseTime, resolutionRate]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-xl font-semibold">Analytics & Intelligence</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Crime trends, officer performance, and AI-generated insights</p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Reports" value={incidents.length} icon={TrendingUp} tone="text-primary" />
        <KpiCard label="Resolution Rate" value={`${resolutionRate}%`} icon={Award} tone="text-success" />
        <KpiCard label="Avg Response (min)" value={avgResponseTime ?? "—"} icon={Clock} tone="text-gold" />
        <KpiCard label="Officers Active" value={officers.filter((o) => o.duty_status !== "offline").length} icon={Flame} tone="text-alert" />
      </div>

      {/* AI Insights */}
      <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
        <div className="mb-3 flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-semibold">AI Insights</h2>
        </div>
        <ul className="space-y-2">
          {aiInsights.map((insight, i) => (
            <li key={i} className="rounded-2xl border border-border/40 bg-secondary/30 px-4 py-2.5 text-sm">
              {insight}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Monthly Trend */}
        <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
          <h2 className="mb-4 font-display text-sm font-semibold">Reports vs Resolved (6 months)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
              <Line type="monotone" dataKey="reports" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Reports" />
              <Line type="monotone" dataKey="resolved" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="Resolved" />
            </LineChart>
          </ResponsiveContainer>
        </section>

        {/* By District */}
        <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
          <h2 className="mb-4 font-display text-sm font-semibold">Incidents by District</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byDistrict} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis dataKey="district" type="category" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={80} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} name="Incidents" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        {/* By Priority */}
        <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
          <h2 className="mb-4 font-display text-sm font-semibold">Incidents by Priority</h2>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={160}>
              <PieChart>
                <Pie data={byPriority} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                  {byPriority.map((entry, i) => (
                    <Cell key={i} fill={PRIORITY_COLORS[entry.name] ?? "#888"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {byPriority.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITY_COLORS[entry.name] }} />
                  <span className="capitalize text-muted-foreground">{entry.name}</span>
                  <span className="ml-auto font-medium tabular-nums">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* By Category */}
        <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
          <h2 className="mb-4 font-display text-sm font-semibold">Cases by Category</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byCategory}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Cases">
                {byCategory.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      {/* Officer Performance */}
      {officerPerf.length > 0 && (
        <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
          <h2 className="mb-4 font-display text-sm font-semibold">Officer Performance (Completed Dispatches)</h2>
          <div className="space-y-3">
            {officerPerf.map((o, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-5 text-center text-[11px] font-bold text-muted-foreground">#{i + 1}</span>
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-gold text-[10px] font-bold text-primary-foreground">
                  {o.name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{o.name}</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border/40">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-gold"
                      style={{ width: `${Math.min((o.completed / (officerPerf[0]?.completed ?? 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-xs font-semibold tabular-nums">{o.completed}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: number | string; icon: typeof TrendingUp; tone: string }) {
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
