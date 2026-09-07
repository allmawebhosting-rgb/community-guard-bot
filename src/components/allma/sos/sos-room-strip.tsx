import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmergencyRoom } from "@/components/allma/calls/emergency-room";
import { relativeTime, sosRoomMessagesQueryOptions } from "@/lib/sos-rooms";

/**
 * Sender-side strip on the SOS screen: shows the real messages your responders
 * sent about this emergency and opens the same shared room to reply.
 */
export function SosRoomStrip({
  activityId,
  inline = false,
}: {
  activityId: string | null;
  /** Presentation only: drop outer margins when embedded inside a styled card. */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const messagesQuery = useQuery(sosRoomMessagesQueryOptions(activityId));

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setUserId(data.user?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!activityId) return null;

  const messages = messagesQuery.data ?? [];
  const incoming = messages.filter((message) => message.author_id !== userId);
  const latest = incoming[incoming.length - 1] ?? null;

  if (open) {
    return (
      <div className={inline ? "" : "py-3"}>
        <EmergencyRoom
          sosActivityId={activityId}
          currentUserId={userId}
          onClose={() => setOpen(false)}
          compact
          showLocation={false}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`${inline ? "" : "my-3 "}grid min-h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-left shadow-sm transition duration-200 hover:border-gold/45 hover:bg-gold/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive ring-1 ring-destructive/15">
        <MessageSquare className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-destructive">
          Emergency chat
          {incoming.length > 0 ? ` · ${incoming.length}` : ""}
        </span>
        <span className="mt-1 block truncate text-[12px] text-muted-foreground">
          {latest
            ? `${latest.body} · ${relativeTime(latest.created_at)}`
            : "Message the people alerted about this emergency."}
        </span>
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
