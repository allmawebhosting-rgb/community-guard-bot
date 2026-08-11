-- Phase 10: institutional infrastructure foundations.
--
-- These structures make the national, regional, district and station layers
-- configurable. They do not create a government integration or authorize an
-- operator; existing command-staff RLS remains the gate for this workspace.

create table if not exists public.institutional_hierarchy_nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.institutional_hierarchy_nodes(id) on delete set null,
  node_type text not null check (node_type in (
    'country','region','district','county','sub_county','parish',
    'community','police_station','emergency_response_point'
  )),
  name text not null,
  code text,
  country text,
  region text,
  district text,
  county text,
  sub_county text,
  parish text,
  community text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_id, node_type, name)
);

create table if not exists public.institutional_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization_type text not null,
  status text not null default 'pending' check (status in ('pending','active','suspended','deactivated')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending','verified','rejected')),
  jurisdiction_node_id uuid references public.institutional_hierarchy_nodes(id) on delete set null,
  contact_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.institutional_organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.institutional_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  status text not null default 'pending' check (status in ('pending','active','suspended','removed')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending','verified','rejected')),
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.major_incidents (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  title text not null,
  status text not null default 'proposed' check (status in ('proposed','active','contained','resolved','closed')),
  priority text not null default 'high' check (priority in ('critical','high','medium','low')),
  scope_level text not null default 'national' check (scope_level in ('national','regional','district','station')),
  situation_summary text,
  affected_people integer,
  affected_locations integer,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  incident_commander_id uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.institutional_system_status (
  id uuid primary key default gen_random_uuid(),
  service_key text not null unique,
  display_name text not null,
  status text not null default 'unknown' check (status in ('operational','degraded','outage','unknown','not_configured')),
  environment text not null default 'production' check (environment in ('production','staging','demo')),
  detail text,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.institutional_handover_acceptance (
  id uuid primary key default gen_random_uuid(),
  institution text not null,
  authorized_representative text,
  technical_representative text,
  operational_representative text,
  acceptance_date date,
  system_version text,
  scope text,
  outstanding_issues text,
  acceptance_status text not null default 'draft' check (acceptance_status in ('draft','in_review','accepted','rejected')),
  digital_signature_supported boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists institutional_nodes_parent_idx
  on public.institutional_hierarchy_nodes(parent_id, node_type, is_active);
create index if not exists institutional_nodes_scope_idx
  on public.institutional_hierarchy_nodes(country, region, district, is_active);
create index if not exists institutional_orgs_jurisdiction_idx
  on public.institutional_organizations(jurisdiction_node_id, status, verification_status);
create index if not exists institutional_members_user_idx
  on public.institutional_organization_members(user_id, status);
create index if not exists major_incidents_status_idx
  on public.major_incidents(status, priority, created_at desc);

grant select, insert, update, delete on public.institutional_hierarchy_nodes to authenticated;
grant all on public.institutional_hierarchy_nodes to service_role;
grant select, insert, update, delete on public.institutional_organizations to authenticated;
grant all on public.institutional_organizations to service_role;
grant select, insert, update, delete on public.institutional_organization_members to authenticated;
grant all on public.institutional_organization_members to service_role;
grant select, insert, update, delete on public.major_incidents to authenticated;
grant all on public.major_incidents to service_role;
grant select, insert, update, delete on public.institutional_system_status to authenticated;
grant all on public.institutional_system_status to service_role;
grant select, insert, update, delete on public.institutional_handover_acceptance to authenticated;
grant all on public.institutional_handover_acceptance to service_role;

alter table public.institutional_hierarchy_nodes enable row level security;
alter table public.institutional_organizations enable row level security;
alter table public.institutional_organization_members enable row level security;
alter table public.major_incidents enable row level security;
alter table public.institutional_system_status enable row level security;
alter table public.institutional_handover_acceptance enable row level security;

create policy "command staff can view institutional hierarchy"
  on public.institutional_hierarchy_nodes for select to authenticated
  using (public.is_command_staff(auth.uid()));
create policy "command staff can manage institutional hierarchy"
  on public.institutional_hierarchy_nodes for all to authenticated
  using (public.is_command_staff(auth.uid()))
  with check (public.is_command_staff(auth.uid()));

create policy "command staff can view organizations"
  on public.institutional_organizations for select to authenticated
  using (public.is_command_staff(auth.uid()));
create policy "command staff can manage organizations"
  on public.institutional_organizations for all to authenticated
  using (public.is_command_staff(auth.uid()))
  with check (public.is_command_staff(auth.uid()));

create policy "command staff can view organization members"
  on public.institutional_organization_members for select to authenticated
  using (public.is_command_staff(auth.uid()));
create policy "command staff can manage organization members"
  on public.institutional_organization_members for all to authenticated
  using (public.is_command_staff(auth.uid()))
  with check (public.is_command_staff(auth.uid()));

create policy "command staff can view major incidents"
  on public.major_incidents for select to authenticated
  using (public.is_command_staff(auth.uid()));
create policy "command staff can manage major incidents"
  on public.major_incidents for all to authenticated
  using (public.is_command_staff(auth.uid()))
  with check (public.is_command_staff(auth.uid()));

create policy "command staff can view system status"
  on public.institutional_system_status for select to authenticated
  using (public.is_command_staff(auth.uid()));
create policy "command staff can manage system status"
  on public.institutional_system_status for all to authenticated
  using (public.is_command_staff(auth.uid()))
  with check (public.is_command_staff(auth.uid()));

create policy "command staff can view handover records"
  on public.institutional_handover_acceptance for select to authenticated
  using (public.is_command_staff(auth.uid()));
create policy "command staff can manage handover records"
  on public.institutional_handover_acceptance for all to authenticated
  using (public.is_command_staff(auth.uid()))
  with check (public.is_command_staff(auth.uid()));