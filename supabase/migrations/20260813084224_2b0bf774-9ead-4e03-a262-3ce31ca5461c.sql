-- Eligible emergency-call targets for the signed-in user's own SOS, in configured priority order.
CREATE OR REPLACE FUNCTION public.list_sos_call_targets()
RETURNS TABLE(
  member_id uuid,
  full_name text,
  avatar_url text,
  safety_role text,
  priority integer,
  share_location_on_sos boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.member_id,
    COALESCE(NULLIF(p.full_name, ''), 'Allma member'),
    p.avatar_url,
    c.safety_role,
    c.priority,
    c.share_location_on_sos
  FROM public.safety_connections c
  JOIN public.profiles p ON p.id = c.member_id
  WHERE c.owner_id = auth.uid()
    AND c.notify_on_sos = true
    AND c.allow_emergency_calls = true
    AND EXISTS (
      SELECT 1 FROM public.safety_connections r
      WHERE r.owner_id = c.member_id
        AND r.member_id = auth.uid()
        AND r.allow_emergency_calls = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.safety_blocks b
      WHERE (b.blocker_id = c.member_id AND b.blocked_id = auth.uid())
         OR (b.blocker_id = auth.uid() AND b.blocked_id = c.member_id)
    )
  ORDER BY c.priority ASC, c.created_at ASC;
$$;

-- Place an in-app emergency call tied to the caller's own active SOS.
CREATE OR REPLACE FUNCTION public.start_sos_emergency_call(
  p_recipient_id uuid,
  p_sos_activity_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  sos public.safety_activity;
  new_id uuid;
  caller_name text;
  recent integer;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;

  SELECT * INTO sos
  FROM public.safety_activity
  WHERE id = p_sos_activity_id
    AND user_id = me
    AND activity_type = 'sos_activated';
  IF sos.id IS NULL THEN RAISE EXCEPTION 'No active SOS for this account'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.list_sos_call_targets() t WHERE t.member_id = p_recipient_id
  ) THEN
    RAISE EXCEPTION 'This member is not an eligible emergency contact';
  END IF;

  SELECT count(*) INTO recent FROM public.emergency_calls
  WHERE caller_id = me AND created_at > now() - interval '10 minutes';
  IF recent >= 30 THEN
    RAISE EXCEPTION 'Too many call attempts. Please wait a moment.';
  END IF;

  -- one live call at a time per caller
  UPDATE public.emergency_calls
  SET status = 'ended', ended_at = now(), updated_at = now()
  WHERE caller_id = me
    AND status IN ('initiating','ringing','connecting','accepted','connected','calling');

  INSERT INTO public.emergency_calls (
    caller_id, recipient_id, call_type, status, provider_mode,
    provider_confirmed, started_at, sos_session_id
  ) VALUES (
    me, p_recipient_id, 'emergency', 'initiating', 'webrtc', false, now(), p_sos_activity_id
  )
  RETURNING id INTO new_id;

  SELECT COALESCE(NULLIF(full_name, ''), 'An Allma member') INTO caller_name
  FROM public.profiles WHERE id = me;

  INSERT INTO public.notifications (user_id, title, body, kind, link)
  VALUES (
    p_recipient_id,
    'Allma emergency call',
    caller_name || ' has activated SOS and is calling you on Allma.',
    'sos_emergency_call',
    '/calls'
  );

  RETURN new_id;
END;
$$;

-- Live status of every emergency call attempt for the caller's own SOS.
CREATE OR REPLACE FUNCTION public.list_sos_call_attempts(p_sos_activity_id uuid)
RETURNS TABLE(
  call_id uuid,
  recipient_id uuid,
  full_name text,
  avatar_url text,
  safety_role text,
  status text,
  created_at timestamp with time zone,
  connected_at timestamp with time zone,
  ended_at timestamp with time zone,
  duration integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id,
    c.recipient_id,
    COALESCE(NULLIF(p.full_name, ''), 'Allma member'),
    p.avatar_url,
    sc.safety_role,
    c.status,
    c.created_at,
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
$$;

-- What a recipient is authorised to see about an incoming emergency call.
CREATE OR REPLACE FUNCTION public.get_emergency_call_context(p_call_id uuid)
RETURNS TABLE(
  is_emergency boolean,
  caller_name text,
  caller_avatar_url text,
  emergency_type text,
  severity text,
  area text,
  location_shared boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
    COALESCE(sc.share_location_on_sos, false) AND sa.id IS NOT NULL
  FROM public.emergency_calls c
  JOIN public.profiles p ON p.id = c.caller_id
  LEFT JOIN public.safety_activity sa ON sa.id = c.sos_session_id
  LEFT JOIN public.safety_connections sc
    ON sc.owner_id = c.caller_id AND sc.member_id = auth.uid()
  WHERE c.id = p_call_id
    AND c.recipient_id = auth.uid();
$$;
