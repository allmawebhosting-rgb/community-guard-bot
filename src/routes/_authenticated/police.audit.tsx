import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, ClipboardList, Eye, Edit2, UserCheck, XCircle, Trash2, Download, LogIn } from "lucide-react";
import { Input } from "@/components/ui/input";
import { auditLogQuery, timeAgo } from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/audit")({
  component: AuditPage,
});

const ACTION_META: Record<string, { icon: typeof Eye; color: string; label: string }> = {
  view:   { icon: Eye,       color: "text-muted-foreground", label: "View" },
  edit:   { icon: Edit2,     color: "text-gold",             label: "Edit" },
  assign: { icon: UserCheck, color: "text-primary",          label: "Assign" },
  close:  { icon: XCircle,   color: "text-success",          label: "Close" },
  delete: { icon: Trash2,    color: "text-alert",            label: "Delete" },
  export: { icon: Download,  color: "text-primary",          label: "Export" },
  login:  { icon: LogIn,     color: "text-success",          label: "Login" },
};

function getActionMeta(action: string) {
  for (const [key, meta] of Object.entries(ACTION_META)) {
    if (action.toLowerCase().includes(key)) return meta;
  }
  return { icon: ClipboardList, color: "text-muted-foreground", label: action };
}

const LIMIT_OPTIONS = [50, 100, 250, 500] as const;

function AuditPage() {
  const [limit, setLimit] = useState<50 | 100 | 250 | 500>(100);
  const [q, setQ] = useState("");
  const { data: entries = [], isLoading } = useQuery(auditLogQuery(limit));

  const filtered = q.trim()
    ? entries.filter((e) => {
        const search = q.toLowerCase();
        return (
          e.action?.toLowerCase().includes(search) ||
          e.entity_type?.toLowerCase().includes(search) ||
          e.entity_id?.toLowerCase().includes(search) ||
          e.actor_id?.toLowerCase().includes(search)
        );
      })
    : entries;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold">Audit Log</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Every action taken on the command center</p>
        </div>
        <div className="flex items-center gap-2">
          {LIMIT_OPTIONS.map((l) => (
            <button
              key={l}
              onClick={() => setLimit(l)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-medium transition",
                limit === l
                  ? "border-primary/40 bg-primary/12 text-primary"
                  : "border-border/50 text-muted-foreground hover:border-border",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by action, entity, actor ID…"
          className="rounded-2xl pl-10"
        />
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>Showing <strong className="text-foreground">{filtered.length}</strong> entries</span>
        {q && <span>filtered from {entries.length} total</span>}
      </div>

      {/* Entries */}
      <section className="premium-surface rounded-3xl border border-border/55 shadow-soft">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading audit log…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No entries found.</div>
        ) : (
          <div className="divide-y divide-border/40">
            {filtered.map((entry, i) => {
              const meta = getActionMeta(entry.action ?? "");
              const Icon = meta.icon;
              return (
                <div key={entry.id ?? i} className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-secondary/20">
                  <div className={cn("mt-0.5 shrink-0", meta.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm capitalize">{entry.action?.replace(/_/g, " ")}</span>
                      {entry.entity_type && (
                        <span className="rounded-full border border-border/50 bg-secondary/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                          {entry.entity_type}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                      {entry.actor_id && <span>Actor: <span className="font-mono">{entry.actor_id.slice(0, 8)}…</span></span>}
                      {entry.entity_id && <span>Entity: <span className="font-mono">{entry.entity_id.slice(0, 8)}…</span></span>}
                      {entry.details && typeof entry.details === "object" && Object.keys(entry.details).length > 0 && (
                        <span className="truncate max-w-xs">
                          {Object.entries(entry.details as Record<string, unknown>)
                            .slice(0, 2)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(entry.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
