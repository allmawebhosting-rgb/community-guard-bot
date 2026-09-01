import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { MapPin, MessageSquare, Send, ShieldAlert, Users, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";
import { LiveLocationMap } from "@/components/allma/live-location-map";
import {
  EMERGENCY_TYPE_LABELS,
  relativeTime,
  sendSosRoomMessage,
  sosRoomMessagesQueryOptions,
  sosRoomQueryOptions,
  subscribeSosRoomMessages,
  type SosRoomMessage,
} from "@/lib/sos-rooms";

/**
 * The shared chat for one real SOS activation: the person in danger plus every
 * contact who was called and every responder who was offered the emergency.
 * Location only renders when the sender's device actually shared coordinates.
 */
export function EmergencyRoom({
  sosActivityId,
  currentUserId,
  onClose,
  compact = false,
}: {
  sosActivityId: string;
  currentUserId: string | null;
  onClose?: () => void;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const roomQuery = useQuery(sosRoomQueryOptions(sosActivityId));
  const messagesQuery = useQuery(sosRoomMessagesQueryOptions(sosActivityId));
  const room = roomQuery.data ?? null;
  const messages = messagesQuery.data ?? [];

  useEffect(() => {
    return subscribeSosRoomMessages(sosActivityId, (incoming) => {
      queryClient.setQueryData<SosRoomMessage[]>(
        ["sos-room-messages", sosActivityId],
        (current) => {
          const rows = current ?? [];
          if (rows.some((row) => row.id === incoming.id)) return rows;
          return [...rows, incoming];
        },
      );
    });
  }, [queryClient, sosActivityId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const nameById = useMemo(() => {
    const map = new Map<string, { name: string; avatar: string | null }>();
    if (room) {
      map.set(room.owner_id, { name: room.sender_name, avatar: room.sender_avatar_url });
      for (const person of room.participants) {
        map.set(person.user_id, { name: person.name, avatar: person.avatar_url });
      }
    }
    return map;
  }, [room]);

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    try {
      await sendSosRoomMessage(sosActivityId, body);
      void messagesQuery.refetch();
    } catch (error) {
      setDraft(body);
      toast.error(error instanceof Error ? error.message : "Message not sent.");
    } finally {
      setSending(false);
    }
  }

  const label = EMERGENCY_TYPE_LABELS[room?.emergency_type ?? "other"] ?? "Emergency";

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-[1.5rem] border border-gold/30 bg-card shadow-soft"
    >
      <header className="flex items-start gap-3 border-b border-border/60 bg-gradient-to-r from-destructive/10 via-gold/10 to-transparent px-4 py-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-destructive to-gold shadow-soft">
          <ShieldAlert className="h-5 w-5 text-primary-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-destructive">
            Emergency room · {label}
          </p>
          <h3 className="truncate font-display text-[17px] font-black leading-tight">
            {room?.is_mine ? "Your SOS" : room ? `${room.sender_name} needs help` : "Loading…"}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            {room?.area ?? "Location pending"} · {relativeTime(room?.created_at ?? null)}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close emergency room"
            className="rounded-full border border-border/60 p-1.5 text-muted-foreground transition-colors hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </header>

      {room?.location_shared && room.latitude != null && room.longitude != null ? (
        <div className="border-b border-border/60 px-4 py-3">
          <LiveLocationMap
            location={{
              lat: room.latitude,
              lng: room.longitude,
              accuracy: room.accuracy_m,
              address: room.area,
            }}
            badge={room.is_mine ? "Your position" : "Live position"}
            directions
            directionsLabel="Get directions"
          />
        </div>
      ) : (
        <p className="border-b border-border/60 px-4 py-2.5 text-[11px] text-muted-foreground">
          Location has not been shared for this emergency.
        </p>
      )}

      {!compact && room && room.participants.length > 0 ? (
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
          <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="truncate text-[11px] text-muted-foreground">
            {room.participants.map((person) => person.name).join(", ")}
          </p>
        </div>
      ) : null}

      <div
        className={cn(
          "space-y-3 overflow-y-auto px-4 py-4",
          compact ? "max-h-[220px]" : "max-h-[46vh] min-h-[180px]",
        )}
      >
        {messages.length === 0 ? (
          <div className="grid place-items-center gap-2 py-6 text-center">
            <MessageSquare className="h-5 w-5 text-muted-foreground/70" />
            <p className="text-[12px] text-muted-foreground">
              No messages yet. Ask for the details you need before you go.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            if (message.event_type !== "message") {
              return (
                <p
                  key={message.id}
                  className="text-center text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80"
                >
                  {message.body}
                </p>
              );
            }
            const mine = message.author_id === currentUserId;
            const person = message.author_id ? nameById.get(message.author_id) : undefined;
            return (
              <div
                key={message.id}
                className={cn("flex items-end gap-2", mine && "flex-row-reverse")}
              >
                <Avatar name={person?.name ?? "Allma member"} url={person?.avatar ?? null} size={28} />
                <div className={cn("max-w-[76%]", mine && "text-right")}>
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                    {mine ? "You" : (person?.name ?? "Allma member")} · {relativeTime(message.created_at)}
                  </p>
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2 text-left text-[13px] leading-relaxed shadow-soft",
                      mine
                        ? "bg-gradient-to-br from-primary to-gold text-primary-foreground"
                        : "border border-border/60 bg-secondary/60 text-foreground",
                    )}
                  >
                    {message.body}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex items-center gap-2 border-t border-border/60 bg-secondary/30 px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={room?.is_mine ? "Reply to your responders…" : "Ask for details…"}
          aria-label="Message"
          className="min-w-0 flex-1 rounded-full border border-border/60 bg-background px-4 py-2.5 text-base outline-none placeholder:text-muted-foreground/70 focus:border-gold/60 sm:text-[15px]"
          style={{ fontSize: 16 }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send message"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-destructive to-gold text-primary-foreground shadow-soft transition-opacity disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </motion.section>
  );
}
