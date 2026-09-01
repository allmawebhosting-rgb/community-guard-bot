import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Emergency rooms ─────────────────────────────────────────────────────────
// A "room" is the shared chat around one real SOS activation. Membership is
// enforced in the database (can_access_sos_room), so nothing here is simulated:
// every row shown corresponds to a real emergency the signed-in user is part of.

export type SosRoomSummary = {
  sos_activity_id: string;
  owner_id: string;
  sender_name: string;
  sender_avatar_url: string | null;
  emergency_type: string;
  severity: string;
  area: string;
  created_at: string;
  is_mine: boolean;
  my_invitation_status: string | null;
  my_call_session_id: string | null;
  distance_m: number | null;
  location_shared: boolean;
  last_message_at: string | null;
  message_count: number;
};

export type SosRoomParticipant = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  role: string;
};

export type SosRoomDetail = {
  sos_activity_id: string;
  owner_id: string;
  sender_name: string;
  sender_avatar_url: string | null;
  emergency_type: string;
  severity: string;
  area: string;
  created_at: string;
  is_mine: boolean;
  location_shared: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  participants: SosRoomParticipant[];
};

export type SosRoomMessage = {
  id: string;
  sos_session_id: string | null;
  author_id: string | null;
  event_type: string;
  body: string;
  created_at: string;
};

function friendly(message: string) {
  return message.replace(/^.*?:\s*/, "").trim() || "Something went wrong.";
}

export async function listSosRooms(): Promise<SosRoomSummary[]> {
  const { data, error } = await supabase.rpc("list_sos_rooms");
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as SosRoomSummary[];
}

export function sosRoomsQueryOptions() {
  return queryOptions({
    queryKey: ["sos-rooms"],
    queryFn: listSosRooms,
    refetchInterval: 15_000,
  });
}

export async function getSosRoom(sosActivityId: string): Promise<SosRoomDetail | null> {
  const { data, error } = await supabase.rpc("get_sos_room", { p_sos_id: sosActivityId });
  if (error) throw new Error(friendly(error.message));
  const row = (data ?? [])[0];
  if (!row) return null;
  const raw = row as unknown as Omit<SosRoomDetail, "participants"> & { participants: unknown };
  const participants = Array.isArray(raw.participants)
    ? (raw.participants as SosRoomParticipant[]).filter((entry) => Boolean(entry?.user_id))
    : [];
  return { ...raw, participants };
}

export function sosRoomQueryOptions(sosActivityId: string | null) {
  return queryOptions({
    queryKey: ["sos-room", sosActivityId],
    queryFn: () => (sosActivityId ? getSosRoom(sosActivityId) : null),
    enabled: Boolean(sosActivityId),
    // The sender's GPS is persisted while the emergency is live.
    refetchInterval: 10_000,
  });
}

export async function listSosRoomMessages(sosActivityId: string): Promise<SosRoomMessage[]> {
  const { data, error } = await supabase
    .from("emergency_chat_events")
    .select("id, sos_session_id, author_id, event_type, body, created_at")
    .eq("sos_session_id", sosActivityId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as SosRoomMessage[];
}

export function sosRoomMessagesQueryOptions(sosActivityId: string | null) {
  return queryOptions({
    queryKey: ["sos-room-messages", sosActivityId],
    queryFn: () => (sosActivityId ? listSosRoomMessages(sosActivityId) : []),
    enabled: Boolean(sosActivityId),
  });
}

export async function sendSosRoomMessage(sosActivityId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) return;
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Please sign in to send a message.");
  const { error } = await supabase.from("emergency_chat_events").insert({
    sos_session_id: sosActivityId,
    author_id: userId,
    event_type: "user_message",
    body: trimmed.slice(0, 2000),
  });
  if (error) throw new Error(friendly(error.message));
}

/** Live message stream for one emergency room. */
export function subscribeSosRoomMessages(
  sosActivityId: string,
  onMessage: (message: SosRoomMessage) => void,
) {
  const channel = supabase
    .channel(`sos-room-${sosActivityId}-${Math.random().toString(36).slice(2, 8)}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "emergency_chat_events",
        filter: `sos_session_id=eq.${sosActivityId}`,
      },
      (payload) => onMessage(payload.new as SosRoomMessage),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Live signal that a new emergency was aimed at this user. */
export function subscribeSosRoomInbox(userId: string, onChange: () => void) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const invites = supabase
    .channel(`sos-inbox-invites-${suffix}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "emergency_call_invitations",
        filter: `recipient_user_id=eq.${userId}`,
      },
      () => onChange(),
    )
    .subscribe();
  const offers = supabase
    .channel(`sos-inbox-offers-${suffix}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sos_responder_offers",
        filter: `responder_id=eq.${userId}`,
      },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(invites);
    void supabase.removeChannel(offers);
  };
}

export const EMERGENCY_TYPE_LABELS: Record<string, string> = {
  crime: "Crime / Theft",
  medical: "Medical emergency",
  fire: "Fire",
  attack: "Attack / Violence",
  accident: "Road accident",
  missing: "Missing person",
  domestic: "Domestic violence",
  other: "Emergency",
};

export function relativeTime(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}
