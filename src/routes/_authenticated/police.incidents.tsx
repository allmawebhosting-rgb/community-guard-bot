import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  incidentsQuery,
  PRIORITY_META,
  statusLabel,
  timeAgo,
  type IncidentPriority,
} from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/incidents")({
  component: IncidentsPage,
});

const FILTERS = ["all", "critical", "high", "medium", "low"] as const;

function IncidentsPage() {
  const qc = useQueryClient();
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [q, setQ] = useState("");

  // Real-time: push new/updated incidents in without page refresh
  useEffect(() => {
    const channel = supabase
      .channel("police-incidents-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => {
        qc.invalidateQueries({ queryKey: ["police", "incidents"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const rows = incidents.filter((i) => {
    if (filter !== "all" && i.priority !== filter) return false;
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return [i.title, i.reference, i.district, i.location_text, i.category]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle));
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            maxLength={80}
            placeholder="Search by reference, title, district…"
            className="rounded-full pl-9"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs capitalize transition",
                filter === f
                  ? "border-primary/55 bg-primary/12 text-foreground"
                  : "border-border/50 bg-secondary/35 text-muted-foreground hover:border-border",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((incident) => {
          const meta = PRIORITY_META[incident.priority as IncidentPriority];
          return (
            <Link
              key={incident.id}
              to="/police/cases/$caseId"
              params={{ caseId: incident.id }}
              className="premium-surface block rounded-3xl border border-border/55 p-4 shadow-soft transition hover:border-border"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]", meta.chip)}>
                  {meta.label}
                </span>
                <span className="rounded-full border border-border/50 bg-secondary/40 px-2.5 py-0.5 text-[10px] text-muted-foreground">
                  {statusLabel(incident.status)}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {incident.reference} · {timeAgo(incident.created_at)}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium">{incident.title}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {incident.ai_summary ?? incident.summary}
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {incident.location_text ?? "Unknown location"} · {incident.district ?? "—"}
              </p>
            </Link>
          );
        })}
        {rows.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No matching incidents.</p>
        )}
      </div>
    </div>
  );
}
