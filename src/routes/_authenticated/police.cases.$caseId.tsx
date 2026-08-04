import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaseSidePanels } from "@/components/police/case-side-panels";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  caseNotesQuery,
  incidentQuery,
  logAudit,
  PRIORITY_META,
  statusLabel,
  STATUS_FLOW,
  timeAgo,
  type IncidentPriority,
} from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/cases/$caseId")({
  component: CaseDetail,
});

function CaseDetail() {
  const { caseId } = Route.useParams();
  const qc = useQueryClient();
  const { data: incident } = useQuery(incidentQuery(caseId));
  const { data: notes = [] } = useQuery(caseNotesQuery(caseId));
  const [note, setNote] = useState("");

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase
        .from("reports")
        .update({
          status,
          resolved_at: status === "resolved" ? new Date().toISOString() : null,
        })
        .eq("id", caseId);
      if (error) throw error;
      await supabase.from("report_status_history").insert({ report_id: caseId, status });
      await logAudit("case_status_change", "reports", caseId, { status });
    },
    onSuccess: () => {
      toast.success("Case status updated");
      qc.invalidateQueries({ queryKey: ["police"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const body = note.trim().slice(0, 2000);
      if (!body) throw new Error("Write a note first");
      const { error } = await supabase.from("case_notes").insert({ report_id: caseId, body });
      if (error) throw error;
      await logAudit("case_note_added", "reports", caseId);
    },
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["police", "notes", caseId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!incident) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Loading case…</p>;
  }

  const meta = PRIORITY_META[incident.priority as IncidentPriority];
  const actions = Array.isArray(incident.ai_recommended_actions)
    ? (incident.ai_recommended_actions as unknown[]).map(String)
    : [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <Link
        to="/police/incidents"
        className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All incidents
      </Link>

      <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]", meta.chip)}>
            {meta.label}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {incident.reference} · {timeAgo(incident.created_at)}
          </span>
        </div>
        <h1 className="mt-2 font-display text-xl font-semibold">{incident.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {incident.location_text ?? "Unknown location"} · {incident.district ?? "—"}
        </p>
        {incident.narrative && <p className="mt-3 text-sm leading-relaxed">{incident.narrative}</p>}

        {incident.ai_summary && (
          <div className="mt-4 rounded-2xl border border-gold/30 bg-gold/8 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
              Allma AI analysis
            </p>
            <p className="mt-1.5 text-sm">{incident.ai_summary}</p>
            {actions.length > 0 && (
              <ul className="mt-2.5 space-y-1 text-[12px] text-muted-foreground">
                {actions.map((action) => (
                  <li key={action}>• {action}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {STATUS_FLOW.map((status) => (
            <button
              key={status}
              type="button"
              disabled={updateStatus.isPending}
              onClick={() => updateStatus.mutate(status)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs transition",
                incident.status === status
                  ? "border-primary/55 bg-primary/12 text-foreground"
                  : "border-border/50 bg-secondary/35 text-muted-foreground hover:border-border",
              )}
            >
              {statusLabel(status)}
            </button>
          ))}
        </div>
      </section>

      <CaseSidePanels caseId={caseId} />

      <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
        <h2 className="font-display text-sm font-semibold">Case notes</h2>
        <div className="mt-3 space-y-2">
          {notes.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-border/50 bg-secondary/35 p-3">
              <p className="text-sm">{entry.body}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{timeAgo(entry.created_at)}</p>
            </div>
          ))}
          {notes.length === 0 && (
            <p className="text-sm text-muted-foreground">No notes on this case yet.</p>
          )}
        </div>
        <Textarea
          value={note}
          maxLength={2000}
          placeholder="Add an investigation note…"
          className="mt-3 rounded-2xl"
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          size="sm"
          className="mt-2 rounded-full"
          disabled={addNote.isPending}
          onClick={() => addNote.mutate()}
        >
          Add note
        </Button>
      </section>
    </div>
  );
}
