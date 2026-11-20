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
  my_offer_status: string | null;
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
  /** Latest SOS call state for this authorised member — never invents membership. */
  connection_status?: "connected" | "joined" | "disconnected" | string | null;
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
  thread_id: string | null;
  author_id: string | null;
  event_type: string;
  body: string;
  duration_seconds: number | null;
  created_at: string;
};

export type SharedChatMessageRow = {
  id: string;
  thread_id: string;
  user_id: string;
  role: string;
  parts: unknown;
  sdk_message_id: string | null;
  created_at: string;
  recipient?: string | null;
};

export type ChatThreadContext = {
  owner_id: string;
  is_owner: boolean;
  sos_activity_id: string | null;
  sos_active: boolean;
};

function friendly(message: string) {
  return message.replace(/^.*?:\s*/, "").trim() || "Something went wrong.";
}

export async function listSosRooms(): Promise<SosRoomSummary[]> {
  const [{ data, error }, { data: offerData, error: offerError }] = await Promise.all([
    supabase.rpc("list_sos_rooms"),
    supabase.rpc("get_my_sos_offers"),
  ]);
  if (error) throw new Error(friendly(error.message));
  if (offerError) throw new Error(friendly(offerError.message));
  const offers = (offerData ?? []) as Array<{ sos_activity_id: string; status: string }>;
  const statusBySos = new Map(offers.map((offer) => [offer.sos_activity_id, offer.status]));
  return ((data ?? []) as Omit<SosRoomSummary, "my_offer_status">[]).map((room) => ({
    ...room,
    my_offer_status: statusBySos.get(room.sos_activity_id) ?? null,
  }));
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

export function chatThreadContextQueryOptions(threadId: string | null) {
  return queryOptions({
    queryKey: ["chat-thread-context", threadId],
    queryFn: async (): Promise<ChatThreadContext | null> => {
      if (!threadId) return null;
      const { data, error } = await (supabase as any).rpc("get_chat_thread_context", {
        p_thread_id: threadId,
      });
      if (error) throw new Error(friendly(error.message));
      return ((data ?? [])[0] as ChatThreadContext | undefined) ?? null;
    },
    enabled: Boolean(threadId),
  });
}

export async function getSosThreadForActivity(sosActivityId: string) {
  const { data, error } = await (supabase as any).rpc("get_sos_thread_for_activity", {
    p_sos_activity_id: sosActivityId,
  });
  if (error) throw new Error(friendly(error.message));
  return (data as string | null) ?? null;
}

/**
 * After a responder accepts an SOS call/offer, resolve the one shared chat for
 * that emergency (creating/linking a thread when needed) and return its id.
 */
export async function openSharedSosConversation(sosActivityId: string): Promise<string> {
  const { data, error } = await (supabase as any).rpc("open_sos_shared_conversation", {
    p_sos_activity_id: sosActivityId,
  });
  if (!error && data) return data as string;

  // Fallback for environments that have not applied the latest migration yet:
  // retry the read helper briefly while invitation/offer acceptance lands in RLS.
  let lastError = error ? friendly(error.message) : "Shared conversation unavailable.";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const threadId = await getSosThreadForActivity(sosActivityId);
      if (threadId) return threadId;
    } catch (readError) {
      lastError = readError instanceof Error ? readError.message : lastError;
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }
  throw new Error(lastError);
}

export async function listSosRoomMessages(sosActivityId: string): Promise<SosRoomMessage[]> {
  const { data, error } = await (supabase as any)
    .from("emergency_chat_events")
    .select("id, sos_session_id, thread_id, author_id, event_type, body, duration_seconds, created_at")
    .eq("sos_session_id", sosActivityId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as SosRoomMessage[];
}

export async function listConversationMessages(threadId: string): Promise<SharedChatMessageRow[]> {
  // Prefer the security-definer RPC so authorised SOS responders always receive
  // the full original timeline (not an empty chat filtered by their user id).
  const { data, error } = await (supabase as any).rpc("list_shared_conversation_messages", {
    p_thread_id: threadId,
  });
  if (!error) return (data ?? []) as SharedChatMessageRow[];

  const fallback = await supabase
    .from("messages")
    .select("id, thread_id, user_id, role, parts, sdk_message_id, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (fallback.error) throw new Error(friendly(error.message || fallback.error.message));
  return (fallback.data ?? []) as SharedChatMessageRow[];
}

/** Flush in-memory chat turns into the canonical messages table before SOS fan-out. */
export async function persistConversationMessages(
  threadId: string,
  rows: Array<{
    id: string;
    role: string;
    parts: unknown;
    authorId?: string | null;
    recipient?: string | null;
  }>,
) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Please sign in to save this conversation.");
  const payload = rows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      sdk_message_id: row.id,
      role: row.role,
      parts: row.parts,
      user_id: row.authorId || userId,
      recipient: row.recipient === "responders" ? "responders" : "allma",
    }));
  if (payload.length === 0) return 0;
  const { data, error } = await (supabase as any).rpc("publish_conversation_messages", {
    p_thread_id: threadId,
    p_messages: payload,
  });
  if (error) throw new Error(friendly(error.message));
  return typeof data === "number" ? data : payload.length;
}

