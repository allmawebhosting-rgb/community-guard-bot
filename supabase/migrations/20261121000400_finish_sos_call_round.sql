BEGIN;

-- Round completion for missed/no-answer SOS dials. Does not mark anyone as a
-- chat participant — only answered claims create ACCEPTED membership.

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

  UPDATE public.emergency_call_invitations AS i
  SET status = 'CANCELLED', cancelled_at = now(), updated_at = now()
  WHERE i.emergency_id = p_sos_activity_id
    AND i.call_session_id = ANY(COALESCE(p_call_ids, ARRAY[]::uuid[]))
    AND i.status IN ('PENDING', 'SENT', 'DELIVERED');

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_sos_call_round(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_sos_call_round(uuid, uuid[]) TO authenticated;

COMMIT;
