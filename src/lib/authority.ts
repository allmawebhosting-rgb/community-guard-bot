import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AuthorityType =
  | "POLICE"
  | "AMBULANCE"
  | "FIRE"
  | "HEALTH"
  | "LOCAL_AUTHORITY"
  | "COMMUNITY_LEADER"
  | "OTHER_AUTHORIZED_SERVICE";

export type AuthorityAvailability = "available" | "limited" | "unavailable" | "unknown";
export type NotificationStatus =
  | "preparing"
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "acknowledged"
  | "rejected"
  | "failed"
  | "pending"
  | "unknown";

export type AuthorityRecord = {
  id: string;
  organization: string;
  authority_type: AuthorityType;
  region: string | null;
  district: string | null;
  town: string | null;
  station: string | null;
  contact_method: string | null;
  emergency_number: string | null;
  email: string | null;
  availability: AuthorityAvailability;
  verification_status: string;
  is_demo: boolean;
};

export type AuthorityNotification = {
  id: string;
  report_id: string;
  authority_id: string | null;
  authority_type: AuthorityType;
  method: string;
  status: NotificationStatus;
  is_demo: boolean;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

export const AUTHORITY_TYPES: { value: AuthorityType; label: string; description: string }[] = [
  { value: "POLICE", label: "Police", description: "Crime, active threats and public safety" },
  { value: "AMBULANCE", label: "Ambulance", description: "Urgent medical transport and response" },
  { value: "FIRE", label: "Fire & rescue", description: "Fire, rescue and trapped-person incidents" },
  { value: "HEALTH", label: "Health facility", description: "Configured hospitals and clinics" },
  { value: "LOCAL_AUTHORITY", label: "Local authority", description: "Configured non-critical community issues" },
  { value: "COMMUNITY_LEADER", label: "Community leader", description: "Authorized local leadership" },
  { value: "OTHER_AUTHORIZED_SERVICE", label: "Other service", description: "A configured authorized organization" },
];

export const NOTIFICATION_STATES: { value: NotificationStatus; label: string }[] = [
  { value: "preparing", label: "Preparing" },
  { value: "queued", label: "Queued" },
  { value: "sending", label: "Sending" },
  { value: "sent", label: "Sent" },
  { value: "delivered", label: "Delivered" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
  { value: "unknown", label: "Unknown" },
];

const DEMO_AUTHORITIES: AuthorityRecord[] = [
  {
    id: "demo-police",
    organization: "DEMO Police Authority",
    authority_type: "POLICE",
    region: "Eastern",
    district: "Jinja",
    town: "Jinja",
    station: "DEMO station profile",
    contact_method: null,
    emergency_number: null,
    email: null,
    availability: "unknown",
    verification_status: "unverified",
    is_demo: true,
  },
  {
    id: "demo-medical",
    organization: "DEMO Medical Response",
    authority_type: "AMBULANCE",
    region: "Eastern",
    district: "Jinja",
    town: "Jinja",
    station: "DEMO dispatch profile",
    contact_method: null,
    emergency_number: null,
    email: null,
    availability: "unknown",
    verification_status: "unverified",
    is_demo: true,
  },
  {
    id: "demo-local",
    organization: "DEMO Local Authority",
    authority_type: "LOCAL_AUTHORITY",
    region: "Eastern",
    district: "Jinja",
    town: "Jinja",
    station: null,
    contact_method: null,
    emergency_number: null,
    email: null,
    availability: "unknown",
    verification_status: "unverified",
    is_demo: true,
  },
];

// The Phase 5 tables may not be applied in a preview database yet. Returning an
// empty set keeps the workspace honest and lets operators see the configuration
// boundary instead of turning a missing integration into a fake success.
export const authorityDirectoryQuery = queryOptions({
  queryKey: ["police", "authority-directory"],
  queryFn: async (): Promise<AuthorityRecord[]> => {
    const { data, error } = await supabase
      .from("authority_directory" as never)
      .select("*")
      .order("organization", { ascending: true });
    if (error) return [];
    return (data ?? []) as AuthorityRecord[];
  },
});

export const authorityNotificationsQuery = queryOptions({
  queryKey: ["police", "authority-notifications"],
  queryFn: async (): Promise<AuthorityNotification[]> => {
    const { data, error } = await supabase
      .from("authority_notifications" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return [];
    return (data ?? []) as AuthorityNotification[];
  },
});

export function demoAuthorities() {
  return DEMO_AUTHORITIES;
}

export function authorityLabel(type: AuthorityType) {
  return AUTHORITY_TYPES.find((entry) => entry.value === type)?.label ?? "Authorized service";
}

export function recommendAuthority(category: string | null, priority: string) {
  const value = `${category ?? ""} ${priority}`.toLowerCase();
  if (value.includes("fire") || value.includes("trapped")) return "FIRE" as AuthorityType;
  if (value.includes("medical") || value.includes("injur") || value.includes("collapse")) return "AMBULANCE" as AuthorityType;
  if (value.includes("flood") || value.includes("road") || value.includes("dispute")) return "LOCAL_AUTHORITY" as AuthorityType;
  return "POLICE" as AuthorityType;
}

export function notificationStatusLabel(status: string) {
  return NOTIFICATION_STATES.find((entry) => entry.value === status)?.label ?? status;
}
