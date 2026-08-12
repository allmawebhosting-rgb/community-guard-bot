import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/phone";

export type MemberMatch = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  phone_verified: boolean;
  relationship_state: "none" | "connected" | "request_sent" | "request_received";
};

export type SafetyConnection = {
  id: string;
  member_id: string;
  full_name: string;
  avatar_url: string | null;
  phone_verified: boolean;
  safety_role: string;
  priority: number;
  notify_on_sos: boolean;
  share_location_on_sos: boolean;
  allow_emergency_calls: boolean;
  created_at: string;
};

export type SafetyRequest = {
  id: string;
  direction: "incoming" | "outgoing";
  other_user_id: string;
  full_name: string;
  avatar_url: string | null;
  phone_verified: boolean;
  note: string | null;
  created_at: string;
};

export const SAFETY_ROLES = [
  "Family",
  "Friend",
  "Neighbour",
  "Partner",
  "Community helper",
  "First aider",
] as const;

export type SafetyPermissions = {
  notify_on_sos: boolean;
  share_location_on_sos: boolean;
  allow_emergency_calls: boolean;
};

export const DEFAULT_PERMISSIONS: SafetyPermissions = {
  notify_on_sos: true,
  share_location_on_sos: true,
  allow_emergency_calls: true,
};

function friendly(message: string) {
  const clean = message.replace(/^.*?:\s*/, "").trim();
  return clean || "Something went wrong. Please try again.";
}

export async function searchMemberByPhone(rawPhone: string): Promise<MemberMatch | null> {
  const normalized = normalizePhone(rawPhone);
  if (!normalized) throw new Error("Enter a valid phone number");

  const { data, error } = await supabase.rpc("find_allma_member_by_phone", {
    _phone: normalized,
  });
  if (error) throw new Error(friendly(error.message));
  const match = data?.[0];
  return match ? (match as MemberMatch) : null;
}

export async function sendConnectionRequest(recipientId: string, note?: string) {
  const { data, error } = await supabase.rpc("send_safety_connection_request", {
    _recipient_id: recipientId,
    _note: note ?? undefined,
  });
  if (error) throw new Error(friendly(error.message));
  return data as string;
}

export async function respondToRequest(
  requestId: string,
  action: "accept" | "decline" | "cancel" | "block",
) {
  const { data, error } = await supabase.rpc("respond_to_safety_connection_request", {
    _request_id: requestId,
    _action: action,
  });
  if (error) throw new Error(friendly(error.message));
  return data as string;
}

export async function listConnections(): Promise<SafetyConnection[]> {
  const { data, error } = await supabase.rpc("list_safety_connections");
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as SafetyConnection[];
}

export async function listRequests(): Promise<SafetyRequest[]> {
  const { data, error } = await supabase.rpc("list_safety_connection_requests");
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as SafetyRequest[];
}

export async function updateConnection(
  id: string,
  values: Partial<SafetyPermissions & { safety_role: string; priority: number }>,
) {
  const { error } = await supabase.from("safety_connections").update(values).eq("id", id);
  if (error) throw new Error(friendly(error.message));
}

export async function removeConnection(id: string) {
  const { error } = await supabase.from("safety_connections").delete().eq("id", id);
  if (error) throw new Error(friendly(error.message));
}

export function inviteMessage(origin: string) {
  return `I'm using Allma Safety AI to stay safe. Join my safety network: ${origin}`;
}
