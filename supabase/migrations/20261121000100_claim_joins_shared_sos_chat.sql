BEGIN;

-- Answering an SOS call must atomically:
-- 1) verify the call belongs to this Safety Network invitee
-- 2) mark the invitation ACCEPTED (idempotent)
-- 3) ensure the original emergency conversation thread exists
-- 4) record participant_joined once
-- 5) return thread_id so the client opens the same chat
--
-- First answerer is the voice primary. Later answerers still join the same chat
-- (voice stays with the primary / their call ends cleanly).

DROP FUNCTION IF EXISTS public.claim_sos_emergency_call(uuid);

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
    -- Declined / missed / failed / ended — never invent a chat join.
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

    -- Re-read in case of a concurrent insert.
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

    -- End sibling voice legs in this round, but chat membership for this
    -- answerer is still granted below. Later rounds can produce more answerers.
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
    -- Additional responder answered after a voice primary: join chat only.
    UPDATE public.emergency_calls
    SET status = 'ended',
        accepted_at = COALESCE(accepted_at, now()),
        ended_at = COALESCE(ended_at, now()),
        updated_at = now()
    WHERE id = p_call_id
      AND status IN ('initiating', 'ringing', 'connecting', 'accepted', 'connected', 'calling');
  END IF;

  -- Authorise this answerer for the shared conversation (idempotent).
  -- Qualify invitation columns: RETURNS TABLE exposes call_session_id / accepted.
  UPDATE public.emergency_call_invitations AS i
  SET status = 'ACCEPTED',
      accepted_at = COALESCE(i.accepted_at, now()),
      updated_at = now()
  WHERE i.call_session_id = p_call_id
    AND i.recipient_user_id = auth.uid()
    AND i.status IN ('PENDING', 'SENT', 'DELIVERED', 'ACCEPTED');

  -- Ensure invitation exists even if push path missed creating one.
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

  -- Resolve / create the original emergency conversation thread.
  SELECT coalesce(a.thread_id, nullif(a.details->>'thread_id', '')::uuid)
    INTO v_thread
  FROM public.safety_activity a
  WHERE a.id = v_sos_id;

  IF v_thread IS NULL THEN
    INSERT INTO public.threads (user_id, title)
    VALUES (v_caller_id, 'Emergency SOS')
    RETURNING id INTO v_thread;

    UPDATE public.safety_activity
    SET thread_id = v_thread,
        details = coalesce(details, '{}'::jsonb)
          || jsonb_build_object(
            'thread_id', v_thread::text,
            'channel', coalesce(details->>'channel', 'sos')
          )
    WHERE id = v_sos_id;
  END IF;

  -- Idempotent join timeline event (unique partial index on participant_joined).
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

COMMIT;
