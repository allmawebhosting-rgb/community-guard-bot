import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { myOfficerQuery, officerMessagesQuery, officersQuery, rankLabel, timeAgo } from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/comms")({
  component: CommsPage,
});

function CommsPage() {
  const qc = useQueryClient();
  const { data: officer } = useQuery(myOfficerQuery);
  const { data: officers = [] } = useQuery(officersQuery);
  const { data: messages = [] } = useQuery(officerMessagesQuery);
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = supabase
      .channel("officer-comms")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "officer_messages" },
        () => qc.invalidateQueries({ queryKey: ["police", "comms"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async () => {
      const body = text.trim().slice(0, 800);
      if (!body) throw new Error("Type a message");
      if (!officer) throw new Error("Officer profile not loaded");
      const { error } = await supabase
        .from("officer_messages")
        .insert({ channel: "command", body, sender_id: officer.id });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["police", "comms"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto flex h-[calc(100vh-11rem)] w-full max-w-3xl flex-col">
      <div className="premium-surface flex min-h-0 flex-1 flex-col rounded-3xl border border-border/55 shadow-soft">
        <div className="border-b border-border/50 px-5 py-3.5">
          <p className="font-display text-sm font-semibold">Command channel</p>
          <p className="text-[11px] text-muted-foreground">
            Secure radio log for verified officers · live
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
          {messages.map((m) => {
            const sender = officers.find((o) => o.id === m.sender_id);
            const mine = officer && m.sender_id === officer.id;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl border px-3.5 py-2.5",
                    mine
                      ? "border-primary/45 bg-primary/12"
                      : "border-border/50 bg-secondary/35",
                  )}
                >
                  <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    {sender?.full_name ?? "Officer"} · {rankLabel(sender?.rank)}
                  </p>
                  <p className="mt-1 text-sm">{m.body}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{timeAgo(m.created_at)}</p>
                </div>
              </div>
            );
          })}
          {messages.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Channel is quiet. Send the first transmission.
            </p>
          )}
          <div ref={bottom} />
        </div>

        <div className="flex items-center gap-2 border-t border-border/50 px-4 py-3">
          <Input
            value={text}
            maxLength={800}
            placeholder="Transmit to command channel…"
            className="rounded-full"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send.mutate();
              }
            }}
          />
          <Button
            size="icon"
            className="shrink-0 rounded-full"
            disabled={send.isPending}
            onClick={() => send.mutate()}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
