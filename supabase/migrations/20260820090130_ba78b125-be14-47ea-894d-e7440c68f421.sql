DROP FUNCTION IF EXISTS public.list_sos_call_attempts(uuid);
CREATE OR REPLACE FUNCTION public.list_sos_call_attempts(p_sos_activity_id uuid)
 RETURNS TABLE(call_id uuid, recipient_id uuid, full_name text, avatar_url text, safety_role text, status text, created_at timestamp with time zone, accepted_at timestamp with time zone, connected_at timestamp with time zone, ended_at timestamp with time zone, duration integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.recipient_id,
    COALESCE(NULLIF(p.full_name, ''), 'Allma member'),
    p.avatar_url,
    sc.safety_role,
    c.status,
    c.created_at,
    c.accepted_at,
    c.connected_at,
    c.ended_at,
    c.duration
  FROM public.emergency_calls c
  JOIN public.profiles p ON p.id = c.recipient_id
  LEFT JOIN public.safety_connections sc
    ON sc.owner_id = c.caller_id AND sc.member_id = c.recipient_id
  WHERE c.sos_session_id = p_sos_activity_id
    AND c.caller_id = auth.uid()
  ORDER BY c.created_at ASC;
$function$;
GRANT EXECUTE ON FUNCTION public.list_sos_call_attempts(uuid) TO authenticated;