import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Radio, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  DUTY_META,
  dispatchesQuery,
  incidentsQuery,
  logAudit,
  officersQuery,
  PRIORITY_META,
  rankLabel,
  statusLabel,
  timeAgo,
  type IncidentPriority,
} from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/dispatch")({
  component: DispatchPage,
});

function DispatchPage() {
  const qc = useQueryClient();
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const { data: officers = [] } = useQuery(officersQuery);
  const { data: dispatches = [] } = useQuery(dispatchesQuery);
  const [selected, setSelected] = useState<string | null>(null);

  const open = incidents.filter((i) => !["resolved", "closed"].includes(i.status));
  const field = officers.filter((o) => o.status === "verified");
  const active = dispatches.filter((d) => !["completed", "cancelled"].includes(d.status));

  const assign = useMutation({
    mutationFn: async ({ reportId, officerId }: { reportId: string; officerId: string }) => {
      const { error } = await supabase
        .from("dispatches")
        .insert({ report_id: reportId, officer_id: officerId, status: "assigned" });
      if (error) throw error;
      const { error: upErr } = await supabase
        .from("reports")
        .update({ assigned_officer_id: officerId, status: "dispatched" })
        .eq("id", reportId);
      if (upErr) throw upErr;
      await supabase.from("report_status_history").insert({ report_id: reportId, status: "dispatched" });
      await logAudit("officer_dispatched", "reports", reportId, { officerId });
    },
    onSuccess: () => {
      toast.success("Officer dispatched");
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["police"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const advance = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "en_route" | "on_scene" | "completed" }) => {
      const stamp = new Date().toISOString();
      const { error } = await supabase
        .from("dispatches")
        .update({
          status,
          en_route_at: status === "en_route" ? stamp : undefined,
          on_scene_at: status === "on_scene" ? stamp : undefined,
          completed_at: status === "completed" ? stamp : undefined,
        })
        .eq("id", id);
      if (error) throw error;
      await logAudit("dispatch_status", "dispatches", id, { status });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["police", "dispatches"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid w-full gap-4 lg:grid-cols-[1.3fr_1fr]">
      <section className="premium-surface rounded-3xl border border-border/55 p-4 shadow-soft">
        <h2 className="mb-3 font-display text-sm font-semibold">Dispatch queue</h2>
        <div className="space-y-2">
          {open.map((incident) => {
            const meta = PRIORITY_META[incident.priority as IncidentPriority];
            const isOpen = selected === incident.id;
            return (
              <div key={incident.id} className="rounded-2xl border border-border/50 bg-secondary/35 p-3.5">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
                  <Link
                    to="/police/cases/$caseId"
                    params={{ caseId: incident.id }}
                    className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                  >
                    {incident.title}
                  </Link>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {timeAgo(incident.created_at)}
                  </span>
                </div>
                <p className="mt-1 truncate pl-4 text-[11px] text-muted-foreground">
                  {incident.location_text ?? incident.district ?? "Location unknown"} ·{" "}
                  {statusLabel(incident.status)}
                </p>
                <Button
                  size="sm"
                  variant={isOpen ? "secondary" : "outline"}
                  className="mt-2.5 rounded-full"
                  onClick={() => setSelected(isOpen ? null : incident.id)}
                >
                  <Radio className="mr-1.5 h-3.5 w-3.5" /> Assign officer
                </Button>

                {isOpen && (
                  <div className="mt-2.5 space-y-1.5 border-t border-border/50 pt-2.5">
                    {field.map((officer) => (
                      <div key={officer.id} className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px]">{officer.full_name}</p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {rankLabel(officer.rank)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px]",
                            DUTY_META[officer.duty_status]?.chip,
                          )}
                        >
                          {DUTY_META[officer.duty_status]?.label ?? officer.duty_status}
                        </span>
                        <Button
                          size="sm"
                          className="rounded-full"
                          disabled={assign.isPending}
                          onClick={() =>
                            assign.mutate({ reportId: incident.id, officerId: officer.id })
                          }
                        >
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {field.length === 0 && (
                      <p className="text-[12px] text-muted-foreground">No verified officers yet.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {open.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">Queue is clear.</p>
          )}
        </div>
      </section>

      <section className="premium-surface rounded-3xl border border-border/55 p-4 shadow-soft">
        <h2 className="mb-3 font-display text-sm font-semibold">Active dispatches</h2>
        <div className="space-y-2">
          {active.map((d) => {
            const officer = officers.find((o) => o.id === d.officer_id);
            const incident = incidents.find((i) => i.id === d.report_id);
            return (
              <div key={d.id} className="rounded-2xl border border-border/50 bg-secondary/35 p-3.5">
                <p className="truncate text-sm font-medium">{incident?.title ?? "Incident"}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {officer?.full_name ?? "Officer"} · {statusLabel(d.status)} · {timeAgo(d.created_at)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(["en_route", "on_scene", "completed"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={advance.isPending}
                      onClick={() => advance.mutate({ id: d.id, status: s })}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[11px] transition",
                        d.status === s
                          ? "border-primary/55 bg-primary/12 text-foreground"
                          : "border-border/50 bg-background/40 text-muted-foreground hover:border-border",
                      )}
                    >
                      {statusLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {active.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No active dispatches.</p>
          )}
        </div>
      </section>
    </div>
  );
}
