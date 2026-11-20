BEGIN;

-- 1) Thread owners must always see every message on their conversation
--    (not only rows they authored). Responders already use can_access_sos_thread.
DROP POLICY IF EXISTS "Thread owners read all messages on their threads" ON public.messages;
CREATE POLICY "Thread owners read all messages on their threads"
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.threads t
      WHERE t.id = messages.thread_id
        AND t.user_id = auth.uid()
    )
  );

-- Deduplicate before enforcing unique sdk ids (early persist + onFinish).
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY sdk_message_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.messages
  WHERE sdk_message_id IS NOT NULL
)
DELETE FROM public.messages m
USING ranked r
WHERE m.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS messages_sdk_message_id_uidx
  ON public.messages (sdk_message_id)
  WHERE sdk_message_id IS NOT NULL;

-- 2) Answering an SOS call must join the EXISTING emergency conversation.
--    Never mint a parallel "Emergency SOS" thread for responders.
CREATE OR REPLACE FUNCTION public.claim_sos_emergency_call(p_call_id uuid)
RETURNS TABLE(
  accepted boolean,
  call_session_id uuid,
  thread_id uuid,
  is_voice_primary boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sos_id uuid;
  v_caller_id uuid;
  v_status text;
  v_winner_id uuid;
  v_winner_status text;
  v_thread uuid;
  v_voice_primary boolean := false;
  v_person_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  SELECT c.sos_session_id, c.caller_id
    INTO v_sos_id, v_caller_id
  FROM public.emergency_calls c
  WHERE c.id = p_call_id
    AND c.recipient_id = auth.uid()
    AND c.sos_session_id IS NOT NULL;

  IF v_sos_id IS NULL THEN
    RAISE EXCEPTION 'This is not an emergency call for your account';
  END IF;

  PERFORM 1
  FROM public.safety_activity a
  WHERE a.id = v_sos_id
    AND a.user_id = v_caller_id
    AND a.activity_type = 'sos_activated'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The SOS session is no longer available';
  END IF;

  SELECT c.status INTO v_status
  FROM public.emergency_calls c
  WHERE c.id = p_call_id
    AND c.recipient_id = auth.uid()
  FOR UPDATE;

  IF v_status NOT IN ('initiating', 'ringing', 'connecting', 'accepted', 'connected') THEN
    RETURN QUERY SELECT false, p_call_id, NULL::uuid, false;
    RETURN;
  END IF;

  SELECT w.call_id, c.status
    INTO v_winner_id, v_winner_status
  FROM public.sos_call_winners w
  JOIN public.emergency_calls c ON c.id = w.call_id
  WHERE w.sos_activity_id = v_sos_id
  FOR UPDATE OF w, c;

  IF v_winner_id IS NOT NULL
     AND v_winner_status IN ('declined', 'missed', 'no_answer', 'failed', 'ended') THEN
    DELETE FROM public.sos_call_winners WHERE sos_activity_id = v_sos_id;
    v_winner_id := NULL;
  END IF;

  IF v_winner_id IS NULL THEN
    INSERT INTO public.sos_call_winners (sos_activity_id, call_id, responder_id)
    VALUES (v_sos_id, p_call_id, auth.uid())
    ON CONFLICT (sos_activity_id) DO NOTHING;

    SELECT w.call_id INTO v_winner_id
    FROM public.sos_call_winners w
    WHERE w.sos_activity_id = v_sos_id;

    IF v_winner_id = p_call_id THEN
      v_voice_primary := true;
    END IF;
  ELSIF v_winner_id = p_call_id THEN
    v_voice_primary := true;
  END IF;

  IF v_voice_primary THEN
    UPDATE public.emergency_calls
    SET status = 'connecting',
        accepted_at = COALESCE(accepted_at, now()),
        updated_at = now()
    WHERE id = p_call_id;

    UPDATE public.emergency_calls
    SET status = 'ended', ended_at = now(), updated_at = now()
    WHERE sos_session_id = v_sos_id
      AND caller_id = v_caller_id
      AND id <> p_call_id
      AND status IN ('initiating', 'ringing', 'connecting', 'accepted', 'connected', 'calling');

    UPDATE public.emergency_call_invitations AS i
    SET status = 'CANCELLED', cancelled_at = now(), updated_at = now()
    WHERE i.emergency_id = v_sos_id
      AND i.call_session_id IS DISTINCT FROM p_call_id
      AND i.status IN ('PENDING', 'SENT', 'DELIVERED');
  ELSE
    UPDATE public.emergency_calls
    SET status = 'ended',
        accepted_at = COALESCE(accepted_at, now()),
        ended_at = COALESCE(ended_at, now()),
        updated_at = now()
    WHERE id = p_call_id
      AND status IN ('initiating', 'ringing', 'connecting', 'accepted', 'connected', 'calling');
  END IF;

  UPDATE public.emergency_call_invitations AS i
  SET status = 'ACCEPTED',
      accepted_at = COALESCE(i.accepted_at, now()),
      updated_at = now()
  WHERE i.call_session_id = p_call_id
    AND i.recipient_user_id = auth.uid()
    AND i.status IN ('PENDING', 'SENT', 'DELIVERED', 'ACCEPTED');

  IF NOT EXISTS (
    SELECT 1
    FROM public.emergency_call_invitations i
    WHERE i.call_session_id = p_call_id
      AND i.recipient_user_id = auth.uid()
  ) THEN
    INSERT INTO public.emergency_call_invitations (
      emergency_id, call_session_id, recipient_user_id, status, accepted_at
    )
    VALUES (
      v_sos_id, p_call_id, auth.uid(), 'ACCEPTED', now()
    );
  END IF;

  -- Canonical conversation only — never invent a parallel responder chat.
  SELECT coalesce(a.thread_id, nullif(a.details->>'thread_id', '')::uuid)
    INTO v_thread
  FROM public.safety_activity a
  WHERE a.id = v_sos_id;

  IF v_thread IS NULL THEN
    RAISE EXCEPTION 'This emergency is not linked to the original Allma conversation';
  END IF;

  -- Keep column + details mirror aligned on the original thread.
  -- Qualify columns: RETURNS TABLE exposes thread_id as a PL/pgSQL variable.
  UPDATE public.safety_activity AS a
  SET thread_id = v_thread,
      details = coalesce(a.details, '{}'::jsonb)
        || jsonb_build_object(
          'thread_id', v_thread::text,
          'channel', coalesce(a.details->>'channel', 'sos')
        )
  WHERE a.id = v_sos_id
    AND (
      a.thread_id IS DISTINCT FROM v_thread
      OR a.details->>'thread_id' IS DISTINCT FROM v_thread::text
    );

  SELECT coalesce(nullif(p.full_name, ''), 'A responder')
    INTO v_person_name
  FROM public.profiles p
  WHERE p.id = auth.uid();

  INSERT INTO public.emergency_chat_events (
    sos_session_id, thread_id, author_id, event_type, body
  )
  SELECT
    v_sos_id,
    v_thread,
    auth.uid(),
    'participant_joined',
    coalesce(v_person_name, 'A responder') || ' joined the shared conversation.'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.emergency_chat_events e
    WHERE e.sos_session_id = v_sos_id
      AND e.author_id = auth.uid()
      AND e.event_type = 'participant_joined'
  );

  RETURN QUERY SELECT true, p_call_id, v_thread, v_voice_primary;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_sos_emergency_call(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_sos_emergency_call(uuid) TO authenticated;

-- 3) open_sos_shared_conversation: return existing canonical thread only.
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

  IF v_thread IS NULL THEN
    RAISE EXCEPTION 'This emergency is not linked to the original Allma conversation';
  END IF;

  UPDATE public.safety_activity AS a
  SET thread_id = v_thread,
      details = coalesce(a.details, '{}'::jsonb)
        || jsonb_build_object(
          'thread_id', v_thread::text,
          'channel', coalesce(a.details->>'channel', 'sos')
        )
  WHERE a.id = p_sos_activity_id
    AND (
      a.thread_id IS DISTINCT FROM v_thread
      OR a.details->>'thread_id' IS DISTINCT FROM v_thread::text
    );

  RETURN v_thread;
END;
$$;

REVOKE ALL ON FUNCTION public.open_sos_shared_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_sos_shared_conversation(uuid) TO authenticated;

-- 4) can_write_sos_thread must match thread_id column (not details-only).
CREATE OR REPLACE FUNCTION public.can_write_sos_thread(_thread_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(_user_id = auth.uid(), false)
    AND EXISTS (
      SELECT 1
      FROM public.threads t
      WHERE t.id = _thread_id
        AND (
          t.user_id = _user_id
          OR EXISTS (
            SELECT 1
            FROM public.safety_activity a
            WHERE (
                a.thread_id = t.id
                OR a.details->>'thread_id' = t.id::text
              )
              AND a.activity_type = 'sos_activated'
              AND coalesce(a.sos_status::text, a.details->>'sos_status', 'active') = 'active'
              AND public.can_write_sos_room(a.id, _user_id)
          )
        )
    )
$$;

REVOKE ALL ON FUNCTION public.can_write_sos_thread(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_sos_thread(uuid, uuid) TO authenticated;

COMMIT;
