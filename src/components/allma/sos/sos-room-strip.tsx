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
export function SosRoomStrip({ activityId }: { activityId: string | null }) {
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
      <div className="py-3">
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
      className="my-3 flex w-full items-center gap-3 rounded-2xl border border-gold/35 bg-gold/[0.08] px-4 py-3 text-left transition-colors hover:bg-gold/[0.16]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-destructive to-gold">
        <MessageSquare className="h-4 w-4 text-primary-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-bold uppercase tracking-[0.16em] text-destructive">
          Emergency chat
          {incoming.length > 0 ? ` · ${incoming.length}` : ""}
        </span>
        <span className="block truncate text-[12px] text-muted-foreground">
          {latest
            ? `${latest.body} · ${relativeTime(latest.created_at)}`
            : "Message the people alerted about this emergency."}
        </span>
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
