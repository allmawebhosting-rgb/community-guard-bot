import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  MapPin,
  MessageSquare,
  PhoneIncoming,
  Radio,
  ShieldAlert,
  Siren,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EMERGENCY_TYPE_LABELS,
  relativeTime,
  sosRoomsQueryOptions,
  subscribeSosRoomInbox,
  type SosRoomSummary,
} from "@/lib/sos-rooms";

const RING_STATES = new Set(["pending", "sent", "delivered", "ringing"]);

function statusLabel(room: SosRoomSummary) {
  if (room.is_mine) return "Your emergency";
  const status = room.my_invitation_status;
  if (status && RING_STATES.has(status)) return "Ringing you now";
  if (status === "accepted") return "You answered";
  if (status === "declined") return "You declined";
  if (status === "cancelled") return "Call cancelled";
  if (room.distance_m != null) {
    return room.distance_m < 1000
      ? `Responder request · ${Math.round(room.distance_m)} m away`
      : `Responder request · ${(room.distance_m / 1000).toFixed(1)} km away`;
  }
  return "Alerted to you";
}

export function SosInbox({
  activeRoomId,
  onOpenRoom,
}: {
  activeRoomId: string | null;
  onOpenRoom: (sosActivityId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [busyOffer, setBusyOffer] = useState<string | null>(null);
  const roomsQuery = useQuery(sosRoomsQueryOptions());
  const rooms = roomsQuery.data ?? [];

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setUserId(data.user?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    return subscribeSosRoomInbox(userId, () => {
      void queryClient.invalidateQueries({ queryKey: ["sos-rooms"] });
    });
  }, [queryClient, userId]);

  async function respondToOffer(room: SosRoomSummary, accept: boolean) {
    setBusyOffer(room.sos_activity_id);
    try {
      const { data: offers, error: offerError } = await supabase.rpc("get_my_sos_offers");
      if (offerError) throw new Error(offerError.message);
      const offer = (offers ?? []).find((row) => row.sos_activity_id === room.sos_activity_id);
      if (!offer) throw new Error("This responder request is no longer available.");
      const { error } = await supabase.rpc("respond_to_sos_offer", {
        p_offer_id: offer.offer_id,
        p_status: accept ? "accepted" : "declined",
      });
      if (error) throw new Error(error.message);
      toast.success(accept ? "You accepted this emergency." : "Request declined.");
      void queryClient.invalidateQueries({ queryKey: ["sos-rooms"] });
      if (accept) onOpenRoom(room.sos_activity_id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not respond.");
    } finally {
      setBusyOffer(null);
    }
  }

  if (roomsQuery.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((index) => (
          <Skeleton key={index} className="h-24 w-full rounded-[1.35rem]" />
        ))}
      </div>
    );
  }

  if (!rooms.length) {
    return (
      <div className="rounded-[1.35rem] border border-dashed border-border/60 bg-card/60 p-5 text-center">
        <Radio className="mx-auto h-5 w-5 text-muted-foreground/70" />
        <p className="mt-2 text-[13px] font-semibold">No live emergencies</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          When someone in your Safety Network raises an SOS, it lands here with a chat so you can
          ask for details before you go.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <AnimatePresence initial={false}>
        {rooms.map((room, index) => {
          const ringing = !room.is_mine && RING_STATES.has(room.my_invitation_status ?? "");
          const isOffer = !room.is_mine && !room.my_invitation_status && room.distance_m != null;
          const active = activeRoomId === room.sos_activity_id;
          return (
            <motion.article
              key={room.sos_activity_id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.2) }}
              className={cn(
                "relative overflow-hidden rounded-[1.35rem] border bg-card p-4 shadow-soft transition-colors",
                active ? "border-gold/60" : "border-border/60",
                ringing && "border-destructive/60",
              )}
            >
              {ringing ? (
                <motion.span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-destructive via-gold to-destructive"
                  animate={{ opacity: [0.35, 1, 0.35] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                />
              ) : null}
              <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                  <Avatar name={room.sender_name} url={room.sender_avatar_url} size={44} />
                  <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-destructive to-gold">
                    {ringing ? (
                      <PhoneIncoming className="h-3 w-3 text-primary-foreground" />
                    ) : (
                      <Siren className="h-3 w-3 text-primary-foreground" />
                    )}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate font-display text-[15px] font-black leading-tight">
                      {room.is_mine ? "Your SOS" : `${room.sender_name} is in danger`}
                    </h3>
                    <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                      {relativeTime(room.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-destructive">
                    {EMERGENCY_TYPE_LABELS[room.emergency_type] ?? "Emergency"} · {room.severity}
                  </p>
                  <p className="mt-1 flex items-center gap-1 truncate text-[12px] text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {room.area}
                    {room.location_shared ? "" : " · location not shared"}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-muted-foreground/90">
                    {statusLabel(room)}
                    {room.message_count > 0 ? ` · ${room.message_count} message${room.message_count === 1 ? "" : "s"}` : ""}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenRoom(room.sos_activity_id)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-destructive to-gold px-3.5 py-1.5 text-[12px] font-semibold text-primary-foreground shadow-soft"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      {active ? "Chat open" : "Open chat"}
                    </button>
                    {isOffer ? (
                      <>
                        <button
                          type="button"
                          disabled={busyOffer === room.sos_activity_id}
                          onClick={() => void respondToOffer(room, true)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-gold/50 px-3.5 py-1.5 text-[12px] font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={busyOffer === room.sos_activity_id}
                          onClick={() => void respondToOffer(room, false)}
                          className="rounded-full border border-border/60 px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </>
                    ) : null}
                    {ringing ? (
                      <span className="inline-flex items-center rounded-full border border-destructive/40 px-3 py-1.5 text-[11px] font-medium text-destructive">
                        Answer on the incoming call screen
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </motion.article>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
