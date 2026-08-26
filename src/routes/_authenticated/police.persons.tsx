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

type PublicClaim = { id: string; item_id: string; claimant_name: string; claimant_phone: string; proof_text: string; status: string; created_at: string };
type PublicLostReport = { id: string; item_type: string; description: string; location_text: string; district: string; occurred_on: string; contact_name: string; contact_phone: string; status: string; created_at: string };

function PersonsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("missing");
  const { data: persons = [] } = useQuery(missingPersonsQuery);
  const { data: items = [] } = useQuery(lostFoundQuery);
  const { data: claims = [] } = useQuery({ queryKey: ["police", "lostfound", "claims"], queryFn: async () => { const { data, error } = await supabase.from("lost_found_claims").select("*").eq("status", "pending").order("created_at", { ascending: false }); if (error) throw error; return (data ?? []) as PublicClaim[]; }, enabled: tab === "items" });
  const { data: publicReports = [] } = useQuery({ queryKey: ["police", "lostfound", "public-reports"], queryFn: async () => { const { data, error } = await supabase.from("lost_found_public_reports").select("*").eq("status", "pending").order("created_at", { ascending: false }); if (error) throw error; return (data ?? []) as PublicLostReport[]; }, enabled: tab === "items" });

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

  const setClaimStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      if (status === "approved") {
        const { error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: Error | null }> }).rpc("approve_lost_found_claim", { p_claim_id: id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lost_found_claims").update({ status }).eq("id", id);
        if (error) throw error;
      }
      await logAudit(`lost_found_claim_${status}`, "lost_found_claims", id, { status });
    },
    onSuccess: () => { toast.success("Claim updated"); qc.invalidateQueries({ queryKey: ["police", "lostfound"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="w-full space-y-4">
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
          <section className="mt-6 space-y-2"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pending claims</p>{claims.map((claim) => <div key={claim.id} className="premium-surface rounded-3xl border border-gold/25 bg-gold/[0.04] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{claim.claimant_name} · {claim.claimant_phone}</p><p className="mt-1 text-[11px] text-muted-foreground">Item {claim.item_id} · {timeAgo(claim.created_at)}</p></div><div className="flex gap-2"><Button size="sm" className="rounded-full" disabled={setClaimStatus.isPending} onClick={() => setClaimStatus.mutate({ id: claim.id, status: "approved" })}>Approve & release</Button><Button size="sm" variant="outline" className="rounded-full" disabled={setClaimStatus.isPending} onClick={() => setClaimStatus.mutate({ id: claim.id, status: "rejected" })}>Reject</Button></div></div><p className="mt-3 rounded-xl bg-background/50 p-3 text-[12px] leading-relaxed">{claim.proof_text}</p></div>)}{claims.length === 0 && <p className="text-sm text-muted-foreground">No pending claims.</p>}</section>
          <section className="mt-6 space-y-2"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Public lost reports</p>{publicReports.map((report) => <div key={report.id} className="premium-surface rounded-3xl border border-border/55 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{report.item_type} · {report.district}</p><p className="mt-1 text-[11px] text-muted-foreground">{report.location_text} · {report.occurred_on} · {report.contact_name} · {report.contact_phone}</p></div><span className="rounded-full bg-gold/10 px-2 py-1 text-[10px] font-bold uppercase text-gold">Pending match</span></div><p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">{report.description}</p></div>)}{publicReports.length === 0 && <p className="text-sm text-muted-foreground">No public lost reports awaiting review.</p>}</section>
        </div>
      )}
    </div>
  );
}
