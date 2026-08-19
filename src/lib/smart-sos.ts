import { supabase } from "@/integrations/supabase/client";

/**
 * Smart SOS intelligence — privacy-preserving emergency detection layer.
 *
 * This module NEVER activates SOS on its own. It scores authorized device
 * signals, records an auditable safety check and asks the server whether
 * automatic escalation is permitted for this user. The actual emergency
 * response is always handed to the existing SOS system (/sos).
 */

export type SmartSosSettings = {
  enabled: boolean;
  inactivity_seconds: number;
  grace_seconds: number;
  motion_detection: boolean;
  audio_detection: boolean;
  auto_escalation: boolean;
};

export const DEFAULT_SMART_SOS_SETTINGS: SmartSosSettings = {
  enabled: false,
  inactivity_seconds: 15,
  grace_seconds: 20,
  motion_detection: false,
  audio_detection: false,
  auto_escalation: true,
};

export type SignalKey =
  | "prolonged_inactivity"
  | "no_response_to_check"
  | "sudden_motion"
  | "fall_like_motion"
  | "motion_then_stillness"
  | "loud_impact"
  | "possible_distress_sound"
  | "repeated_failed_interaction";

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  prolonged_inactivity: "No interaction for a while",
  no_response_to_check: "No response to the safety check",
  sudden_motion: "Sudden device movement",
  fall_like_motion: "Fall-like movement",
  motion_then_stillness: "Movement followed by stillness",
  loud_impact: "Loud impact-like sound",
  possible_distress_sound: "Possible call for help",
  repeated_failed_interaction: "Repeated interrupted interaction",
};

/** No single signal can reach the high threshold on its own. */
const SIGNAL_WEIGHTS: Record<SignalKey, number> = {
  prolonged_inactivity: 1,
  no_response_to_check: 2,
  sudden_motion: 1,
  fall_like_motion: 2,
  motion_then_stillness: 2,
  loud_impact: 2,
  possible_distress_sound: 2,
  repeated_failed_interaction: 1,
};

export type Confidence = "low" | "medium" | "high";

export function scoreSignals(signals: SignalKey[]): { score: number; confidence: Confidence } {
  const unique = Array.from(new Set(signals));
  const score = unique.reduce((total, key) => total + (SIGNAL_WEIGHTS[key] ?? 0), 0);
  // High confidence always needs corroboration from more than one signal.
  const confidence: Confidence =
    score >= 4 && unique.length >= 2 ? "high" : score >= 2 ? "medium" : "low";
  return { score, confidence };
}

export function confidenceCopy(confidence: Confidence) {
  if (confidence === "high") {
    return {
      title: "Possible emergency detected",
      body: "Allma noticed several safety signals. Confirm you are safe or get help now.",
    };
  }
  if (confidence === "medium") {
    return {
      title: "Possible emergency",
      body: "We haven't detected activity from you and noticed another safety signal.",
    };
  }
  return {
    title: "Are you okay?",
    body: "We haven't detected activity from you for a moment. This is only a check-in.",
  };
}

type LooseClient = {
  from: (table: string) => any;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const db = supabase as unknown as LooseClient;

export async function loadSmartSosSettings(userId: string): Promise<SmartSosSettings> {
  const { data } = await db
    .from("smart_sos_settings")
    .select("enabled, inactivity_seconds, grace_seconds, motion_detection, audio_detection, auto_escalation")
    .eq("user_id", userId)
    .maybeSingle();
  return { ...DEFAULT_SMART_SOS_SETTINGS, ...((data ?? {}) as Partial<SmartSosSettings>) };
}

export async function saveSmartSosSettings(userId: string, patch: Partial<SmartSosSettings>) {
  const { error } = await db.from("smart_sos_settings").upsert(
    { user_id: userId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  return error ?? null;
}

export type SmartSosCheck = {
  id: string;
  confidence: Confidence;
  status: string;
  created_at: string;
};

export async function openSafetyCheck(
  userId: string,
  signals: SignalKey[],
  confidence: Confidence,
): Promise<string | null> {
  const { data, error } = await db
    .from("smart_sos_checks")
    .insert({ user_id: userId, confidence, signals: { detected: signals } })
    .select("id")
    .single();
  if (error) {
    console.error("Failed to open safety check", error);
    return null;
  }
  const id = (data as { id: string } | null)?.id ?? null;
  if (id) await logCheckEvent(id, "safety_check_initiated", { signals, confidence });
  return id;
}

export async function logCheckEvent(
  checkId: string,
  action: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await db
    .from("smart_sos_check_events")
    .insert({ check_id: checkId, action, metadata });
  if (error) console.error("Failed to record safety check event", error);
}

export async function resolveSafetyCheck(
  checkId: string,
  status: "safe" | "help_requested" | "expired" | "cancelled",
  metadata: Record<string, unknown> = {},
) {
  const { error } = await db.rpc("resolve_smart_sos_check", {
    _check_id: checkId,
    _status: status,
    _metadata: metadata,
  });
  if (error) console.error("Failed to resolve safety check", error);
}

/** Server-side authorization gate for automatic SOS activation. */
export async function requestAutoEscalation(
  checkId: string,
  confidence: Confidence,
  signals: SignalKey[],
): Promise<{ allowed: boolean; reason: string }> {
  const { data, error } = await db.rpc("escalate_smart_sos_check", {
    _check_id: checkId,
    _confidence: confidence,
    _signals: { detected: signals },
  });
  if (error) {
    console.error("Auto escalation request failed", error);
    return { allowed: false, reason: "request_failed" };
  }
  return (data as { allowed: boolean; reason: string } | null) ?? {
    allowed: false,
    reason: "request_failed",
  };
}

export async function listCheckAudit(checkId: string) {
  const { data } = await db
    .from("smart_sos_check_events")
    .select("action, metadata, created_at")
    .eq("check_id", checkId)
    .order("created_at", { ascending: true });
  return (data ?? []) as { action: string; metadata: Record<string, unknown>; created_at: string }[];
}

export async function listRecentChecks(userId: string, limit = 5) {
  const { data } = await db
    .from("smart_sos_checks")
    .select("id, confidence, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as SmartSosCheck[];
}

export const AUDIT_LABELS: Record<string, string> = {
  session_started: "App opened",
  inactivity_detected: "Inactivity detected",
  safety_check_initiated: "Safety check initiated",
  signals_updated: "Additional safety signals detected",
  no_user_response: "No user response",
  resolved_safe: "User confirmed safe",
  resolved_help_requested: "User requested help",
  resolved_expired: "Safety check expired",
  resolved_cancelled: "Safety check cancelled",
  auto_sos_authorized: "Automatic SOS authorized",
  auto_sos_blocked: "Automatic SOS not permitted by settings",
  monitoring_unavailable: "Detection method unavailable",
};
