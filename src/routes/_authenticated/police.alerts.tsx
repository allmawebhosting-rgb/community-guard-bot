import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, Megaphone, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { communityAlertsQuery, logAudit, timeAgo } from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/alerts")({
  component: AlertsPage,
});

const ALERT_TYPES = ["safety", "weather", "crime", "missing_person", "road_closure", "other"] as const;
const SEVERITIES = ["info", "warning", "critical"] as const;

const SEVERITY_META: Record<string, { chip: string; dot: string }> = {
  info:     { chip: "border-success/40 bg-success/12 text-success",  dot: "bg-success" },
  warning:  { chip: "border-gold/40 bg-gold/12 text-gold",            dot: "bg-gold" },
  critical: { chip: "border-primary/45 bg-primary/12 text-primary",  dot: "bg-primary" },
};

type AlertDraft = {
  title: string;
  body: string;
  alert_type: string;
  severity: string;
  area: string;
  starts_at: string;
  expires_at: string;
};

const BLANK: AlertDraft = {
  title: "",
  body: "",
  alert_type: "safety",
  severity: "warning",
  area: "",
  starts_at: new Date().toISOString().slice(0, 16),
  expires_at: "",
};

function AlertsPage() {
  const qc = useQueryClient();
  const { data: alerts = [] } = useQuery(communityAlertsQuery);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<AlertDraft>(BLANK);

  const set = <K extends keyof AlertDraft>(k: K, v: AlertDraft[K]) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  const createAlert = useMutation({
    mutationFn: async () => {
      if (!draft.title.trim() || !draft.body.trim()) throw new Error("Title and body are required");
      const { data: auth } = await supabase.auth.getUser();
      const { data: me } = await supabase
        .from("officer_profiles")
        .select("id")
        .eq("user_id", auth.user!.id)
        .maybeSingle();
      const { error } = await supabase.from("community_alerts").insert({
        title: draft.title.trim(),
        body: draft.body.trim(),
        alert_type: draft.alert_type,
        severity: draft.severity,
        area: draft.area.trim() || null,
        starts_at: new Date(draft.starts_at).toISOString(),
        expires_at: draft.expires_at ? new Date(draft.expires_at).toISOString() : null,
        created_by: me?.id ?? null,
        is_published: false,
      });
      if (error) throw error;
      await logAudit("alert_created", "community_alerts");
    },
    onSuccess: () => {
      toast.success("Alert created (unpublished)");
      setDraft(BLANK);
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["police", "alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      const { error } = await supabase
        .from("community_alerts")
        .update({ is_published: publish })
        .eq("id", id);
      if (error) throw error;
      await logAudit(publish ? "alert_published" : "alert_unpublished", "community_alerts", id);
    },
    onSuccess: (_, { publish }) => {
      toast.success(publish ? "Alert published" : "Alert unpublished");
      qc.invalidateQueries({ queryKey: ["police", "alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAlert = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("community_alerts").delete().eq("id", id);
      if (error) throw error;
      await logAudit("alert_deleted", "community_alerts", id);
    },
    onSuccess: () => {
      toast.success("Alert deleted");
      qc.invalidateQueries({ queryKey: ["police", "alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <Button className="rounded-full" onClick={() => setShowForm((v) => !v)}>
          {showForm ? (
            <><X className="mr-1.5 h-4 w-4" /> Cancel</>
          ) : (
            <><Plus className="mr-1.5 h-4 w-4" /> New alert</>
          )}
        </Button>
      </div>

      {showForm && (
        <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-gold" />
            <h2 className="font-display text-sm font-semibold">Create community alert</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Title</Label>
              <Input
                value={draft.title}
                maxLength={120}
                placeholder="e.g. Road closure on Entebbe Road"
                onChange={(e) => set("title", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Body</Label>
              <Textarea
                value={draft.body}
                maxLength={1000}
                placeholder="Describe the alert and any safety instructions…"
                className="rounded-2xl"
                rows={3}
                onChange={(e) => set("body", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Type</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ALERT_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set("alert_type", t)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] capitalize transition",
                        draft.alert_type === t
                          ? "border-primary/55 bg-primary/12 text-foreground"
                          : "border-border/50 bg-secondary/35 text-muted-foreground",
                      )}
                    >
                      {t.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Severity</Label>
                <div className="flex gap-1.5">
                  {SEVERITIES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set("severity", s)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] capitalize transition",
                        draft.severity === s
                          ? SEVERITY_META[s].chip
                          : "border-border/50 bg-secondary/35 text-muted-foreground",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Affected area</Label>
                <Input
                  value={draft.area}
                  maxLength={80}
                  placeholder="e.g. Kampala Central"
                  onChange={(e) => set("area", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Expires at (optional)</Label>
                <Input
                  type="datetime-local"
                  value={draft.expires_at}
                  onChange={(e) => set("expires_at", e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                className="rounded-full"
                disabled={createAlert.isPending || !draft.title.trim() || !draft.body.trim()}
                onClick={() => createAlert.mutate()}
              >
                Create alert
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Saved as draft. Publish to make it visible to citizens.
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="space-y-2">
        {alerts.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No alerts yet. Create one above.</p>
        )}
        {alerts.map((alert) => {
          const sev = SEVERITY_META[alert.severity] ?? SEVERITY_META.info;
          const expired = alert.expires_at && new Date(alert.expires_at) < new Date();
          return (
            <div
              key={alert.id}
              className="premium-surface rounded-3xl border border-border/55 p-4 shadow-soft"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", sev.dot)} />
                <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]", sev.chip)}>
                  {alert.severity}
                </span>
                <span className="rounded-full border border-border/50 bg-secondary/40 px-2.5 py-0.5 text-[10px] text-muted-foreground capitalize">
                  {alert.alert_type.replace(/_/g, " ")}
                </span>
                {alert.is_published ? (
                  <span className="rounded-full border border-success/40 bg-success/10 px-2.5 py-0.5 text-[10px] text-success">
                    Published
                  </span>
                ) : (
                  <span className="rounded-full border border-border/50 bg-secondary/40 px-2.5 py-0.5 text-[10px] text-muted-foreground">
                    Draft
                  </span>
                )}
                {expired && (
                  <span className="rounded-full border border-border/50 bg-secondary/40 px-2.5 py-0.5 text-[10px] text-muted-foreground">
                    Expired
                  </span>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground">{timeAgo(alert.created_at)}</span>
              </div>
              <p className="mt-2 text-sm font-medium">{alert.title}</p>
              <p className="mt-1 text-[12px] text-muted-foreground line-clamp-2">{alert.body}</p>
              {alert.area && (
                <p className="mt-1 text-[11px] text-muted-foreground">📍 {alert.area}</p>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant={alert.is_published ? "outline" : "default"}
                  className="rounded-full"
                  disabled={togglePublish.isPending || !!expired}
                  onClick={() => togglePublish.mutate({ id: alert.id, publish: !alert.is_published })}
                >
                  {alert.is_published ? (
                    <><EyeOff className="mr-1.5 h-3.5 w-3.5" /> Unpublish</>
                  ) : (
                    <><Eye className="mr-1.5 h-3.5 w-3.5" /> Publish</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full text-muted-foreground hover:text-primary"
                  disabled={deleteAlert.isPending}
                  onClick={() => {
                    if (confirm("Delete this alert?")) deleteAlert.mutate(alert.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
