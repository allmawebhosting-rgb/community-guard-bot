import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Search, FileText, MapPin, Clock, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  incidentsQuery, missingPersonsQuery, lostFoundQuery,
  PRIORITY_META, statusLabel, timeAgo, type IncidentPriority,
} from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/search")({
  component: SearchPage,
});

const SEARCH_FIELDS = [
  { label: "All", value: "all" },
  { label: "Case No.", value: "reference" },
  { label: "District", value: "district" },
  { label: "Category", value: "category" },
  { label: "Location", value: "location" },
  { label: "Keywords", value: "keywords" },
] as const;

type SearchField = (typeof SEARCH_FIELDS)[number]["value"];

function SearchPage() {
  const [q, setQ] = useState("");
  const [field, setField] = useState<SearchField>("all");
  const [tab, setTab] = useState<"incidents" | "missing" | "lostfound">("incidents");

  const { data: incidents = [] } = useQuery(incidentsQuery);
  const { data: missing = [] } = useQuery(missingPersonsQuery);
  const { data: lostFound = [] } = useQuery(lostFoundQuery);

  const searchTerm = q.trim().toLowerCase();

  const filteredIncidents = useMemo(() => {
    if (!searchTerm) return incidents.slice(0, 30);
    return incidents.filter((inc) => {
      switch (field) {
        case "reference": return inc.reference?.toLowerCase().includes(searchTerm);
        case "district":  return inc.district?.toLowerCase().includes(searchTerm);
        case "category":  return inc.category?.toLowerCase().includes(searchTerm);
        case "location":  return inc.location_text?.toLowerCase().includes(searchTerm);
        case "keywords":  return inc.title?.toLowerCase().includes(searchTerm) || inc.summary?.toLowerCase().includes(searchTerm);
        default:
          return (
            inc.reference?.toLowerCase().includes(searchTerm) ||
            inc.title?.toLowerCase().includes(searchTerm) ||
            inc.district?.toLowerCase().includes(searchTerm) ||
            inc.category?.toLowerCase().includes(searchTerm) ||
            inc.location_text?.toLowerCase().includes(searchTerm) ||
            inc.summary?.toLowerCase().includes(searchTerm)
          );
      }
    });
  }, [incidents, searchTerm, field]);

  const filteredMissing = useMemo(() => {
    if (!searchTerm) return missing.slice(0, 30);
    return missing.filter((m) =>
      m.full_name?.toLowerCase().includes(searchTerm) ||
      m.last_seen_location?.toLowerCase().includes(searchTerm) ||
      m.district?.toLowerCase().includes(searchTerm),
    );
  }, [missing, searchTerm]);

  const filteredLost = useMemo(() => {
    if (!searchTerm) return lostFound.slice(0, 30);
    return lostFound.filter((l) =>
      l.item_type?.toLowerCase().includes(searchTerm) ||
      l.description?.toLowerCase().includes(searchTerm) ||
      l.location_text?.toLowerCase().includes(searchTerm),
    );
  }, [lostFound, searchTerm]);

  const totalResults = filteredIncidents.length + filteredMissing.length + filteredLost.length;

  return (
    <div className="w-full space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Report Search</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Search across all incidents, missing persons, and lost &amp; found</p>
      </div>

      {/* Search bar */}
      <div className="premium-surface rounded-3xl border border-border/55 p-4 shadow-soft space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by case number, location, category, keyword…"
            className="rounded-2xl pl-10 text-base h-11"
            autoFocus
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Search in:
          </div>
          {SEARCH_FIELDS.map((f) => (
            <button
              key={f.value}
              onClick={() => setField(f.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-medium transition",
                field === f.value
                  ? "border-primary/40 bg-primary/12 text-primary"
                  : "border-border/50 text-muted-foreground hover:border-border",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {searchTerm && (
        <p className="text-xs text-muted-foreground">
          Found <strong className="text-foreground">{totalResults}</strong> results for "{q}"
        </p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border border-border/50 bg-secondary/30 p-1 w-fit">
        {(["incidents", "missing", "lostfound"] as const).map((t) => {
          const count = t === "incidents" ? filteredIncidents.length : t === "missing" ? filteredMissing.length : filteredLost.length;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-xl px-4 py-1.5 text-xs font-medium transition",
                tab === t ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "incidents" ? "Incidents" : t === "missing" ? "Missing Persons" : "Lost & Found"}
              <span className="ml-1.5 tabular-nums text-[10px] text-muted-foreground">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Results */}
      <section className="premium-surface rounded-3xl border border-border/55 shadow-soft">
        {tab === "incidents" && (
          filteredIncidents.length === 0
            ? <EmptyState />
            : <div className="divide-y divide-border/40">
                {filteredIncidents.map((inc) => {
                  const meta = PRIORITY_META[inc.priority as IncidentPriority];
                  return (
                    <Link
                      key={inc.id}
                      to="/police/cases/$caseId"
                      params={{ caseId: inc.id }}
                      className="flex items-start gap-3 px-5 py-4 transition hover:bg-secondary/20"
                    >
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", meta?.dot ?? "bg-border")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sm">{inc.title}</span>
                          <span className="rounded-full border border-border/50 bg-secondary/40 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                            {inc.reference}
                          </span>
                          {inc.category && (
                            <span className="rounded-full border border-border/50 bg-secondary/40 px-2 py-0.5 text-[10px] text-muted-foreground capitalize">
                              {inc.category}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                          {inc.location_text && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{inc.location_text}</span>}
                          {inc.district && <span>{inc.district}</span>}
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(inc.created_at)}</span>
                          <span>{statusLabel(inc.status)}</span>
                        </div>
                      </div>
                      <FileText className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
        )}

        {tab === "missing" && (
          filteredMissing.length === 0
            ? <EmptyState />
            : <div className="divide-y divide-border/40">
                {filteredMissing.map((mp) => (
                  <div key={mp.id} className="flex items-start gap-3 px-5 py-4">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary/60 text-[11px] font-bold text-muted-foreground">
                      {mp.full_name?.slice(0, 2).toUpperCase() ?? "??"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{mp.full_name}</p>
                      <div className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                        {mp.age && <span>Age {mp.age}</span>}
                        {mp.gender && <span className="capitalize">{mp.gender}</span>}
                        {mp.last_seen_location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{mp.last_seen_location}</span>}
                        <span>{timeAgo(mp.created_at)}</span>
                        <span className={cn("capitalize", mp.status === "found" ? "text-success" : "text-alert")}>{mp.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
        )}

        {tab === "lostfound" && (
          filteredLost.length === 0
            ? <EmptyState />
            : <div className="divide-y divide-border/40">
                {filteredLost.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 px-5 py-4">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-secondary/60 text-base">
                      {item.kind === "found" ? "🎒" : "🔍"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{item.item_type}</p>
                        <span className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] capitalize",
                          item.kind === "found" ? "border-success/40 bg-success/12 text-success" : "border-alert/40 bg-alert/12 text-alert",
                        )}>
                          {item.kind}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                        {item.description && <span>{item.description.slice(0, 80)}</span>}
                        {item.location_text && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.location_text}</span>}
                        <span>{timeAgo(item.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
        )}
      </section>
    </div>
  );
}

function EmptyState() {
  return <div className="py-16 text-center text-sm text-muted-foreground">No results found.</div>;
}
