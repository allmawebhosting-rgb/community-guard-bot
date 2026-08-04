import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  communityAlertsQuery,
  isCommandRank,
  logAudit,
  myOfficerQuery,
  timeAgo,
} from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/alerts")({
  component: AlertsPage,
});

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

function AlertsPage() {
  const qc = useQueryClient();
  const { data: officer } = useQuery(myOfficerQuery);
  const { data: alerts = [] } = useQuery(communityAlertsQuery);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [area, setArea] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("medium");

  const canPublish = isCommandRank(officer?.rank);

  const publish = useMutation({
    mutationFn: async () => {
      const t = title.trim().slice(0, 120);
      const b = body.trim().slice(0, 1200);
      if (!t || !b) throw new Error("Add a title and message");
      const { error } = await supabase.from("community_alerts").insert({
        title: t,
        body: b,
        area: area.trim().slice(0, 80) || null,
        severity,
        alert_type: "advisory",
        is_published: true,
        created_by: officer?.id ?? null,
      });
      if (error) throw error;
      await logAudit("community_alert_published", "community_alerts", undefined, { title: t });
    },
    onSuccess: () => {
      toast.success("Alert broadcast to citizens");
      setTitle("");
      setBody("");
      setArea("");
      qc.invalidateQueries({ queryKey: ["police", "alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: boolean }) => {
      const { error } = await supabase
        .from("community_alerts")
        .update({ is_published: next })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["police", "alerts"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[1fr_1.1fr]">
      <section className="premium-surface h-fit rounded-3xl border border-border/55 p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-gold" />
          <h2 className="font-display text-sm font-semibold">Broadcast public alert</h2>
        </div>
        {!canPublish && (
          <p className="mt-2 rounded-2xl border border-gold/30 bg-gold/8 p-3 text-[12px] text-muted-foreground">
            Only command staff can publish community alerts.
          </p>
        )}
        <Input
          value={title}
          maxLength={120}
          placeholder="Alert title"
          className="mt-3 rounded-2xl"
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          value={body}
          maxLength={1200}
          placeholder="What should the public know and do?"
          className="mt-2 rounded-2xl"
          onChange={(e) => setBody(e.target.value)}
        />
        <Input
          value={area}
          maxLength={80}
          placeholder="Affected area (e.g. Kampala Central)"
          className="mt-2 rounded-2xl"
          onChange={(e) => setArea(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverity(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] capitalize transition",
                severity === s
                  ? "border-primary/55 bg-primary/12 text-foreground"
                  : "border-border/50 bg-secondary/35 text-muted-foreground hover:border-border",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <Button
          className="mt-3 w-full rounded-full"
          disabled={!canPublish || publish.isPending}
          onClick={() => publish.mutate()}
        >
          Publish alert
        </Button>
      </section>

      <section className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="premium-surface rounded-3xl border border-border/55 p-4 shadow-soft"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-gold/40 bg-gold/12 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-gold">
                {alert.severity}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{alert.title}</p>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {timeAgo(alert.created_at)}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] text-muted-foreground">{alert.body}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {alert.area ?? "Nationwide"} · {alert.is_published ? "Live" : "Draft"}
              </span>
              {canPublish && (
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto rounded-full"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ id: alert.id, next: !alert.is_published })}
                >
                  {alert.is_published ? "Unpublish" : "Publish"}
                </Button>
              )}
            </div>
          </div>
        ))}
        {alerts.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No alerts published yet.</p>
        )}
      </section>
    </div>
  );
}
