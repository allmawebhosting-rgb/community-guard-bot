BEGIN;

-- When an authorized responder accepts an SOS call/offer, resolve (or create)
-- the single shared conversation for that emergency and return its thread id.
CREATE OR REPLACE FUNCTION public.open_sos_shared_conversation(p_sos_activity_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_thread uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  SELECT a.user_id,
         coalesce(a.thread_id, nullif(a.details->>'thread_id', '')::uuid)
    INTO v_owner, v_thread
  FROM public.safety_activity a
  WHERE a.id = p_sos_activity_id
    AND a.activity_type IN ('sos_activated', 'sos_resolved')
  FOR UPDATE;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'This emergency is no longer available';
  END IF;

  IF NOT public.can_access_sos_room(p_sos_activity_id, auth.uid()) THEN
    RAISE EXCEPTION 'You are not authorized for this emergency conversation';
  END IF;

  IF v_thread IS NOT NULL THEN
    RETURN v_thread;
  END IF;

  INSERT INTO public.threads (user_id, title)
  VALUES (v_owner, 'Emergency SOS')
  RETURNING id INTO v_thread;

  UPDATE public.safety_activity
  SET thread_id = v_thread,
      details = coalesce(details, '{}'::jsonb)
        || jsonb_build_object(
          'thread_id', v_thread::text,
          'channel', coalesce(details->>'channel', 'sos')
        )
  WHERE id = p_sos_activity_id;

  RETURN v_thread;
END;
$$;

REVOKE ALL ON FUNCTION public.open_sos_shared_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_sos_shared_conversation(uuid) TO authenticated;

COMMIT;
