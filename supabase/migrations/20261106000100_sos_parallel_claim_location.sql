CREATE TABLE public.sos_call_winners (
  sos_activity_id uuid PRIMARY KEY REFERENCES public.safety_activity(id) ON DELETE CASCADE,
  call_id uuid NOT NULL UNIQUE REFERENCES public.emergency_calls(id) ON DELETE CASCADE,
  responder_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sos_call_winners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sos_call_winners FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_sos_emergency_call(p_call_id uuid)
RETURNS TABLE(accepted boolean, call_session_id uuid)
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
BEGIN
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

  IF v_status NOT IN ('initiating', 'ringing', 'connecting') THEN
    RETURN QUERY SELECT false, p_call_id;
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

  IF v_winner_id IS NOT NULL AND v_winner_id <> p_call_id THEN
    UPDATE public.emergency_calls
    SET status = 'ended', ended_at = now(), updated_at = now()
    WHERE id = p_call_id
      AND status IN ('initiating', 'ringing', 'connecting', 'accepted', 'connected', 'calling');

    UPDATE public.emergency_call_invitations
    SET status = 'CANCELLED', cancelled_at = now(), updated_at = now()
    WHERE call_session_id = p_call_id
      AND status IN ('PENDING', 'SENT', 'DELIVERED');

    RETURN QUERY SELECT false, v_winner_id;
    RETURN;
  END IF;

  IF v_winner_id IS NULL THEN
    INSERT INTO public.sos_call_winners (sos_activity_id, call_id, responder_id)
    VALUES (v_sos_id, p_call_id, auth.uid());
  END IF;

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

  UPDATE public.emergency_call_invitations
  SET status = 'ACCEPTED',
      accepted_at = COALESCE(accepted_at, now()),
      updated_at = now()
  WHERE call_session_id = p_call_id
    AND recipient_user_id = auth.uid()
    AND status IN ('PENDING', 'SENT', 'DELIVERED');

  UPDATE public.emergency_call_invitations
  SET status = 'CANCELLED', cancelled_at = now(), updated_at = now()
  WHERE emergency_id = v_sos_id
    AND call_session_id <> p_call_id
    AND status IN ('PENDING', 'SENT', 'DELIVERED');

  RETURN QUERY SELECT true, p_call_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_sos_emergency_call(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_sos_emergency_call(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.finish_sos_call_round(
  p_sos_activity_id uuid,
  p_call_ids uuid[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_winner_id uuid;
  v_winner_status text;
BEGIN
  PERFORM 1
  FROM public.safety_activity a
  WHERE a.id = p_sos_activity_id
    AND a.user_id = auth.uid()
    AND a.activity_type = 'sos_activated'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active SOS for this account';
  END IF;

  SELECT w.call_id, c.status
    INTO v_winner_id, v_winner_status
  FROM public.sos_call_winners w
  JOIN public.emergency_calls c ON c.id = w.call_id
  WHERE w.sos_activity_id = p_sos_activity_id
  FOR UPDATE OF w, c;

  IF v_winner_id IS NOT NULL
     AND v_winner_status IN ('initiating', 'ringing', 'connecting', 'accepted', 'connected', 'calling') THEN
    RETURN false;
  END IF;

  IF v_winner_id IS NOT NULL THEN
    DELETE FROM public.sos_call_winners WHERE sos_activity_id = p_sos_activity_id;
  END IF;

  UPDATE public.emergency_calls
  SET status = 'missed', ended_at = now(), updated_at = now()
  WHERE sos_session_id = p_sos_activity_id
    AND caller_id = auth.uid()
    AND id = ANY(COALESCE(p_call_ids, ARRAY[]::uuid[]))
    AND status IN ('initiating', 'ringing', 'connecting', 'accepted', 'connected', 'calling');

  UPDATE public.emergency_call_invitations
  SET status = 'CANCELLED', cancelled_at = now(), updated_at = now()
  WHERE emergency_id = p_sos_activity_id
    AND call_session_id = ANY(COALESCE(p_call_ids, ARRAY[]::uuid[]))
    AND status IN ('PENDING', 'SENT', 'DELIVERED');

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_sos_call_round(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_sos_call_round(uuid, uuid[]) TO authenticated;

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
  location_requested boolean,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.sos_session_id IS NOT NULL,
    COALESCE(NULLIF(p.full_name, ''), 'Allma member'),
    p.avatar_url,
    COALESCE(sa.details ->> 'emergency_type', 'unspecified'),
    COALESCE(sa.severity, 'high'),
    CASE
      WHEN COALESCE((sa.details ->> 'location_consent')::boolean, true)
           AND sc.share_location_on_sos IS TRUE
        THEN CASE
          WHEN sa.latitude IS NOT NULL AND sa.longitude IS NOT NULL
            THEN COALESCE(NULLIF(sa.location_text, ''), 'Location shared')
          ELSE 'Acquiring caller GPS…'
        END
      ELSE 'Not shared with you'
    END,
    COALESCE((sa.details ->> 'location_consent')::boolean, true)
      AND sc.share_location_on_sos IS TRUE
      AND sa.latitude IS NOT NULL
      AND sa.longitude IS NOT NULL,
    COALESCE((sa.details ->> 'location_consent')::boolean, true)
      AND sc.share_location_on_sos IS TRUE,
    CASE
      WHEN COALESCE((sa.details ->> 'location_consent')::boolean, true)
           AND sc.share_location_on_sos IS TRUE
        THEN sa.latitude
      ELSE NULL
    END,
    CASE
      WHEN COALESCE((sa.details ->> 'location_consent')::boolean, true)
           AND sc.share_location_on_sos IS TRUE
        THEN sa.longitude
      ELSE NULL
    END,
    CASE
      WHEN COALESCE((sa.details ->> 'location_consent')::boolean, true)
           AND sc.share_location_on_sos IS TRUE
        THEN (sa.details ->> 'accuracy_m')::double precision
      ELSE NULL
    END
  FROM public.emergency_calls c
  JOIN public.profiles p ON p.id = c.caller_id
  LEFT JOIN public.safety_activity sa ON sa.id = c.sos_session_id
  LEFT JOIN public.safety_connections sc
    ON sc.owner_id = c.caller_id
   AND sc.member_id = auth.uid()
  WHERE c.id = p_call_id
    AND c.recipient_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_emergency_call_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_emergency_call_context(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_sos_call_location_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude
     OR NEW.location_text IS DISTINCT FROM OLD.location_text
     OR NEW.details IS DISTINCT FROM OLD.details THEN
    UPDATE public.emergency_calls
    SET updated_at = now()
    WHERE sos_session_id = NEW.id
      AND status IN ('initiating', 'ringing', 'connecting', 'accepted', 'connected', 'calling');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_sos_call_location_change ON public.safety_activity;
CREATE TRIGGER notify_sos_call_location_change
AFTER UPDATE OF latitude, longitude, location_text, details
ON public.safety_activity
FOR EACH ROW
EXECUTE FUNCTION public.notify_sos_call_location_change();
