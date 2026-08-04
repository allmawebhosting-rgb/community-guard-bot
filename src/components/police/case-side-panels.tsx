import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FileImage, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  caseDispatchesQuery,
  evidenceQuery,
  officersQuery,
  statusLabel,
  timeAgo,
} from "@/lib/police";

export function CaseSidePanels({ caseId }: { caseId: string }) {
  const { data: dispatches = [] } = useQuery(caseDispatchesQuery(caseId));
  const { data: evidence = [] } = useQuery(evidenceQuery(caseId));
  const { data: officers = [] } = useQuery(officersQuery);
  const [busy, setBusy] = useState<string | null>(null);

  async function openEvidence(path: string) {
    setBusy(path);
    const { data, error } = await supabase.storage.from("evidence").createSignedUrl(path, 300);
    setBusy(null);
    if (error || !data) {
      toast.error("Could not open this evidence file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
        <h2 className="font-display text-sm font-semibold">Dispatch record</h2>
        <div className="mt-3 space-y-2">
          {dispatches.map((d) => {
            const officer = officers.find((o) => o.id === d.officer_id);
            return (
              <div key={d.id} className="rounded-2xl border border-border/50 bg-secondary/35 p-3">
                <p className="text-sm">{officer?.full_name ?? "Officer"}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {statusLabel(d.status)} · {timeAgo(d.created_at)}
                </p>
              </div>
            );
          })}
          {dispatches.length === 0 && (
            <p className="text-sm text-muted-foreground">No officer dispatched yet.</p>
          )}
        </div>
      </section>

      <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-display text-sm font-semibold">Evidence locker</h2>
        </div>
        <div className="mt-3 space-y-2">
          {evidence.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-2xl border border-border/50 bg-secondary/35 p-3"
            >
              <FileImage className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px]">{item.caption ?? item.storage_path}</p>
                <p className="text-[10px] text-muted-foreground">
                  {item.media_type ?? "file"} · {timeAgo(item.created_at)}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                disabled={busy === item.storage_path}
                onClick={() => openEvidence(item.storage_path)}
              >
                Open
              </Button>
            </div>
          ))}
          {evidence.length === 0 && (
            <p className="text-sm text-muted-foreground">No evidence attached to this case.</p>
          )}
        </div>
      </section>
    </>
  );
}
