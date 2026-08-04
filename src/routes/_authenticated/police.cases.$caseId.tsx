import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Navigation, Radio, UserCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { CaseSidePanels } from "@/components/police/case-side-panels";
import {
  caseNotesQuery,
  dispatchesForCaseQuery,
  incidentQuery,
  logAudit,
  officersQuery,
  PRIORITY_META,
  rankLabel,
  statusLabel,
  STATUS_FLOW,
  timeAgo,
  DISPATCH_STATUS_FLOW,
  dispatchStatusLabel,
  type IncidentPriority,
  type DispatchStatus,
} from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/cases/$caseId")({
  component: CaseDetail,
});

const DISPATCH_STATUS_META: Record<string, { dot: string; chip: string }> = {
  assigned:   { dot: "bg-gold",              chip: "border-gold/40 bg-gold/12 text-gold" },
  notified:   { dot: "bg-primary",           chip: "border-primary/40 bg-primary/12 text-primary" },
  en_route:   { dot: "bg-alert",             chip: "border-alert/40 bg-alert/12 text-alert" },
  on_scene:   { dot: "bg-success",           chip: "border-success/40 bg-success/12 text-success" },
  completed:  { dot: "bg-success",           chip: "border-success/40 bg-success/12 text-success" },
  reassigned: { dot: "bg-muted-foreground",  chip: "border-border bg-secondary/40 text-muted-foreground" },
  cancelled:  { dot: "bg-muted-foreground",  chip: "border-border bg-secondary/40 text-muted-foreground" },
};

