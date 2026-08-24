-- Extend the authorized emergency-call context with coordinates only when
-- the caller explicitly shared location with this Safety Network member.
DROP FUNCTION IF EXISTS public.get_emergency_call_context(uuid);

CREATE OR REPLACE FUNCTION public.get_emergency_call_context(p_call_id uuid)
RETURNS TABLE(
  is_emergency boolean,
  caller_name text,
  caller_avatar_url text,
  emergency_type text,
  severity text,
  area text,
  location_shared boolean,
  latitude double precision,
  longitude double precision
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.sos_session_id IS NOT NULL,
    COALESCE(NULLIF(p.full_name, ''), 'Allma member'),
    p.avatar_url,
    COALESCE(sa.details ->> 'emergency_type', 'unspecified'),
    COALESCE(sa.severity, 'high'),
    CASE
      WHEN sc.share_location_on_sos IS TRUE
        THEN COALESCE(NULLIF(sa.location_text, ''), 'Location shared')
      ELSE 'Not shared with you'
    END,
    COALESCE(sc.share_location_on_sos, false) AND sa.id IS NOT NULL,
    CASE WHEN sc.share_location_on_sos IS TRUE THEN sa.latitude ELSE NULL END,
    CASE WHEN sc.share_location_on_sos IS TRUE THEN sa.longitude ELSE NULL END
  FROM public.emergency_calls c
  JOIN public.profiles p ON p.id = c.caller_id
  LEFT JOIN public.safety_activity sa ON sa.id = c.sos_session_id
  LEFT JOIN public.safety_connections sc
    ON sc.owner_id = c.caller_id AND sc.member_id = auth.uid()
  WHERE c.id = p_call_id
    AND c.recipient_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_emergency_call_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_emergency_call_context(uuid) TO authenticated;
