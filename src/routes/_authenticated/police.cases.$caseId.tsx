import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  Landmark,
  FileText,
  Fingerprint,
  Flame,
  MapPin,
  Navigation,
  Radio,
  UserCheck,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { CaseSidePanels } from "@/components/police/case-side-panels";
import { CaseIntelligencePanel } from "@/components/police/case-intelligence-panel";
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
  assigned: { dot: "bg-gold", chip: "border-gold/40 bg-gold/12 text-gold" },
  notified: { dot: "bg-primary", chip: "border-primary/40 bg-primary/12 text-primary" },
  en_route: { dot: "bg-alert", chip: "border-alert/40 bg-alert/12 text-alert" },
  on_scene: { dot: "bg-success", chip: "border-success/40 bg-success/12 text-success" },
  completed: { dot: "bg-success", chip: "border-success/40 bg-success/12 text-success" },
  reassigned: {
    dot: "bg-muted-foreground",
    chip: "border-border bg-secondary/40 text-muted-foreground",
  },
  cancelled: {
    dot: "bg-muted-foreground",
    chip: "border-border bg-secondary/40 text-muted-foreground",
  },
};

const STATUS_STEPPER = [
  "submitted",
  "under_review",
  "assigned",
  "dispatched",
  "resolved",
  "closed",
] as const;

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

  useEffect(() => {
    const channel = supabase
      .channel(`case-${caseId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reports", filter: `id=eq.${caseId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["police", "incident", caseId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispatches", filter: `report_id=eq.${caseId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["police", "dispatches", caseId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "case_notes", filter: `report_id=eq.${caseId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["police", "notes", caseId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [caseId, qc]);

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase
        .from("reports")
        .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null })
        .eq("id", caseId);
      if (error) throw error;
      await supabase.from("report_status_history").insert({ report_id: caseId, status });
      await logAudit("case_status_change", "reports", caseId, { status });
    },
    onSuccess: () => {
      toast.success("Status updated");
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
      await supabase
        .from("report_status_history")
        .insert({ report_id: caseId, status: "dispatched" });
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
      const patch: {
        status: DispatchStatus;
        en_route_at?: string;
        on_scene_at?: string;
        completed_at?: string;
      } = { status };
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
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Loading case…
        </div>
      </div>
    );
  }

  const meta = PRIORITY_META[incident.priority as IncidentPriority];
  const actions = Array.isArray(incident.ai_recommended_actions)
    ? (incident.ai_recommended_actions as unknown[]).map(String)
    : [];
  const availableOfficers = officers.filter(
    (o) =>
      o.status === "verified" && (o.duty_status === "available" || o.duty_status === "on_duty"),
  );

  // Build timeline from notes + key incident events
  const timeline = [
    { time: incident.created_at, label: "Report submitted", icon: FileText, color: "text-primary" },
    ...dispatches.map((d) => ({
      time: d.created_at,
      label: `Officer dispatched — ${(d.officer as { full_name?: string } | null)?.full_name ?? "Officer"}`,
      icon: Navigation,
      color: "text-alert",
    })),
    ...dispatches
      .filter((d) => d.en_route_at)
      .map((d) => ({
        time: d.en_route_at!,
        label: "Officer en route",
        icon: Navigation,
        color: "text-alert",
      })),
    ...dispatches
      .filter((d) => d.on_scene_at)
      .map((d) => ({
        time: d.on_scene_at!,
        label: "Officer on scene",
        icon: CheckCircle2,
        color: "text-success",
      })),
    ...notes.map((n) => ({
      time: n.created_at,
      label: `Note: ${n.body.slice(0, 60)}${n.body.length > 60 ? "…" : ""}`,
      icon: FileText,
      color: "text-muted-foreground",
    })),
    ...(incident.resolved_at
      ? [
          {
            time: incident.resolved_at,
            label: "Case resolved",
            icon: CheckCircle2,
            color: "text-success",
          },
        ]
      : []),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const stepIdx = STATUS_STEPPER.indexOf(incident.status as (typeof STATUS_STEPPER)[number]);

  return (
    <div className="w-full space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Link to="/police/incidents" className="hover:text-foreground transition">
          Incidents
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="font-mono text-foreground">{incident.reference}</span>
      </div>

      {/* ── Case header ───────────────────────────────────── */}
      <div className="card-desktop">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
                  meta?.chip,
                )}
              >
                {meta?.label}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {incident.reference}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {timeAgo(incident.created_at)}
              </span>
            </div>
            <h1 className="mt-2 font-display text-lg font-semibold leading-snug">
              {incident.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
              {incident.location_text && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {incident.location_text}
                </span>
              )}
              {incident.district && <span>{incident.district}</span>}
              {incident.category && (
                <span className="rounded-md bg-secondary/60 px-1.5 py-0.5 capitalize">
                  {incident.category}
                </span>
              )}
            </div>
          </div>
          <Button
            size="sm"
            className="rounded-lg gap-1.5 shrink-0"
            onClick={() => setShowDispatchForm(true)}
          >
            <Zap className="h-3.5 w-3.5" /> Dispatch
          </Button>
        </div>

        {incident.narrative && (
          <p className="mt-3 border-t border-border/30 pt-3 text-[13px] leading-relaxed text-muted-foreground">
            {incident.narrative}
          </p>
        )}

        {/* Status stepper */}
        <div className="mt-4 border-t border-border/30 pt-4">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Case Progress
          </p>
          <div className="flex items-center gap-0">
            {STATUS_STEPPER.map((s, i) => {
              const done = i < stepIdx;
              const current = i === stepIdx;
              const isLast = i === STATUS_STEPPER.length - 1;
              return (
                <div key={s} className="flex flex-1 items-center">
                  <button
                    type="button"
                    disabled={updateStatus.isPending}
                    onClick={() => updateStatus.mutate(s)}
                    className="flex flex-col items-center gap-1 group"
                    title={statusLabel(s)}
                  >
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full transition-all",
                        done
                          ? "bg-primary"
                          : current
                            ? "bg-primary ring-2 ring-primary/30 ring-offset-1 ring-offset-background"
                            : "bg-border",
                      )}
                    />
                    <span
                      className={cn(
                        "hidden text-[9px] uppercase tracking-wider lg:block transition-colors",
                        current
                          ? "font-semibold text-primary"
                          : done
                            ? "text-muted-foreground"
                            : "text-muted-foreground/50",
                      )}
                    >
                      {statusLabel(s)}
                    </span>
                  </button>
                  {!isLast && (
                    <div
                      className={cn(
                        "h-px flex-1 transition-colors",
                        done ? "bg-primary" : "bg-border/40",
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Two-column layout ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/25 bg-gold/[0.06] px-4 py-3">
        <div className="flex items-start gap-2.5">
          <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <div>
            <p className="text-xs font-semibold">Authority coordination is available</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Prepare this case for an authorized authority without claiming official notification.
            </p>
          </div>
        </div>
        <Link
          to="/police/authority"
          className="inline-flex items-center gap-1.5 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-[11px] font-semibold text-gold transition hover:bg-gold/15"
        >
          Open coordination <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <CaseIntelligencePanel incident={incident} dispatches={dispatches} timeline={timeline} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px]">
        {/* LEFT: AI analysis + timeline + notes */}
        <div className="space-y-4">
          {/* AI Analysis */}
          {incident.ai_summary && (
            <div className="card-desktop border-gold/25 bg-gradient-to-br from-gold/5 to-transparent">
              <div className="mb-3 flex items-center gap-2">
                <div className="grid h-6 w-6 place-items-center rounded-lg bg-gold/15">
                  <Brain className="h-3.5 w-3.5 text-gold" />
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">
                  AI Case Analysis
                </p>
              </div>
              <p className="text-[13px] leading-relaxed">{incident.ai_summary}</p>
              {actions.length > 0 && (
                <div className="mt-3 border-t border-gold/15 pt-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Recommended Actions
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {actions.map((action) => (
                      <span
                        key={action}
                        className="rounded-md border border-gold/25 bg-gold/8 px-2.5 py-1 text-[11px] text-gold"
                      >
                        {action}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Case meta grid */}
          <div className="card-desktop">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Incident Details
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px] lg:grid-cols-3">
              {[
                { label: "Priority", value: meta?.label, icon: Flame },
                { label: "Status", value: statusLabel(incident.status), icon: AlertTriangle },
                {
                  label: "Reported",
                  value: new Date(incident.created_at).toLocaleString("en-UG", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                  icon: Clock,
                },
                { label: "District", value: incident.district ?? "—", icon: MapPin },
                { label: "Location", value: incident.location_text ?? "—", icon: MapPin },
                { label: "Reference", value: incident.reference ?? "—", icon: Fingerprint },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label}>
                  <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                    <Icon className="h-2.5 w-2.5" />
                    {label}
                  </p>
                  <p className="mt-0.5 font-medium">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline */}
          {timeline.length > 0 && (
            <div className="card-desktop">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Case Timeline
              </p>
              <div className="relative space-y-0">
                {timeline.map((event, i) => {
                  const Icon = event.icon;
                  const isLast = i === timeline.length - 1;
                  return (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-secondary/80",
                            event.color,
                          )}
                        >
                          <Icon className="h-2.5 w-2.5" />
                        </div>
                        {!isLast && <div className="w-px flex-1 bg-border/40 my-1" />}
                      </div>
                      <div className={cn("min-w-0 pb-3", isLast ? "" : "")}>
                        <p className="text-[12px] font-medium leading-snug">{event.label}</p>
                        <p className="text-[10px] text-muted-foreground">{timeAgo(event.time)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Case notes */}
          <div className="card-desktop">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Investigation Notes
            </p>
            {notes.length > 0 && (
              <div className="mb-3 space-y-2">
                {notes.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-border/40 bg-secondary/30 px-3.5 py-2.5"
                  >
                    <p className="text-[13px] leading-snug">{entry.body}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {entry.author_kind === "officer" ? "Officer · " : ""}
                      {timeAgo(entry.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {notes.length === 0 && (
              <p className="mb-3 text-[12px] text-muted-foreground">No investigation notes yet.</p>
            )}
            <Textarea
              value={note}
              maxLength={2000}
              rows={3}
              placeholder="Add an investigation note, observation, or update…"
              className="rounded-lg text-[13px]"
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-2 flex items-center justify-between">
              <Button
                size="sm"
                disabled={addNote.isPending || !note.trim()}
                onClick={() => addNote.mutate()}
                className="rounded-lg gap-1.5"
              >
                <Radio className="h-3.5 w-3.5" /> Add Note
              </Button>
              <span className="text-[10px] text-muted-foreground">{note.length}/2000</span>
            </div>
          </div>
        </div>

        {/* RIGHT: dispatch + evidence + side panels */}
        <div className="space-y-4">
          {/* Dispatch panel */}
          <div className="card-desktop">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Dispatch
              </p>
              {!showDispatchForm && (
                <button
                  onClick={() => setShowDispatchForm(true)}
                  className="flex items-center gap-1 rounded-md border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-border hover:text-foreground"
                >
                  <Zap className="h-3 w-3" /> New
                </button>
              )}
            </div>

            {showDispatchForm && (
              <div className="mb-3 rounded-lg border border-border/40 bg-secondary/20 p-3 space-y-3">
                <p className="text-[11px] font-medium text-muted-foreground">Select officer</p>
                <div className="max-h-40 space-y-1 overflow-y-auto pr-0.5">
                  {availableOfficers.length === 0 && (
                    <p className="text-[12px] text-muted-foreground">No available officers.</p>
                  )}
                  {availableOfficers.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setDispatchOfficerId(o.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition",
                        dispatchOfficerId === o.id
                          ? "border-primary/50 bg-primary/8"
                          : "border-border/40 hover:border-border",
                      )}
                    >
                      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/30 to-gold/30 text-[9px] font-bold">
                        {(o.full_name || "O")
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((p) => p[0])
                          .join("")
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-medium">{o.full_name}</p>
                        <p className="text-[10px] text-muted-foreground">{rankLabel(o.rank)}</p>
                      </div>
                      <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
                    </button>
                  ))}
                </div>
                <Textarea
                  value={dispatchNote}
                  maxLength={500}
                  placeholder="Dispatch instructions (optional)…"
                  className="rounded-lg text-[12px]"
                  rows={2}
                  onChange={(e) => setDispatchNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="rounded-lg gap-1.5 flex-1"
                    disabled={!dispatchOfficerId || dispatchOfficer.isPending}
                    onClick={() => dispatchOfficer.mutate()}
                  >
                    <Navigation className="h-3.5 w-3.5" /> Dispatch
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-lg"
                    onClick={() => {
                      setShowDispatchForm(false);
                      setDispatchOfficerId("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Active dispatches */}
            <div className="space-y-2">
              {dispatches.length === 0 && !showDispatchForm && (
                <p className="py-2 text-[12px] text-muted-foreground">
                  No officers dispatched yet.
                </p>
              )}
              {dispatches.map((d) => {
                const statusMeta = DISPATCH_STATUS_META[d.status] ?? DISPATCH_STATUS_META.assigned;
                const officerName =
                  (d.officer as { full_name?: string } | null)?.full_name ?? "Officer";
                return (
                  <div
                    key={d.id}
                    className="rounded-lg border border-border/40 bg-secondary/20 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusMeta.dot)} />
                      <p className="flex-1 truncate text-[12px] font-medium">{officerName}</p>
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                          statusMeta.chip,
                        )}
                      >
                        {dispatchStatusLabel(d.status)}
                      </span>
                    </div>
                    <p className="mt-1 pl-3.5 text-[10px] text-muted-foreground">
                      {timeAgo(d.created_at)}
                      {d.en_route_at && ` · En route ${timeAgo(d.en_route_at)}`}
                      {d.on_scene_at && ` · On scene ${timeAgo(d.on_scene_at)}`}
                    </p>
                    {d.note && (
                      <p className="mt-0.5 pl-3.5 text-[11px] text-muted-foreground italic">
                        "{d.note}"
                      </p>
                    )}
                    {!["completed", "cancelled"].includes(d.status) && (
                      <div className="mt-2 flex flex-wrap gap-1 pl-3.5">
                        {DISPATCH_STATUS_FLOW.filter(
                          (s) => s !== d.status && !["assigned", "reassigned"].includes(s),
                        ).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={updateDispatch.isPending}
                            onClick={() => updateDispatch.mutate({ id: d.id, status: s })}
                            className="rounded-md border border-border/40 bg-secondary/40 px-2 py-0.5 text-[10px] text-muted-foreground transition hover:border-border hover:text-foreground"
                          >
                            → {dispatchStatusLabel(s)}
                          </button>
                        ))}
                      </div>
                    )}
                    {d.status === "completed" && (
                      <span className="mt-1.5 inline-flex items-center gap-1 pl-3.5 text-[10px] text-success">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Completed {timeAgo(d.completed_at)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status quick-change */}
          <div className="card-desktop">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Change Status
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {STATUS_FLOW.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={updateStatus.isPending}
                  onClick={() => updateStatus.mutate(status)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-[11px] text-left transition",
                    incident.status === status
                      ? "border-primary/50 bg-primary/10 font-semibold text-foreground"
                      : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {incident.status === status && <span className="mr-1 text-primary">✓</span>}
                  {statusLabel(status)}
                </button>
              ))}
            </div>
          </div>

          {/* Evidence + dispatch record from side panels */}
          <CaseSidePanels caseId={caseId} />
        </div>
      </div>
    </div>
  );
}