function CaseDetail() {
  const { caseId } = Route.useParams();
  const qc = useQueryClient();
  const { data: incident } = useQuery(incidentQuery(caseId));
  const { data: notes = [] } = useQuery(caseNotesQuery(caseId));
  const { data: dispatches = [] } = useQuery(dispatchesForCaseQuery(caseId));
  const { data: officers = [] } = useQuery(officersQuery);
  const [note, setNote] = useState("");
  const [dispatchOfficerId, setDispatchOfficerId] = useState("");
  const [dispatchNote, setDispatchNote] = useState("");
  const [showDispatchForm, setShowDispatchForm] = useState(false);

  // Real-time: re-fetch when incident, dispatches, or notes change
  useEffect(() => {
    const channel = supabase
      .channel(`case-${caseId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reports", filter: `id=eq.${caseId}` }, () => {
        qc.invalidateQueries({ queryKey: ["police", "incident", caseId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dispatches", filter: `report_id=eq.${caseId}` }, () => {
        qc.invalidateQueries({ queryKey: ["police", "dispatches", caseId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "case_notes", filter: `report_id=eq.${caseId}` }, () => {
        qc.invalidateQueries({ queryKey: ["police", "notes", caseId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [caseId, qc]);

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

  const dispatchOfficer = useMutation({
    mutationFn: async () => {
      if (!dispatchOfficerId) throw new Error("Select an officer first");
      const { data: auth } = await supabase.auth.getUser();
      const { data: me } = await supabase
        .from("officer_profiles")
        .select("id")
        .eq("user_id", auth.user!.id)
        .maybeSingle();
      const { error } = await supabase.from("dispatches").insert({
        report_id: caseId,
        officer_id: dispatchOfficerId,
        assigned_by: me?.id ?? null,
        status: "assigned",
        note: dispatchNote.trim() || null,
      });
      if (error) throw error;
      await supabase.from("reports").update({ status: "dispatched" }).eq("id", caseId);
      await supabase.from("report_status_history").insert({ report_id: caseId, status: "dispatched" });
      await logAudit("officer_dispatched", "reports", caseId, { officer_id: dispatchOfficerId });
    },
    onSuccess: () => {
      toast.success("Officer dispatched");
      setDispatchOfficerId("");
      setDispatchNote("");
      setShowDispatchForm(false);
      qc.invalidateQueries({ queryKey: ["police"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDispatch = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: DispatchStatus }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "en_route") patch.en_route_at = new Date().toISOString();
      if (status === "on_scene") patch.on_scene_at = new Date().toISOString();
      if (status === "completed") patch.completed_at = new Date().toISOString();
      const { error } = await supabase.from("dispatches").update(patch).eq("id", id);
      if (error) throw error;
      await logAudit("dispatch_status_change", "dispatches", id, { status });
    },
    onSuccess: () => {
      toast.success("Dispatch updated");
      qc.invalidateQueries({ queryKey: ["police", "dispatches", caseId] });
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
  const availableOfficers = officers.filter(
    (o) => o.status === "verified" && (o.duty_status === "available" || o.duty_status === "on_duty"),
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <Link
        to="/police/incidents"
        className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All incidents
      </Link>

      {/* Case header */}
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

      {/* Dispatch panel */}
      <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">Dispatch</h2>
          {!showDispatchForm && (
            <Button size="sm" className="rounded-full" onClick={() => setShowDispatchForm(true)}>
              <Zap className="mr-1.5 h-3.5 w-3.5" /> Dispatch officer
            </Button>
          )}
        </div>

        {showDispatchForm && (
          <div className="mt-4 space-y-3 rounded-2xl border border-border/50 bg-secondary/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Assign to officer
            </p>
            <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {availableOfficers.length === 0 && (
                <p className="text-sm text-muted-foreground">No available officers right now.</p>
              )}
              {availableOfficers.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setDispatchOfficerId(o.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left text-sm transition",
                    dispatchOfficerId === o.id
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/50 bg-secondary/35 hover:border-border",
                  )}
                >
                  <UserCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{o.full_name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {rankLabel(o.rank)} · Badge {o.badge_number ?? "—"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] text-success">
                    {o.duty_status}
                  </span>
                </button>
              ))}
            </div>
            <Textarea
              value={dispatchNote}
              maxLength={500}
              placeholder="Dispatch instructions (optional)…"
              className="rounded-2xl"
              rows={2}
              onChange={(e) => setDispatchNote(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="rounded-full"
                disabled={!dispatchOfficerId || dispatchOfficer.isPending}
                onClick={() => dispatchOfficer.mutate()}
              >
                <Navigation className="mr-1.5 h-3.5 w-3.5" /> Confirm dispatch
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full"
                onClick={() => { setShowDispatchForm(false); setDispatchOfficerId(""); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {dispatches.length === 0 && !showDispatchForm && (
            <p className="text-sm text-muted-foreground">No officers dispatched yet.</p>
          )}
          {dispatches.map((d) => {
            const statusMeta = DISPATCH_STATUS_META[d.status] ?? DISPATCH_STATUS_META.assigned;
            return (
              <div key={d.id} className="rounded-2xl border border-border/50 bg-secondary/35 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", statusMeta.dot)} />
                  <p className="text-sm font-medium">
                    {(d.officer as { full_name?: string } | null)?.full_name ?? "Unknown officer"}
                  </p>
                  <span className={cn("ml-auto rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]", statusMeta.chip)}>
                    {dispatchStatusLabel(d.status)}
                  </span>
                </div>
                {d.note && (
                  <p className="mt-1 pl-4 text-[12px] text-muted-foreground">{d.note}</p>
                )}
                <p className="mt-1 pl-4 text-[10px] text-muted-foreground">
                  Dispatched {timeAgo(d.created_at)}
                  {d.en_route_at && ` · En route ${timeAgo(d.en_route_at)}`}
                  {d.on_scene_at && ` · On scene ${timeAgo(d.on_scene_at)}`}
                </p>
                {!["completed", "cancelled"].includes(d.status) && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-4">
                    {DISPATCH_STATUS_FLOW.filter(
                      (s) => s !== d.status && !["assigned", "reassigned"].includes(s),
                    ).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={updateDispatch.isPending}
                        onClick={() => updateDispatch.mutate({ id: d.id, status: s })}
                        className="rounded-full border border-border/50 bg-secondary/40 px-2.5 py-1 text-[10px] text-muted-foreground transition hover:border-border hover:text-foreground"
                      >
                        → {dispatchStatusLabel(s)}
                      </button>
                    ))}
                  </div>
                )}
                {d.status === "completed" && (
                  <span className="mt-2 inline-flex items-center gap-1 pl-4 text-[11px] text-success">
                    <CheckCircle2 className="h-3 w-3" /> Completed {timeAgo(d.completed_at)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Evidence locker + additional panels */}
      <CaseSidePanels caseId={caseId} />

      {/* Case notes */}
      <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
        <h2 className="font-display text-sm font-semibold">Case notes</h2>
        <div className="mt-3 space-y-2">
          {notes.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-border/50 bg-secondary/35 p-3">
              <p className="text-sm">{entry.body}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {entry.author_kind === "officer" ? "Officer · " : ""}{timeAgo(entry.created_at)}
              </p>
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
          <Radio className="mr-1.5 h-3.5 w-3.5" /> Add note
        </Button>
      </section>
    </div>
  );
}
