import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { logAudit, officersQuery, rankLabel, stationsQuery } from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/officers")({
  component: OfficersPage,
});

function OfficersPage() {
  const qc = useQueryClient();
  const { data: officers = [] } = useQuery(officersQuery);
  const { data: stations = [] } = useQuery(stationsQuery);

  const setStatus = useMutation({
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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-2">
      {officers.map((officer) => {
        const station = stations.find((s) => s.id === officer.station_id);
        return (
          <div
            key={officer.id}
            className="premium-surface flex flex-wrap items-center gap-3 rounded-3xl border border-border/55 p-4 shadow-soft"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{officer.full_name || "Unnamed officer"}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {rankLabel(officer.rank)} · Badge {officer.badge_number ?? "—"} ·{" "}
                {station?.name ?? "No station"}
              </p>
            </div>
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
            {officer.status !== "verified" ? (
              <Button
                size="sm"
                className="rounded-full"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: officer.id, status: "verified" })}
              >
                Verify
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: officer.id, status: "suspended" })}
              >
                Suspend
              </Button>
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