export function sosRoomMessagesQueryOptions(sosActivityId: string | null) {
  return queryOptions({
    queryKey: ["sos-room-messages", sosActivityId],
    queryFn: () => (sosActivityId ? listSosRoomMessages(sosActivityId) : []),
    enabled: Boolean(sosActivityId),
  });
}

export async function sendSosRoomMessage(
  sosActivityId: string,
  body: string,
  threadId?: string | null,
) {
  const trimmed = body.trim();
  if (!trimmed) return;
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Please sign in to send a message.");
  const linkedThreadId = threadId ?? (await getSosThreadForActivity(sosActivityId));
  const { error } = await (supabase as any).from("emergency_chat_events").insert({
    sos_session_id: sosActivityId,
    thread_id: linkedThreadId,
    author_id: userId,
    event_type: "user_message",
    body: trimmed.slice(0, 2000),
  });
  if (error) throw new Error(friendly(error.message));
}

export async function sendSosRoomVoiceNote(
  sosActivityId: string,
  threadId: string,
  clip: Blob,
  durationSeconds: number,
) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Please sign in to send a voice note.");
  if (!clip.size) throw new Error("That recording was empty — please try again.");

  const mimeType = clip.type.split(";")[0] || "application/octet-stream";
  if (!mimeType.startsWith("audio/")) throw new Error("This recording format is not supported.");
  const extension = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "audio";
  const path = `${sosActivityId}/${userId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("emergency-chat-voice")
    .upload(path, clip, { contentType: mimeType, upsert: false });
  if (uploadError) throw new Error(friendly(uploadError.message));

  const { error } = await (supabase as any).from("emergency_chat_events").insert({
    sos_session_id: sosActivityId,
    thread_id: threadId,
    author_id: userId,
    event_type: "voice_note",
    body: path,
    duration_seconds: Math.max(0, Math.round(durationSeconds)),
  });
  if (error) {
    await supabase.storage.from("emergency-chat-voice").remove([path]);
    throw new Error(friendly(error.message));
  }
}

export async function getSosRoomVoiceNoteUrl(path: string) {
  const { data, error } = await supabase.storage
    .from("emergency-chat-voice")
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error(friendly(error?.message ?? ""));
  return data.signedUrl;
}

/** Live message stream for one emergency room. */
export function subscribeSosRoomMessages(
  sosActivityId: string,
  onMessage: (message: SosRoomMessage) => void,
  onSubscribed?: () => void,
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
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onSubscribed?.();
    });
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Live participant / call-state changes for the shared emergency conversation. */
export function subscribeSosRoomParticipants(sosActivityId: string, onChange: () => void) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const invitations = supabase
    .channel(`sos-participants-invites-${sosActivityId}-${suffix}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "emergency_call_invitations",
        filter: `emergency_id=eq.${sosActivityId}`,
      },
      () => onChange(),
    )
    .subscribe();
  const calls = supabase
    .channel(`sos-participants-calls-${sosActivityId}-${suffix}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "emergency_calls",
        filter: `sos_session_id=eq.${sosActivityId}`,
      },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(invitations);
    void supabase.removeChannel(calls);
  };
}

export function subscribeConversationMessages(
  threadId: string,
  onMessage: (message: SharedChatMessageRow) => void,
  onSubscribed?: () => void,
) {
  const channel = supabase
    .channel(`chat-thread-${threadId}-${Math.random().toString(36).slice(2, 8)}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => onMessage(payload.new as SharedChatMessageRow),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onSubscribed?.();
    });
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
