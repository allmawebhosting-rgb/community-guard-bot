-- Twilio metadata extends the existing emergency_calls record; no duplicate call table.
ALTER TABLE public.emergency_calls
  ADD COLUMN IF NOT EXISTS twilio_call_sid text,
  ADD COLUMN IF NOT EXISTS twilio_from_identity text,
  ADD COLUMN IF NOT EXISTS twilio_to_identity text;

CREATE UNIQUE INDEX IF NOT EXISTS emergency_calls_twilio_call_sid_key
  ON public.emergency_calls (twilio_call_sid)
  WHERE twilio_call_sid IS NOT NULL;

CREATE INDEX IF NOT EXISTS emergency_calls_caller_id_idx ON public.emergency_calls (caller_id);
CREATE INDEX IF NOT EXISTS emergency_calls_recipient_id_idx ON public.emergency_calls (recipient_id);
CREATE INDEX IF NOT EXISTS emergency_calls_sos_session_id_idx ON public.emergency_calls (sos_session_id);

-- Centralized, server-readable escalation configuration.
CREATE TABLE IF NOT EXISTS public.voice_configuration (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  responder_timeout_seconds integer NOT NULL DEFAULT 20 CHECK (responder_timeout_seconds BETWEEN 10 AND 120),
  token_ttl_seconds integer NOT NULL DEFAULT 3600 CHECK (token_ttl_seconds BETWEEN 300 AND 3600),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.voice_configuration (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.voice_configuration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.voice_configuration FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_voice_configuration()
RETURNS TABLE(responder_timeout_seconds integer, token_ttl_seconds integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT responder_timeout_seconds, token_ttl_seconds
  FROM public.voice_configuration
  WHERE id = true;
$$;

REVOKE ALL ON FUNCTION public.get_voice_configuration() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_voice_configuration() TO service_role;
