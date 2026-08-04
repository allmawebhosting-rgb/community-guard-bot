import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type OfficerRank = Database["public"]["Enums"]["officer_rank"];
export type OfficerStatus = Database["public"]["Enums"]["officer_status"];
export type DutyStatus = Database["public"]["Enums"]["duty_status"];
export type IncidentPriority = Database["public"]["Enums"]["incident_priority"];
export type OfficerProfile = Database["public"]["Tables"]["officer_profiles"]["Row"];
export type PoliceStation = Database["public"]["Tables"]["police_stations"]["Row"];
export type Incident = Database["public"]["Tables"]["reports"]["Row"];
export type CaseNote = Database["public"]["Tables"]["case_notes"]["Row"];
export type Dispatch = Database["public"]["Tables"]["dispatches"]["Row"];

// Extended types
export type DispatchStatus = Database["public"]["Enums"]["dispatch_status"];
export type DutyStatusValue = Database["public"]["Enums"]["duty_status"];
export type CommunityAlert = Database["public"]["Tables"]["community_alerts"]["Row"];
export type AuditEntry = Database["public"]["Tables"]["audit_log"]["Row"];
export type MissingPerson = Database["public"]["Tables"]["missing_persons"]["Row"];
export type LostFoundItem = Database["public"]["Tables"]["lost_found_items"]["Row"];
export type OfficerMessage = Database["public"]["Tables"]["officer_messages"]["Row"];
export type Evidence = Database["public"]["Tables"]["report_evidence"]["Row"];

export const RANKS: { value: OfficerRank; label: string; group: string }[] = [
  { value: "inspector_general", label: "Inspector General of Police", group: "National command" },
  { value: "deputy_inspector_general", label: "Deputy Inspector General", group: "National command" },
  { value: "director", label: "Director", group: "National command" },
  { value: "regional_commander", label: "Regional Police Commander", group: "Regional command" },
  { value: "district_commander", label: "District Police Commander", group: "Regional command" },
  { value: "division_commander", label: "Division Commander", group: "Regional command" },
  { value: "station_commander", label: "Station Commander (OC Station)", group: "Station command" },
  { value: "operations_officer", label: "Operations Officer", group: "Station command" },
  { value: "investigator", label: "Investigating Officer", group: "Field & investigations" },
  { value: "cid_officer", label: "CID Officer", group: "Field & investigations" },
  { value: "traffic_officer", label: "Traffic Officer", group: "Field & investigations" },
  { value: "patrol_officer", label: "Patrol Officer", group: "Field & investigations" },
  { value: "dispatch_officer", label: "Dispatch / Control Room Officer", group: "Control room" },
  { value: "call_centre_officer", label: "Call Centre Officer", group: "Control room" },
  { value: "community_liaison_officer", label: "Community Liaison Officer", group: "Support" },
  { value: "evidence_officer", label: "Evidence & Exhibits Officer", group: "Support" },
  { value: "read_only", label: "Read-only Analyst", group: "Support" },
  { value: "system_administrator", label: "System Administrator", group: "Administration" },
];

export const COMMAND_RANKS: OfficerRank[] = [
  "inspector_general",
  "deputy_inspector_general",
  "director",
  "regional_commander",
  "district_commander",
  "division_commander",
  "station_commander",
  "system_administrator",
];

export function rankLabel(rank: OfficerRank | null | undefined) {
  return RANKS.find((entry) => entry.value === rank)?.label ?? "Officer";
}

export function isCommandRank(rank: OfficerRank | null | undefined) {
  return !!rank && COMMAND_RANKS.includes(rank);
}

export const PRIORITY_META: Record<
  IncidentPriority,
  { label: string; dot: string; text: string; chip: string }
> = {
  critical: {
    label: "Critical",
    dot: "bg-primary",
    text: "text-primary",
    chip: "border-primary/45 bg-primary/12 text-primary",
  },
  high: {
    label: "High",
    dot: "bg-alert",
    text: "text-alert",
    chip: "border-alert/45 bg-alert/12 text-alert",
  },
  medium: {
    label: "Medium",
    dot: "bg-gold",
    text: "text-gold",
    chip: "border-gold/40 bg-gold/12 text-gold",
  },
  low: {
    label: "Low",
    dot: "bg-success",
    text: "text-success",
    chip: "border-success/40 bg-success/12 text-success",
  },
};

export const STATUS_FLOW = [
  "submitted",
  "under_review",
  "assigned",
  "dispatched",
  "resolved",
  "closed",
] as const;

export function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/* ── Dispatch & duty helpers ─────────────────────────────────────── */

export const DISPATCH_STATUS_FLOW: DispatchStatus[] = [
  "assigned",
  "notified",
  "en_route",
  "on_scene",
  "completed",
  "cancelled",
];

export const DUTY_STATUSES: { value: DutyStatusValue; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "on_duty", label: "On duty" },
  { value: "offline", label: "Offline" },
  { value: "on_leave", label: "On leave" },
];

