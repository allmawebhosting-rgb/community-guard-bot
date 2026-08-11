-- Phase 4: opt-in Community Responder Network.
-- Exact responder locations are never exposed through public selects. Matching
-- and assignment fan-out should be performed by trusted server functions.

create table if not exists public.community_responders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  photo_url text,
  phone text,
  phone_verification_status text not null default 'pending'
    check (phone_verification_status in ('pending','verified')),
  preferred_language text not null default 'English',
  area_of_operation text,
  country text not null default 'Uganda',
  region text,
  district text,
  county text,
  sub_county text,
  town text,
  parish text,
  village text,
  responder_type text not null default 'community_volunteer'
    check (responder_type in (
      'community_volunteer','first_aid_responder','medical_professional',
      'fire_safety_volunteer','search_rescue_volunteer','transport_assistance',
      'child_safety_volunteer','community_leader','other'
    )),
  responder_level text not null default 'citizen_helper'
    check (responder_level in (
      'citizen_helper','community_responder','verified_responder',
      'specialist_responder','authorized_responder'
    )),
  verification_status text not null default 'unverified'
    check (verification_status in (
      'unverified','basic_verified','skill_verified',
      'organization_verified','authorized_responder'
    )),
  availability_status text not null default 'offline'
    check (availability_status in ('available','busy','handling_emergency','unavailable','offline')),
  availability_until timestamptz,
  service_radius_m integer not null default 2000 check (service_radius_m between 500 and 10000),
  emergency_permissions boolean not null default false,
  opted_in boolean not null default false,
  location_permission_granted boolean not null default false,
  safety_acknowledged boolean not null default false,
  active_response_count integer not null default 0 check (active_response_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.responder_skills (
  id uuid primary key default gen_random_uuid(),
  responder_id uuid not null references public.community_responders(id) on delete cascade,
  skill text not null,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','pending','verified')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (responder_id, skill)
);

create table if not exists public.responder_locations (
  id uuid primary key default gen_random_uuid(),
  responder_id uuid not null references public.community_responders(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy double precision,
  recorded_at timestamptz not null default now(),
  is_current boolean not null default true
);

create table if not exists public.responder_notifications (
  id uuid primary key default gen_random_uuid(),
  sos_session_id uuid,
  responder_id uuid not null references public.community_responders(id) on delete cascade,
  notification_status text not null default 'pending'
    check (notification_status in ('pending','sent','delivered','viewed','accepted','declined','expired','cancelled')),
  emergency_category text not null default 'other',
  severity text not null default 'medium',
  approximate_distance_m numeric,
  area text,
  minimal_summary text,
  decline_reason text,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (sos_session_id, responder_id)
);

create table if not exists public.responder_reports (
  id uuid primary key default gen_random_uuid(),
  responder_id uuid not null references public.community_responders(id) on delete cascade,
  sos_session_id uuid,
  report_type text not null check (report_type in ('unsafe_situation','abuse','false_emergency','citizen','responder','other')),
  description text,
  created_at timestamptz not null default now()
);

alter table public.responder_assignments
  add column if not exists responder_profile_id uuid references public.community_responders(id) on delete set null;
alter table public.responder_assignments
  add column if not exists match_score numeric;
alter table public.responder_assignments
  add column if not exists en_route_at timestamptz;
alter table public.responder_assignments
  add column if not exists unable_at timestamptz;
alter table public.responder_assignments
  add column if not exists response_outcome text;
alter table public.responder_assignments
  add column if not exists updated_at timestamptz not null default now();

create index if not exists community_responders_matching_idx
  on public.community_responders (availability_status, opted_in, service_radius_m);
create index if not exists responder_locations_freshness_idx
  on public.responder_locations (responder_id, recorded_at desc)
  where is_current;
create index if not exists responder_notifications_inbox_idx
  on public.responder_notifications (responder_id, created_at desc);

grant select, insert, update on public.community_responders to authenticated;
grant all on public.community_responders to service_role;
grant select, insert, update, delete on public.responder_skills to authenticated;
grant all on public.responder_skills to service_role;
grant insert, update on public.responder_locations to authenticated;
grant all on public.responder_locations to service_role;
grant select on public.responder_notifications to authenticated;
grant all on public.responder_notifications to service_role;
grant insert on public.responder_reports to authenticated;
grant all on public.responder_reports to service_role;

alter table public.community_responders enable row level security;
alter table public.responder_skills enable row level security;
alter table public.responder_locations enable row level security;
alter table public.responder_notifications enable row level security;
alter table public.responder_reports enable row level security;

create policy "responders can view own profile"
  on public.community_responders for select to authenticated
  using (auth.uid() = user_id);
create policy "users can create own responder profile"
  on public.community_responders for insert to authenticated
  with check (auth.uid() = user_id);
create policy "responders can update own profile"
  on public.community_responders for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "responders can view own skills"
  on public.responder_skills for select to authenticated
  using (exists (
    select 1 from public.community_responders r
    where r.id = responder_id and r.user_id = auth.uid()
  ));
create policy "responders can manage own skills"
  on public.responder_skills for all to authenticated
  using (exists (
    select 1 from public.community_responders r
    where r.id = responder_id and r.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.community_responders r
    where r.id = responder_id and r.user_id = auth.uid()
  ));

-- Location rows are writable by the owner but not selectable by responders.
-- The matching worker should use a service role or a controlled security
-- definer function and return only approximate distance.
create policy "responders can write own location"
  on public.responder_locations for insert to authenticated
  with check (exists (
    select 1 from public.community_responders r
    where r.id = responder_id and r.user_id = auth.uid()
  ));
create policy "responders can update own location"
  on public.responder_locations for update to authenticated
  using (exists (
    select 1 from public.community_responders r
    where r.id = responder_id and r.user_id = auth.uid()
  ));

create policy "responders can view own notifications"
  on public.responder_notifications for select to authenticated
  using (exists (
    select 1 from public.community_responders r
    where r.id = responder_id and r.user_id = auth.uid()
  ));
create policy "responders can create own reports"
  on public.responder_reports for insert to authenticated
  with check (exists (
    select 1 from public.community_responders r
    where r.id = responder_id and r.user_id = auth.uid()
  ));

create or replace function public.update_responder_assignment(
  p_assignment_id uuid,
  p_next_status text,
  p_reason text default null
)
returns public.responder_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.responder_assignments;
  v_profile_id uuid;
begin
  select r.id into v_profile_id
  from public.community_responders r
  where r.user_id = auth.uid();

  if v_profile_id is null then
    raise exception 'Responder profile not found';
  end if;

  update public.responder_assignments
  set status = p_next_status,
      notes = coalesce(p_reason, notes),
      accepted_at = case when p_next_status = 'accepted' then coalesce(accepted_at, now()) else accepted_at end,
      en_route_at = case when p_next_status = 'en_route' then coalesce(en_route_at, now()) else en_route_at end,
      arrived_at = case when p_next_status = 'arrived' then coalesce(arrived_at, now()) else arrived_at end,
      completed_at = case when p_next_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
      unable_at = case when p_next_status = 'unable_to_continue' then coalesce(unable_at, now()) else unable_at end,
      response_outcome = case when p_next_status in ('completed','unable_to_continue','need_official_help') then p_reason else response_outcome end,
      updated_at = now()
  where id = p_assignment_id and responder_profile_id = v_profile_id
  returning * into v_assignment;

  if v_assignment.id is null then
    raise exception 'Assignment not found or not authorized';
  end if;

  return v_assignment;
end;
$$;

revoke all on function public.update_responder_assignment(uuid, text, text) from public;
grant execute on function public.update_responder_assignment(uuid, text, text) to authenticated;

create or replace function public.respond_to_responder_notification(
  p_notification_id uuid,
  p_accept boolean,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.community_responders;
  v_notification public.responder_notifications;
  v_assignment_id uuid;
begin
  select * into v_profile
  from public.community_responders
  where user_id = auth.uid();

  if v_profile.id is null then
    raise exception 'Responder profile not found';
  end if;

  select * into v_notification
  from public.responder_notifications
  where id = p_notification_id and responder_id = v_profile.id
  for update;

  if v_notification.id is null then
    raise exception 'Notification not found or not authorized';
  end if;

  if v_notification.notification_status not in ('pending','sent','delivered','viewed') then
    raise exception 'This request is no longer available';
  end if;

  update public.responder_notifications
  set notification_status = case when p_accept then 'accepted' else 'declined' end,
      decline_reason = case when p_accept then null else p_reason end,
      responded_at = now()
  where id = v_notification.id;

  if p_accept then
    if v_profile.availability_status not in ('available','busy') then
      raise exception 'Set your status to Available before accepting';
    end if;

    insert into public.responder_assignments (
      sos_session_id, responder_id, responder_profile_id, assignment_type,
      status, distance, assigned_at, accepted_at
    )
    values (
      v_notification.sos_session_id, auth.uid(), v_profile.id, 'community_responder',
      'accepted', v_notification.approximate_distance_m, now(), now()
    )
    returning id into v_assignment_id;

    update public.community_responders
    set availability_status = 'handling_emergency',
        active_response_count = active_response_count + 1,
        updated_at = now()
    where id = v_profile.id;
  end if;

  return v_assignment_id;
end;
$$;

revoke all on function public.respond_to_responder_notification(uuid, boolean, text) from public;
grant execute on function public.respond_to_responder_notification(uuid, boolean, text) to authenticated;