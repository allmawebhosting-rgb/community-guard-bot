CREATE TABLE IF NOT EXISTS public.voice_configuration (
  id boolean PRIMARY KEY DEFAULT true,
  token_ttl_seconds integer NOT NULL DEFAULT 3600,
  responder_timeout_seconds integer NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voice_configuration_singleton CHECK (id)
);

GRANT ALL ON public.voice_configuration TO service_role;

ALTER TABLE public.voice_configuration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to voice configuration"
  ON public.voice_configuration FOR SELECT USING (false);

CREATE TRIGGER update_voice_configuration_updated_at
  BEFORE UPDATE ON public.voice_configuration
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.voice_configuration (id) VALUES (true) ON CONFLICT (id) DO NOTHING;