-- Allow every eligible SOS contact to be called at the same time.
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
  SELECT * INTO sos FROM public.safety_activity
  WHERE id = p_sos_activity_id AND user_id = me AND activity_type = 'sos_activated';
  IF sos.id IS NULL THEN RAISE EXCEPTION 'No active SOS for this account'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.list_sos_call_targets() t WHERE t.member_id = p_recipient_id) THEN
    RAISE EXCEPTION 'This member is not an eligible emergency contact';
  END IF;
  SELECT count(*) INTO recent FROM public.emergency_calls
  WHERE caller_id = me AND created_at > now() - interval '10 minutes';
  IF recent >= 30 THEN RAISE EXCEPTION 'Too many call attempts. Please wait a moment.'; END IF;

  INSERT INTO public.emergency_calls (
    caller_id, recipient_id, call_type, status, provider_mode,
    provider_confirmed, started_at, sos_session_id
  ) VALUES (
    me, p_recipient_id, 'emergency', 'initiating', 'zego', false, now(), p_sos_activity_id
  ) RETURNING id INTO new_id;

  SELECT COALESCE(NULLIF(full_name, ''), 'An Allma member') INTO caller_name
  FROM public.profiles WHERE id = me;
  INSERT INTO public.notifications (user_id, title, body, kind, link)
  VALUES (p_recipient_id, 'Allma emergency call', caller_name || ' has activated SOS and is calling you on Allma.', 'sos_emergency_call', '/calls');
  RETURN new_id;
END;
$$;