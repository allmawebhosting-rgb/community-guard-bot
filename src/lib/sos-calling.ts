import { supabase } from "@/integrations/supabase/client";

export type SosCallTarget = {
  member_id: string;
  full_name: string;
  avatar_url: string | null;
  safety_role: string;
  priority: number;
  share_location_on_sos: boolean;
};

export type SosCallAttempt = {
  call_id: string;
  recipient_id: string;
  full_name: string;
  avatar_url: string | null;
  safety_role: string | null;
  status: string;
  created_at: string;
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
};

function friendly(message: string) {
  const clean = message.replace(/^.*?:\s*/, "").trim();
  return clean || "Something went wrong. Please try again.";
}

/** Members the signed-in user is allowed to call during their own SOS, in configured priority order. */
export async function listSosCallTargets(): Promise<SosCallTarget[]> {
  const { data, error } = await supabase.rpc("list_sos_call_targets");
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as SosCallTarget[];
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
  return attempts.find(
    (attempt) => attempt.connected_at !== null || attempt.status === "connected",
  );
}
