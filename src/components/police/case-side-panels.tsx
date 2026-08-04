import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  FileImage, FileText, FileAudio, FileVideo, Paperclip,
  ExternalLink, Lock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { evidenceQuery, timeAgo } from "@/lib/police";
import { cn } from "@/lib/utils";

export function CaseSidePanels({ caseId }: { caseId: string }) {
  const { data: evidence = [] } = useQuery(evidenceQuery(caseId));
  const [busy, setBusy] = useState<string | null>(null);

  async function openEvidence(path: string) {
    setBusy(path);
    const { data, error } = await supabase.storage.from("evidence").createSignedUrl(path, 300);
    setBusy(null);
    if (error || !data) { toast.error("Could not open evidence file"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function mediaIcon(type: string | null) {
    if (!type) return FileText;
    if (type.startsWith("image")) return FileImage;
    if (type.startsWith("video")) return FileVideo;
    if (type.startsWith("audio")) return FileAudio;
    return FileText;
  }

  function mediaColor(type: string | null) {
    if (!type) return "text-muted-foreground";
    if (type.startsWith("image")) return "text-primary";
    if (type.startsWith("video")) return "text-alert";
    if (type.startsWith("audio")) return "text-gold";
    return "text-muted-foreground";
  }

  return (
    <div className="card-desktop">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-5 w-5 place-items-center rounded-md bg-secondary/80">
          <Lock className="h-3 w-3 text-muted-foreground" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Evidence Locker</p>
        {evidence.length > 0 && (
          <span className="ml-auto rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] font-medium tabular-nums">
            {evidence.length}
          </span>
        )}
      </div>

      {evidence.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Paperclip className="h-5 w-5 text-muted-foreground/40" />
          <p className="text-[12px] text-muted-foreground">No evidence attached yet.</p>
          <p className="text-[10px] text-muted-foreground/60">Evidence uploaded by the citizen will appear here.</p>
        </div>
      )}

      <div className="space-y-1.5">
        {evidence.map((item) => {
          const Icon = mediaIcon(item.media_type);
          const color = mediaColor(item.media_type);
          const isBusy = busy === item.storage_path;
          return (
            <button
              key={item.id}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg border border-border/40 bg-secondary/20 p-2.5 text-left transition hover:border-border hover:bg-secondary/40",
                isBusy && "opacity-60",
              )}
              disabled={isBusy}
              onClick={() => openEvidence(item.storage_path)}
            >
              <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary/60", color)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium">
                  {item.caption ?? item.storage_path.split("/").pop() ?? "Evidence file"}
                </p>
                <p className="text-[10px] text-muted-foreground capitalize">
                  {item.media_type?.split("/")[0] ?? "file"} · {timeAgo(item.created_at)}
                </p>
              </div>
              <ExternalLink className={cn(
                "h-3.5 w-3.5 shrink-0 transition",
                isBusy ? "animate-pulse text-muted-foreground" : "text-muted-foreground/40 group-hover:text-muted-foreground",
              )} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