export const DUTY_META: Record<string, { label: string; chip: string }> = {
  available:   { label: "Available",   chip: "border-success/40 bg-success/12 text-success" },
  on_duty:     { label: "On duty",     chip: "border-success/40 bg-success/12 text-success" },
  en_route:    { label: "En route",    chip: "border-gold/40 bg-gold/12 text-gold" },
  on_scene:    { label: "On scene",    chip: "border-alert/40 bg-alert/12 text-alert" },
  unavailable: { label: "Unavailable", chip: "border-border/50 bg-secondary/40 text-muted-foreground" },
  offline:     { label: "Offline",     chip: "border-border/50 bg-secondary/40 text-muted-foreground" },
  on_leave:    { label: "On leave",    chip: "border-gold/40 bg-gold/12 text-gold" },
};

export function dispatchStatusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function dutyStatusLabel(s: string) {
  return DUTY_STATUSES.find((d) => d.value === s)?.label ?? s;
}

/* ── queries ───────────────────────────────────────────────────────── */

export const myOfficerQuery = queryOptions({
  queryKey: ["officer", "me"],
  queryFn: async (): Promise<OfficerProfile | null> => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const { data, error } = await supabase
      .from("officer_profiles")
      .select("*")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
});

export const stationsQuery = queryOptions({
  queryKey: ["police", "stations"],
  queryFn: async (): Promise<PoliceStation[]> => {
    const { data, error } = await supabase
      .from("police_stations")
      .select("*")
      .order("district", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
});

export const incidentsQuery = queryOptions({
  queryKey: ["police", "incidents"],
  queryFn: async (): Promise<Incident[]> => {
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  },
});

export function incidentQuery(id: string) {
  return queryOptions({
    queryKey: ["police", "incident", id],
    queryFn: async (): Promise<Incident | null> => {
      const { data, error } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function caseNotesQuery(reportId: string) {
  return queryOptions({
    queryKey: ["police", "notes", reportId],
    queryFn: async (): Promise<CaseNote[]> => {
      const { data, error } = await supabase
        .from("case_notes")
        .select("*")
        .eq("report_id", reportId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export const officersQuery = queryOptions({
  queryKey: ["police", "officers"],
  queryFn: async (): Promise<OfficerProfile[]> => {
    const { data, error } = await supabase
      .from("officer_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

/** All active dispatches (for the dispatch board). */
export const dispatchesQuery = queryOptions({
  queryKey: ["police", "dispatches"],
  queryFn: async (): Promise<Dispatch[]> => {
    const { data, error } = await supabase
      .from("dispatches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  },
});

/** Dispatches for a single case, with officer join (for case detail). */
export function dispatchesForCaseQuery(reportId: string) {
  return queryOptions({
    queryKey: ["police", "dispatches", reportId],
    queryFn: async (): Promise<(Dispatch & { officer: OfficerProfile | null })[]> => {
      const { data, error } = await supabase
        .from("dispatches")
        .select("*, officer:officer_id(id, full_name, badge_number, rank, duty_status)")
        .eq("report_id", reportId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (Dispatch & { officer: OfficerProfile | null })[];
    },
  });
}

/** Dispatches for a single case, simple (no join — for CaseSidePanels). */
export function caseDispatchesQuery(reportId: string) {
  return queryOptions({
    queryKey: ["police", "dispatches", reportId],
    queryFn: async (): Promise<Dispatch[]> => {
      const { data, error } = await supabase
        .from("dispatches")
        .select("*")
        .eq("report_id", reportId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function evidenceQuery(reportId: string) {
  return queryOptions({
    queryKey: ["police", "evidence", reportId],
    queryFn: async (): Promise<Evidence[]> => {
      const { data, error } = await supabase
        .from("report_evidence")
        .select("*")
        .eq("report_id", reportId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export const missingPersonsQuery = queryOptions({
  queryKey: ["police", "missing"],
  queryFn: async (): Promise<MissingPerson[]> => {
    const { data, error } = await supabase
      .from("missing_persons")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

export const lostFoundQuery = queryOptions({
  queryKey: ["police", "lostfound"],
  queryFn: async (): Promise<LostFoundItem[]> => {
    const { data, error } = await supabase
      .from("lost_found_items")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

export const communityAlertsQuery = queryOptions({
  queryKey: ["police", "alerts"],
  queryFn: async (): Promise<CommunityAlert[]> => {
    const { data, error } = await supabase
      .from("community_alerts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

/** Alias for communityAlertsQuery — kept for backward compatibility. */
export const alertsAdminQuery = communityAlertsQuery;

export const officerMessagesQuery = queryOptions({
  queryKey: ["police", "comms"],
  queryFn: async (): Promise<OfficerMessage[]> => {
    const { data, error } = await supabase
      .from("officer_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  },
});

export function auditLogQuery(limit = 50) {
  return queryOptions({
    queryKey: ["police", "audit", limit],
    queryFn: async (): Promise<AuditEntry[]> => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export async function logAudit(action: string, entityType?: string, entityId?: string, details: Record<string, unknown> = {}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase.from("audit_log").insert({
    actor_id: auth.user.id,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    details: details as never,
  });
}
