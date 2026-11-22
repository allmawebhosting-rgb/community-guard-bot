-- Responders can leave an SOS room.
--
-- Adds public.leave_sos_room(p_sos_id): records a 'participant_left' event
-- in emergency_chat_events for the caller (never the owner — the owner ends
-- the SOS instead). get_sos_room then excludes members who left from the
-- participant list, and list_sos_rooms stops offering the room to a member
-- who left (the owner always keeps their room). The get_sos_room /
-- list_sos_rooms bodies below are the live production definitions with
-- only those two filters added.

create or replace function public.leave_sos_room(p_sos_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_thread uuid;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  select a.user_id into v_owner from public.safety_activity a where a.id = p_sos_id;
  if v_owner is null then
    raise exception 'Emergency not found';
  end if;
  if v_owner = v_user then
    raise exception 'The person who started the SOS ends it instead of leaving';
  end if;
  if not public.can_access_sos_room(p_sos_id, v_user) then
    raise exception 'You are not part of this emergency';
  end if;

  if exists (
    select 1 from public.emergency_chat_events e
    where e.sos_session_id = p_sos_id
      and e.author_id = v_user
      and e.event_type = 'participant_left'
  ) then
    return true;
  end if;

  select coalesce(p.full_name, 'A responder') into v_name
  from public.profiles p
  where p.id = v_user;

  begin
    v_thread := public.get_sos_thread_for_activity(p_sos_id);
  exception when others then
    v_thread := null;
  end;

  insert into public.emergency_chat_events (sos_session_id, thread_id, author_id, event_type, body)
  values (
    p_sos_id,
    v_thread,
    v_user,
    'participant_left',
    coalesce(v_name, 'A responder') || ' left the emergency'
  );
  return true;
end;
$$;

grant execute on function public.leave_sos_room(uuid) to authenticated;

-- get_sos_room: live body + exclude members who left from participants.
CREATE OR REPLACE FUNCTION public.get_sos_room(p_sos_id uuid)
 RETURNS TABLE(sos_activity_id uuid, owner_id uuid, sender_name text, sender_avatar_url text, emergency_type text, severity text, area text, created_at timestamp with time zone, is_mine boolean, location_shared boolean, latitude double precision, longitude double precision, accuracy_m double precision, participants jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id,
         a.user_id,
         coalesce(p.full_name, 'Allma member'),
         p.avatar_url,
         coalesce(a.details->>'emergency_type', 'other'),
         coalesce(a.severity, 'critical'),
         coalesce(nullif(a.location_text, ''), 'Location pending'),
         a.created_at,
         a.user_id = auth.uid(),
         a.latitude IS NOT NULL AND a.longitude IS NOT NULL,
         a.latitude,
         a.longitude,
         nullif(a.details->>'accuracy_m', '')::double precision,
         coalesce(( SELECT jsonb_agg(
                             jsonb_build_object(
                               'user_id', members.member_id,
                               'name', coalesce(member_profile.full_name, 'Allma member'),
                               'avatar_url', member_profile.avatar_url,
                               'role', members.member_role,
                               'connection_status', coalesce((
                                                                 SELECT CASE WHEN latest.status IN ('connected', 'connecting', 'accepted') THEN 'connected'
                                                                             WHEN latest.status IN ('ended', 'failed', 'missed', 'declined', 'no_answer') THEN 'disconnected'
                                                                             ELSE 'joined' END
                                                                 FROM ( SELECT c.status
                                                                               FROM public.emergency_calls c
                                                                               WHERE c.sos_session_id = a.id AND c.recipient_id = members.member_id
                                                                               ORDER BY c.accepted_at DESC NULLS LAST, c.connected_at DESC NULLS LAST, c.created_at DESC LIMIT 1
                                                                             ) latest
                                                               ), 'joined')
                             )
                             ORDER BY coalesce(member_profile.full_name, 'Allma member')
                          ) FROM (
                                   SELECT accepted.member_id,
                                          CASE WHEN bool_or(accepted.member_role = 'responder') THEN 'responder' ELSE 'contact' END AS member_role
                                   FROM (
                                          SELECT i.recipient_user_id AS member_id, 'contact'::text AS member_role
                                          FROM public.emergency_call_invitations i
                                          WHERE i.emergency_id = a.id AND upper(i.status) = 'ACCEPTED'
                                          UNION ALL SELECT o.responder_id, 'responder'::text
                                          FROM public.sos_responder_offers o
                                          WHERE o.sos_activity_id = a.id AND lower(o.status) = 'accepted'
                                          UNION ALL SELECT cr.user_id, 'responder'::text
                                          FROM public.responder_assignments ra JOIN public.community_responders cr ON cr.id = ra.responder_profile_id
                                          WHERE ra.sos_session_id = a.id AND
                                                lower(ra.status::text) IN ('accepted', 'en_route', 'arrived', 'assisting', 'need_official_help', 'completed')
                                        ) accepted
                                   WHERE accepted.member_id IS NOT NULL AND accepted.member_id <> a.user_id
                                     AND NOT EXISTS (
                                           SELECT 1 FROM public.emergency_chat_events e
                                           WHERE e.sos_session_id = a.id
                                             AND e.author_id = accepted.member_id
                                             AND e.event_type = 'participant_left'
                                         )
                                   GROUP BY accepted.member_id
                                 ) members
                          LEFT JOIN public.profiles member_profile ON member_profile.id = members.member_id
                        ), '[]'::jsonb)
  FROM public.safety_activity a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.id = p_sos_id AND public.can_access_sos_room(p_sos_id, auth.uid())
$function$;

-- list_sos_rooms: live body + a member who left no longer sees the room.
CREATE OR REPLACE FUNCTION public.list_sos_rooms()
 RETURNS TABLE(sos_activity_id uuid, owner_id uuid, sender_name text, sender_avatar_url text, emergency_type text, severity text, area text, created_at timestamp with time zone, is_mine boolean, my_invitation_status text, my_call_session_id uuid, distance_m double precision, location_shared boolean, last_message_at timestamp with time zone, message_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
and (
  a.user_id = auth.uid()
  or not exists (
    select 1 from public.emergency_chat_events e
    where e.sos_session_id = a.id
      and e.author_id = auth.uid()
      and e.event_type = 'participant_left'
  )
)
order by a.created_at desc
$function$;
