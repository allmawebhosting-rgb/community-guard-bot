import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  logAudit,
  officersQuery,
  rankLabel,
  stationsQuery,
  DUTY_STATUSES,
  dutyStatusLabel,
  type DutyStatusValue,
} from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/officers")({
  component: OfficersPage,
});

const DUTY_META: Record<string, string> = {
  available: "border-success/40 bg-success/12 text-success",
  on_duty:   "border-primary/40 bg-primary/12 text-primary",
  offline:   "border-border/50 bg-secondary/40 text-muted-foreground",
  on_leave:  "border-gold/40 bg-gold/12 text-gold",
};

function OfficersPage() {
  const qc = useQueryClient();
  const { data: officers = [] } = useQuery(officersQuery);
  const { data: stations = [] } = useQuery(stationsQuery);

  const setVerifyStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "verified" | "rejected" | "suspended" }) => {
      const { error } = await supabase.from("officer_profiles").update({ status }).eq("id", id);
      if (error) throw error;
      await logAudit(`officer_${status}`, "officer_profiles", id);
    },
    onSuccess: () => {
      toast.success("Officer record updated");
      qc.invalidateQueries({ queryKey: ["police", "officers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setDutyStatus = useMutation({
    mutationFn: async ({ id, duty_status }: { id: string; duty_status: DutyStatusValue }) => {
      const { error } = await supabase.from("officer_profiles").update({ duty_status }).eq("id", id);
      if (error) throw error;
      await logAudit("duty_status_changed", "officer_profiles", id, { duty_status });
    },
    onSuccess: () => {
      toast.success("Duty status updated");
      qc.invalidateQueries({ queryKey: ["police", "officers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="w-full space-y-3">
      {officers.map((officer) => {
        const station = stations.find((s) => s.id === officer.station_id);
        return (
          <div
            key={officer.id}
            className="premium-surface rounded-3xl border border-border/55 p-4 shadow-soft"
          >
            <div className="flex flex-wrap items-center gap-3">
              {/* Avatar */}
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold/40 to-primary/40 text-[11px] font-bold text-foreground">
                {officer.full_name
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join("")
                  .toUpperCase() || "—"}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{officer.full_name || "Unnamed officer"}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {rankLabel(officer.rank)} · Badge {officer.badge_number ?? "—"} ·{" "}
                  {station?.name ?? "No station"}
                </p>
              </div>

              {/* Verification badge */}
              <span
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]",
                  officer.status === "verified"
                    ? "border-success/40 bg-success/12 text-success"
                    : officer.status === "pending"
                      ? "border-gold/40 bg-gold/12 text-gold"
                      : "border-primary/45 bg-primary/12 text-primary",
                )}
              >
                {officer.status}
              </span>

              {/* Verify / Suspend */}
              {officer.status !== "verified" ? (
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={setVerifyStatus.isPending}
                  onClick={() => setVerifyStatus.mutate({ id: officer.id, status: "verified" })}
                >
                  Verify
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  disabled={setVerifyStatus.isPending}
                  onClick={() => setVerifyStatus.mutate({ id: officer.id, status: "suspended" })}
                >
                  Suspend
                </Button>
              )}
            </div>

            {/* Duty status row (only for verified officers) */}
            {officer.status === "verified" && (
              <div className="mt-3 flex flex-wrap items-center gap-2 pl-[52px]">
                <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Duty:
                </span>
                <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px]", DUTY_META[officer.duty_status] ?? DUTY_META.offline)}>
                  {dutyStatusLabel(officer.duty_status)}
                </span>
                {DUTY_STATUSES.filter((d) => d.value !== officer.duty_status).map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    disabled={setDutyStatus.isPending}
                    onClick={() => setDutyStatus.mutate({ id: officer.id, duty_status: d.value })}
                    className="rounded-full border border-border/50 bg-secondary/35 px-2.5 py-0.5 text-[10px] text-muted-foreground transition hover:border-border hover:text-foreground"
                  >
                    → {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {officers.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">No officer records yet.</p>
      )}
    </div>
  );
}
