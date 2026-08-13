-- 1. Signalling table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.emergency_calls(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('offer','answer','candidate','bye')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_signals_call_idx ON public.call_signals (call_id, created_at);

GRANT SELECT, INSERT ON public.call_signals TO authenticated;
GRANT ALL ON public.call_signals TO service_role;

ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read call signals"
ON public.call_signals FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.emergency_calls c
    WHERE c.id = call_signals.call_id
      AND (c.caller_id = auth.uid() OR c.recipient_id = auth.uid())
  )
);

CREATE POLICY "Participants write call signals"
ON public.call_signals FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.emergency_calls c
    WHERE c.id = call_signals.call_id
      AND (c.caller_id = auth.uid() OR c.recipient_id = auth.uid())
      AND c.status NOT IN ('ended','declined','missed','failed')
  )
);

-- 2. Start a call ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_voice_call(p_recipient_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  recent integer;
  new_id uuid;
  caller_name text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in to make a call'; END IF;
  IF p_recipient_id = me THEN RAISE EXCEPTION 'You cannot call yourself'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_recipient_id) THEN
    RAISE EXCEPTION 'This person is not available';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.safety_blocks
    WHERE (blocker_id = p_recipient_id AND blocked_id = me)
       OR (blocker_id = me AND blocked_id = p_recipient_id)
  ) THEN
    RAISE EXCEPTION 'This person is not available';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.safety_connections
    WHERE owner_id = me AND member_id = p_recipient_id AND allow_emergency_calls = true
  ) OR NOT EXISTS (
    SELECT 1 FROM public.safety_connections
    WHERE owner_id = p_recipient_id AND member_id = me AND allow_emergency_calls = true
  ) THEN
    RAISE EXCEPTION 'In-app calls are not enabled for this connection';
  END IF;

  SELECT count(*) INTO recent FROM public.emergency_calls
  WHERE caller_id = me AND created_at > now() - interval '10 minutes';
  IF recent >= 12 THEN
    RAISE EXCEPTION 'Too many call attempts. Please wait a moment.';
  END IF;

  UPDATE public.emergency_calls
  SET status = 'ended', ended_at = now()
  WHERE caller_id = me
    AND status IN ('initiating','ringing','connecting','accepted','connected','calling')
    AND created_at < now();

  INSERT INTO public.emergency_calls (
    caller_id, recipient_id, call_type, status, provider_mode, provider_confirmed, started_at
  ) VALUES (me, p_recipient_id, 'voice', 'initiating', 'webrtc', false, now())
  RETURNING id INTO new_id;

  SELECT COALESCE(NULLIF(full_name, ''), 'An Allma member') INTO caller_name
  FROM public.profiles WHERE id = me;

  INSERT INTO public.notifications (user_id, title, body, kind, link)
  VALUES (p_recipient_id, 'Incoming Allma call', caller_name || ' is calling you on Allma.',
          'incoming_call', '/profile');

  RETURN new_id;
END;
$$;

-- 3. Update call state -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_voice_call(
  p_call_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS public.emergency_calls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  call_row public.emergency_calls;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF p_status NOT IN ('ringing','connecting','connected','declined','missed','ended','failed') THEN
    RAISE EXCEPTION 'Unsupported call status';
  END IF;

  SELECT * INTO call_row FROM public.emergency_calls WHERE id = p_call_id FOR UPDATE;
  IF call_row.id IS NULL THEN RAISE EXCEPTION 'Call not found'; END IF;
  IF call_row.caller_id <> me AND call_row.recipient_id <> me THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- only the recipient may ring/decline/answer, only the caller may mark connecting
  IF p_status IN ('ringing','declined') AND call_row.recipient_id <> me THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_status = 'missed' AND call_row.caller_id <> me THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF call_row.status IN ('ended','declined','missed','failed') AND p_status <> 'ended' THEN
    RAISE EXCEPTION 'This call has already finished';
  END IF;

  UPDATE public.emergency_calls
  SET status = p_status,
      ringing_at = CASE WHEN p_status = 'ringing' THEN COALESCE(ringing_at, now()) ELSE ringing_at END,
      accepted_at = CASE WHEN p_status = 'connecting' AND recipient_id = me THEN COALESCE(accepted_at, now()) ELSE accepted_at END,
      connected_at = CASE WHEN p_status = 'connected' THEN COALESCE(connected_at, now()) ELSE connected_at END,
      provider_confirmed = CASE WHEN p_status = 'connected' THEN true ELSE provider_confirmed END,
      ended_at = CASE WHEN p_status IN ('ended','declined','missed','failed') THEN COALESCE(ended_at, now()) ELSE ended_at END,
      duration = CASE
        WHEN p_status IN ('ended','failed') AND connected_at IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (now() - connected_at))::integer)
        ELSE duration END,
      failure_reason = CASE WHEN p_status = 'failed' THEN p_reason ELSE failure_reason END,
      updated_at = now()
  WHERE id = p_call_id
  RETURNING * INTO call_row;

  RETURN call_row;
END;
$$;

-- 4. Call history ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_calls(p_limit integer DEFAULT 30)
RETURNS TABLE(
  id uuid,
  direction text,
  other_user_id uuid,
  full_name text,
  avatar_url text,
  status text,
  duration integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id,
    CASE WHEN c.caller_id = auth.uid() THEN 'outgoing' ELSE 'incoming' END,
    CASE WHEN c.caller_id = auth.uid() THEN c.recipient_id ELSE c.caller_id END,
    COALESCE(NULLIF(p.full_name, ''), 'Allma member'),
    p.avatar_url,
    c.status,
    c.duration,
    c.created_at
  FROM public.emergency_calls c
  JOIN public.profiles p
    ON p.id = CASE WHEN c.caller_id = auth.uid() THEN c.recipient_id ELSE c.caller_id END
  WHERE c.caller_id = auth.uid() OR c.recipient_id = auth.uid()
  ORDER BY c.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
$$;

-- 5. Realtime ----------------------------------------------------------------
ALTER TABLE public.emergency_calls REPLICA IDENTITY FULL;
ALTER TABLE public.call_signals REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_calls;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;