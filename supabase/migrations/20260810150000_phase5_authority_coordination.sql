-- Phase 5: official authority coordination boundaries.
-- These tables store configured authority metadata and auditable notification
-- attempts. They do not create or imply a connection to any government system.

create table if not exists public.authority_directory (
  id uuid primary key default gen_random_uuid(),
  organization text not null,
  authority_type text not null check (authority_type in (
    'POLICE','AMBULANCE','FIRE','HEALTH','LOCAL_AUTHORITY',
    'COMMUNITY_LEADER','OTHER_AUTHORIZED_SERVICE'
  )),
  region text,
  district text,
  county text,
  sub_county text,
  town text,
  parish text,
  village text,
  station text,
  contact_method text check (contact_method in ('api','dispatch','portal','email','sms','phone','manual')),
  emergency_number text,
  dispatch_contact text,
  email text,
  api_endpoint text,
  operating_hours text,
  availability text not null default 'unknown' check (availability in ('available','limited','unavailable','unknown')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending','verified','suspended')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.authority_notifications (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  authority_id uuid references public.authority_directory(id) on delete set null,
  authority_type text not null,
  method text not null check (method in ('api','dispatch','portal','email','sms','phone','manual_operator')),
  status text not null default 'preparing' check (status in (
    'preparing','queued','sending','sent','delivered','acknowledged',
    'rejected','failed','pending','unknown'
  )),
  is_demo boolean not null default false,
  reason text,
  provider_reference text,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.authority_escalations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  from_level text,
  to_level text not null,
  reason text not null,
  status text not null default 'requested' check (status in ('recommended','requested','confirmed','rejected','failed')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists authority_directory_scope_idx
  on public.authority_directory (authority_type, region, district, verification_status);
create index if not exists authority_notifications_report_idx
  on public.authority_notifications (report_id, created_at desc);
create index if not exists authority_escalations_report_idx
  on public.authority_escalations (report_id, created_at desc);

alter table public.authority_directory enable row level security;
alter table public.authority_notifications enable row level security;
alter table public.authority_escalations enable row level security;

create policy "command staff can view authority directory"
  on public.authority_directory for select to authenticated
  using (public.is_command_staff(auth.uid()));

create policy "command staff can manage authority directory"
  on public.authority_directory for all to authenticated
  using (public.is_command_staff(auth.uid()))
  with check (public.is_command_staff(auth.uid()));

create policy "command staff can view authority notifications"
  on public.authority_notifications for select to authenticated
  using (public.is_command_staff(auth.uid()));

create policy "command staff can create authority notifications"
  on public.authority_notifications for insert to authenticated
  with check (public.is_command_staff(auth.uid()) and created_by = auth.uid());

create policy "command staff can update authority notifications"
  on public.authority_notifications for update to authenticated
  using (public.is_command_staff(auth.uid()))
  with check (public.is_command_staff(auth.uid()));

create policy "command staff can view authority escalations"
  on public.authority_escalations for select to authenticated
  using (public.is_command_staff(auth.uid()));

create policy "command staff can create authority escalations"
  on public.authority_escalations for insert to authenticated
  with check (public.is_command_staff(auth.uid()) and created_by = auth.uid());
