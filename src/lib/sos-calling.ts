import { supabase } from "@/integrations/supabase/client";

export type SosCallTarget = {
  member_id: string;
  full_name: string;
  avatar_url: string | null;
  safety_role: string;
  priority: number;
  share_location_on_sos: boolean;
  /** Set when the contact is listed but cannot be called; null when callable. */
  ineligible_reason?: string | null;
};

export type SosCallAttempt = {
  call_id: string;
  recipient_id: string;
  full_name: string;
  avatar_url: string | null;
  safety_role: string | null;
  status: string;
  created_at: string;
  /** Set when the contact really tapped Answer on their device. */
  accepted_at: string | null;
  connected_at: string | null;
  ended_at: string | null;
  duration: number | null;
};

export type EmergencyCallContext = {
  is_emergency: boolean;
  caller_name: string;
  caller_avatar_url: string | null;
  emergency_type: string;
  severity: string;
  area: string;
  location_shared: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy_m?: number | null;
};

function friendly(message: string) {
  const clean = message.replace(/^.*?:\s*/, "").trim();
  return clean || "Something went wrong. Please try again.";
}

const DISCOVERY_TIMEOUT_MS = 8_000;

async function withTimeout<T>(promise: PromiseLike<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), DISCOVERY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Members the signed-in user is allowed to call during their own SOS, in configured priority order. */
export async function listSosCallTargets(): Promise<SosCallTarget[]> {
  const { data: auth } = await withTimeout(
    supabase.auth.getUser(),
    "Unable to identify your Safety Network.",
  );
  const userId = auth.user?.id;
  if (!userId) throw new Error("Unable to identify your Safety Network.");
  console.info("[SAFETY NETWORK DEBUG] query started", {
    currentUserId: `${userId.slice(0, 8)}…`,
  });
  const { data, error } = await withTimeout(
    supabase.rpc("list_sos_call_targets"),
    "Unable to load your Safety Network.",
  );
  const useConnectionFallback = async (reason: string) => {
    // Older deployments may not have the SOS-specific RPC yet, or an existing
    // connection may not have all optional SOS flags configured. Reuse the
    // existing Safety Network query for discovery; the server-side
    // start_sos_emergency_call RPC still performs final authorization.
    console.warn("[SAFETY NETWORK DEBUG] SOS target RPC failed; using connection fallback", {
      message: reason,
    });
    const fallback = await withTimeout(
      supabase.rpc("list_safety_connections"),
      "Unable to load your Safety Network.",
    );
    if (fallback.error) throw new Error(friendly(fallback.error.message));
    const targets = ((fallback.data ?? []) as Array<{
      member_id?: string;
      full_name?: string;
      avatar_url?: string | null;
      safety_role?: string;
      priority?: number;
      notify_on_sos?: boolean;
      allow_emergency_calls?: boolean;
      share_location_on_sos?: boolean;
    }>)
      .filter((connection) => Boolean(connection.member_id))
      .map((connection) => ({
        member_id: connection.member_id!,
        full_name: connection.full_name || "Allma member",
        avatar_url: connection.avatar_url ?? null,
        safety_role: connection.safety_role || "Safety contact",
        priority: connection.priority ?? 0,
        share_location_on_sos: connection.share_location_on_sos !== false,
        // Kept in the list so the user can see who is skipped and why, instead
        // of an unexplained empty network.
        ineligible_reason:
          connection.allow_emergency_calls === false
            ? "Allma calls off"
            : connection.notify_on_sos === false
              ? "SOS alerts off"
              : null,
      }))
      .sort((a, b) => a.priority - b.priority);
    console.info("[SAFETY NETWORK DEBUG] fallback responders found", { count: targets.length });
    return targets;
  };
  if (error) return useConnectionFallback(friendly(error.message));
  const targets = (data ?? []) as SosCallTarget[];
  if (targets.length === 0) return useConnectionFallback("No SOS-eligible contacts returned");
  console.info("[SAFETY NETWORK DEBUG] responders found", { count: targets.length });
  return targets;
}

/** Server verifies SOS ownership, both-sided call permission and blocks. */
export async function startSosEmergencyCall(recipientId: string, sosActivityId: string) {
  const { data, error } = await supabase.rpc("start_sos_emergency_call", {
    p_recipient_id: recipientId,
    p_sos_activity_id: sosActivityId,
  });
  if (error) throw new Error(friendly(error.message));
  return data as string;
}

export async function listSosCallAttempts(sosActivityId: string): Promise<SosCallAttempt[]> {
  const { data, error } = await supabase.rpc("list_sos_call_attempts", {
    p_sos_activity_id: sosActivityId,
  });
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as SosCallAttempt[];
}

export async function isSosWelfareConfirmed(sosActivityId: string) {
  const { data, error } = await supabase
    .from("sos_welfare_checks")
    .select("confirmed_at")
    .eq("sos_activity_id", sosActivityId)
    .maybeSingle();
  return !error && Boolean(data?.confirmed_at);
}

export async function acceptEmergencyCallInvitation(invitationId: string) {
  const { data, error } = await supabase.rpc("accept_emergency_call_invitation", {
    p_invitation_id: invitationId,
  });
  if (error) throw error;
  const result = (data?.[0] ?? data) as { accepted?: boolean; call_session_id?: string } | null;
  return { accepted: Boolean(result?.accepted), callId: result?.call_session_id ?? null };
}

/** Only the recipient of the call can read this, and only what they're authorised to see. */
export async function getEmergencyCallContext(callId: string): Promise<EmergencyCallContext | null> {
  const { data, error } = await supabase.rpc("get_emergency_call_context", { p_call_id: callId });
  if (error) return null;
  const row = (data ?? [])[0];
  return row ? (row as EmergencyCallContext) : null;
}

/** Attempt state, derived only from real call rows — never assumed. */
export type AttemptState = "alerted" | "calling" | "answered" | "declined" | "no_answer" | "failed";

export function attemptState(status: string): AttemptState {
  switch (status) {
    case "initiating":
      return "alerted";
    case "ringing":
    case "connecting":
      return "calling";
    case "connected":
      return "answered";
    case "declined":
      return "declined";
    case "missed":
      return "no_answer";
    case "failed":
      return "failed";
    case "ended":
      return "no_answer";
    default:
      return "alerted";
  }
}

export const ATTEMPT_COPY: Record<AttemptState, { label: string; tone: string }> = {
  alerted: { label: "Alerted", tone: "text-muted-foreground" },
  calling: { label: "Calling", tone: "text-gold" },
  answered: { label: "Answered", tone: "text-success" },
  declined: { label: "Declined", tone: "text-destructive" },
  no_answer: { label: "No answer", tone: "text-muted-foreground" },
  failed: { label: "Call failed", tone: "text-destructive" },
};

/** A call attempt is finished (escalation may continue) once one of these lands. */
export function isTerminal(status: string) {
  return ["declined", "missed", "failed", "ended"].includes(status);
}

export function answeredAttempt(attempts: SosCallAttempt[]) {
  // A contact tapping Answer is a real human response, so escalation stops
  // there — media may still be negotiating when accepted_at lands.
  return attempts.find(
    (attempt) =>
      attempt.connected_at !== null ||
      attempt.accepted_at !== null ||
      attempt.status === "connected",
  );
}
