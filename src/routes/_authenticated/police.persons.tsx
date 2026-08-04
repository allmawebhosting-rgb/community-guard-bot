import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PackageSearch, UserSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { logAudit, lostFoundQuery, missingPersonsQuery, statusLabel, timeAgo } from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/persons")({
  component: PersonsPage,
});

const TABS = [
  { id: "missing", label: "Missing persons", icon: UserSearch },
  { id: "items", label: "Lost & found", icon: PackageSearch },
] as const;

function PersonsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("missing");
  const { data: persons = [] } = useQuery(missingPersonsQuery);
  const { data: items = [] } = useQuery(lostFoundQuery);

  const setPersonStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("missing_persons").update({ status }).eq("id", id);
      if (error) throw error;
      await logAudit("missing_person_status", "missing_persons", id, { status });
    },
    onSuccess: () => {
      toast.success("Case updated");
      qc.invalidateQueries({ queryKey: ["police", "missing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setItemStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("lost_found_items")
        .update({ status, released_at: status === "released" ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
      await logAudit("lost_found_status", "lost_found_items", id, { status });
    },
    onSuccess: () => {
      toast.success("Item updated");
      qc.invalidateQueries({ queryKey: ["police", "lostfound"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs transition",
              tab === t.id
                ? "border-primary/55 bg-primary/12 text-foreground"
                : "border-border/50 bg-secondary/35 text-muted-foreground hover:border-border",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "missing" ? (
        <div className="space-y-2">
          {persons.map((p) => (
            <div
              key={p.id}
              className="premium-surface flex flex-wrap items-center gap-3 rounded-3xl border border-border/55 p-4 shadow-soft"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {p.full_name}
                  {p.age ? `, ${p.age}` : ""}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  Last seen {p.last_seen_location ?? "unknown"} · {p.district ?? "—"} ·{" "}
                  {timeAgo(p.created_at)}
                </p>
              </div>
              <span className="rounded-full border border-border/50 bg-secondary/40 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {statusLabel(p.status)}
              </span>
              {p.status !== "found" && (
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={setPersonStatus.isPending}
                  onClick={() => setPersonStatus.mutate({ id: p.id, status: "found" })}
                >
                  Mark found
                </Button>
              )}
            </div>
          ))}
          {persons.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No missing-person cases recorded.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="premium-surface flex flex-wrap items-center gap-3 rounded-3xl border border-border/55 p-4 shadow-soft"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {item.item_type}
                  {item.identifier ? ` · ${item.identifier}` : ""}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {item.kind === "lost" ? "Reported lost" : "Handed in"} ·{" "}
                  {item.location_text ?? item.district ?? "—"} · {timeAgo(item.created_at)}
                </p>
              </div>
              <span className="rounded-full border border-border/50 bg-secondary/40 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {statusLabel(item.status)}
              </span>
              {item.status !== "released" && (
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={setItemStatus.isPending}
                  onClick={() => setItemStatus.mutate({ id: item.id, status: "released" })}
                >
                  Release to owner
                </Button>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No lost or found property logged.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
