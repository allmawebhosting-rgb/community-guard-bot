import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HierarchyNode = {
  id: string;
  parent_id: string | null;
  node_type: string;
  name: string;
  code: string | null;
  country: string | null;
  region: string | null;
  district: string | null;
  is_active: boolean;
};

export type InstitutionalOrganization = {
  id: string;
  name: string;
  organization_type: string;
  status: string;
  verification_status: string;
  jurisdiction_node_id: string | null;
};

export type MajorIncident = {
  id: string;
  reference: string;
  title: string;
  status: string;
  priority: string;
  scope_level: string;
  situation_summary: string | null;
  is_demo: boolean;
  created_at: string;
};

export type InstitutionalSystemStatus = {
  id: string;
  service_key: string;
  display_name: string;
  status: string;
  environment: string;
  detail: string | null;
  checked_at: string | null;
};

export type HandoverAcceptance = {
  id: string;
  institution: string;
  acceptance_status: string;
  acceptance_date: string | null;
  system_version: string | null;
  scope: string | null;
  outstanding_issues: string | null;
};

async function selectRows<T>(table: string, select = "*"): Promise<T[]> {
  const { data, error } = await supabase
    .from(table as never)
    .select(select)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as T[];
}

export const hierarchyNodesQuery = queryOptions({
  queryKey: ["institutional", "hierarchy"],
  queryFn: () => selectRows<HierarchyNode>("institutional_hierarchy_nodes"),
});

export const organizationsQuery = queryOptions({
  queryKey: ["institutional", "organizations"],
  queryFn: () => selectRows<InstitutionalOrganization>("institutional_organizations"),
});

export const majorIncidentsQuery = queryOptions({
  queryKey: ["institutional", "major-incidents"],
  queryFn: () => selectRows<MajorIncident>("major_incidents"),
});

export const systemStatusQuery = queryOptions({
  queryKey: ["institutional", "system-status"],
  queryFn: () => selectRows<InstitutionalSystemStatus>("institutional_system_status"),
});

export const handoverQuery = queryOptions({
  queryKey: ["institutional", "handover"],
  queryFn: () => selectRows<HandoverAcceptance>("institutional_handover_acceptance"),
});

export function institutionalTableUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("does not exist") || message.includes("schema cache") || message.includes("relation");
}