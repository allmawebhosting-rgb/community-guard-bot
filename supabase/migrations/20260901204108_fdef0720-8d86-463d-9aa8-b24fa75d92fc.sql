create or replace function public.can_access_sos_room(_sos_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.safety_activity a
    where a.id = _sos_id and a.user_id = _user_id
  ) or exists (
    select 1 from public.emergency_call_invitations i
    where i.emergency_id = _sos_id and i.recipient_user_id = _user_id
  ) or exists (
    select 1 from public.emergency_calls c
    where c.sos_session_id = _sos_id and c.recipient_id = _user_id
  ) or exists (
    select 1 from public.sos_responder_offers o
    where o.sos_activity_id = _sos_id and o.responder_id = _user_id
  )
$$;

alter table public.emergency_chat_events enable row level security;
drop policy if exists "participants can view emergency chat" on public.emergency_chat_events;
drop policy if exists "room members view emergency chat" on public.emergency_chat_events;
drop policy if exists "room members post emergency chat" on public.emergency_chat_events;

create policy "room members view emergency chat"
on public.emergency_chat_events
for select
to authenticated
using (public.can_access_sos_room(sos_session_id, auth.uid()));

create policy "room members post emergency chat"
on public.emergency_chat_events
for insert
to authenticated
with check (
  author_id = auth.uid()
  and event_type = 'message'
  and sos_session_id is not null
  and public.can_access_sos_room(sos_session_id, auth.uid())
);

grant select, insert on public.emergency_chat_events to authenticated;
grant all on public.emergency_chat_events to service_role;

create or replace function public.list_sos_rooms()
returns table (
  sos_activity_id uuid,
  owner_id uuid,
  sender_name text,
  sender_avatar_url text,
  emergency_type text,
  severity text,
  area text,
  created_at timestamptz,
  is_mine boolean,
  my_invitation_status text,
  my_call_session_id uuid,
  distance_m double precision,
  location_shared boolean,
  last_message_at timestamptz,
  message_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.user_id,
    coalesce(p.full_name, 'Allma member'),
    p.avatar_url,
    coalesce(a.details->>'emergency_type', 'other'),
    coalesce(a.severity, 'critical'),
    coalesce(nullif(a.location_text, ''), 'Location pending'),
    a.created_at,
    (a.user_id = auth.uid()),
    (
      select i.status from public.emergency_call_invitations i
      where i.emergency_id = a.id and i.recipient_user_id = auth.uid()
      order by i.created_at desc limit 1
    ),
    (
      select c.id from public.emergency_calls c
      where c.sos_session_id = a.id and c.recipient_id = auth.uid()
      order by c.created_at desc limit 1
    ),
    (
      select o.distance_m from public.sos_responder_offers o
      where o.sos_activity_id = a.id and o.responder_id = auth.uid()
      order by o.created_at desc limit 1
    ),
    (a.latitude is not null and a.longitude is not null),
    (
      select max(e.created_at) from public.emergency_chat_events e
      where e.sos_session_id = a.id
    ),
    (
      select count(*)::int from public.emergency_chat_events e
      where e.sos_session_id = a.id
    )
  from public.safety_activity a
  left join public.profiles p on p.id = a.user_id
  where a.activity_type = 'sos_activated'
    and a.created_at > now() - interval '7 days'
    and public.can_access_sos_room(a.id, auth.uid())
  order by a.created_at desc
$$;

grant execute on function public.list_sos_rooms() to authenticated;

create or replace function public.get_sos_room(p_sos_id uuid)
returns table (
  sos_activity_id uuid,
  owner_id uuid,
  sender_name text,
  sender_avatar_url text,
  emergency_type text,
  severity text,
  area text,
  created_at timestamptz,
  is_mine boolean,
  location_shared boolean,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  participants jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.user_id,
    coalesce(p.full_name, 'Allma member'),
    p.avatar_url,
    coalesce(a.details->>'emergency_type', 'other'),
    coalesce(a.severity, 'critical'),
    coalesce(nullif(a.location_text, ''), 'Location pending'),
    a.created_at,
    (a.user_id = auth.uid()),
    (a.latitude is not null and a.longitude is not null),
    a.latitude,
    a.longitude,
    nullif((a.details->>'accuracy_m'), '')::double precision,
    coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'user_id', m.member_id,
        'name', coalesce(mp.full_name, 'Allma member'),
        'avatar_url', mp.avatar_url,
        'role', m.member_role
      ))
      from (
        select i.recipient_user_id as member_id, 'contact'::text as member_role
        from public.emergency_call_invitations i where i.emergency_id = a.id
        union
        select c.recipient_id, 'contact'::text
        from public.emergency_calls c where c.sos_session_id = a.id
        union
        select o.responder_id, 'responder'::text
        from public.sos_responder_offers o where o.sos_activity_id = a.id
      ) m
      left join public.profiles mp on mp.id = m.member_id
    ), '[]'::jsonb)
  from public.safety_activity a
  left join public.profiles p on p.id = a.user_id
  where a.id = p_sos_id
    and public.can_access_sos_room(p_sos_id, auth.uid())
$$;

grant execute on function public.get_sos_room(uuid) to authenticated;

alter table public.emergency_chat_events replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.emergency_chat_events;
  exception when duplicate_object then null;
  end;
end $$;