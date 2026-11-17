BEGIN;

CREATE OR REPLACE FUNCTION public.get_sos_room(p_sos_id uuid)
RETURNS TABLE (
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
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
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'user_id', members.member_id,
          'name', coalesce(member_profile.full_name, 'Allma member'),
          'avatar_url', member_profile.avatar_url,
          'role', members.member_role
        )
        ORDER BY coalesce(member_profile.full_name, 'Allma member')
      )
      FROM (
        SELECT
          accepted.member_id,
          CASE
            WHEN bool_or(accepted.member_role = 'responder') THEN 'responder'
            ELSE 'contact'
          END AS member_role
        FROM (
          SELECT i.recipient_user_id AS member_id, 'contact'::text AS member_role
          FROM public.emergency_call_invitations i
          WHERE i.emergency_id = a.id
            AND upper(i.status) = 'ACCEPTED'
          UNION ALL
          SELECT o.responder_id, 'responder'::text
          FROM public.sos_responder_offers o
          WHERE o.sos_activity_id = a.id
            AND lower(o.status) = 'accepted'
          UNION ALL
          SELECT cr.user_id, 'responder'::text
          FROM public.responder_assignments ra
          JOIN public.community_responders cr ON cr.id = ra.responder_profile_id
          WHERE ra.sos_session_id = a.id
            AND lower(ra.status::text) IN (
              'accepted', 'en_route', 'arrived', 'assisting',
              'need_official_help', 'completed'
            )
        ) accepted
        WHERE accepted.member_id IS NOT NULL
          AND accepted.member_id <> a.user_id
        GROUP BY accepted.member_id
      ) members
      LEFT JOIN public.profiles member_profile ON member_profile.id = members.member_id
    ), '[]'::jsonb)
  FROM public.safety_activity a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.id = p_sos_id
    AND public.can_access_sos_room(p_sos_id, auth.uid())
$$;

REVOKE ALL ON FUNCTION public.get_sos_room(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sos_room(uuid) TO authenticated;

COMMIT;
