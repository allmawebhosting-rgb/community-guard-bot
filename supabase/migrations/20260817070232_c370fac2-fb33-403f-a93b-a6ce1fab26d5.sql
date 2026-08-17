CREATE TABLE public.smart_sos_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  inactivity_seconds INTEGER NOT NULL DEFAULT 15 CHECK (inactivity_seconds BETWEEN 10 AND 600),
  grace_seconds INTEGER NOT NULL DEFAULT 20 CHECK (grace_seconds BETWEEN 5 AND 180),
  motion_detection BOOLEAN NOT NULL DEFAULT false,
  audio_detection BOOLEAN NOT NULL DEFAULT false,
  auto_escalation BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_sos_settings TO authenticated;
GRANT ALL ON public.smart_sos_settings TO service_role;
ALTER TABLE public.smart_sos_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own smart sos settings" ON public.smart_sos_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.smart_sos_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  confidence TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('low','medium','high')),
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','safe','help_requested','escalated','expired','cancelled')),
  sos_activity_id UUID REFERENCES public.safety_activity(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX smart_sos_checks_user_idx ON public.smart_sos_checks (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.smart_sos_checks TO authenticated;
GRANT ALL ON public.smart_sos_checks TO service_role;
ALTER TABLE public.smart_sos_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own smart sos checks" ON public.smart_sos_checks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own smart sos checks" ON public.smart_sos_checks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own smart sos checks" ON public.smart_sos_checks
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.smart_sos_check_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  check_id UUID NOT NULL REFERENCES public.smart_sos_checks(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX smart_sos_check_events_check_idx ON public.smart_sos_check_events (check_id, created_at);
GRANT SELECT, INSERT ON public.smart_sos_check_events TO authenticated;
GRANT ALL ON public.smart_sos_check_events TO service_role;
ALTER TABLE public.smart_sos_check_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own smart sos check events" ON public.smart_sos_check_events
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.smart_sos_checks c WHERE c.id = check_id AND c.user_id = auth.uid()
  ));
CREATE POLICY "Users add own smart sos check events" ON public.smart_sos_check_events
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.smart_sos_checks c WHERE c.id = check_id AND c.user_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.resolve_smart_sos_check(_check_id UUID, _status TEXT, _metadata JSONB DEFAULT '{}'::jsonb)
RETURNS public.smart_sos_checks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check public.smart_sos_checks;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;
  IF _status NOT IN ('safe','help_requested','expired','cancelled') THEN
    RAISE EXCEPTION 'Unsupported status';
  END IF;
  UPDATE public.smart_sos_checks
     SET status = _status,
         resolved_at = now()
   WHERE id = _check_id AND user_id = auth.uid()
  RETURNING * INTO v_check;
  IF v_check.id IS NULL THEN
    RAISE EXCEPTION 'Safety check not found';
  END IF;
  INSERT INTO public.smart_sos_check_events (check_id, action, metadata)
  VALUES (_check_id, 'resolved_' || _status, COALESCE(_metadata, '{}'::jsonb));
  RETURN v_check;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_smart_sos_check(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_smart_sos_check(UUID, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.escalate_smart_sos_check(_check_id UUID, _confidence TEXT, _signals JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check public.smart_sos_checks;
  v_settings public.smart_sos_settings;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;
  SELECT * INTO v_check FROM public.smart_sos_checks
   WHERE id = _check_id AND user_id = auth.uid();
  IF v_check.id IS NULL THEN
    RAISE EXCEPTION 'Safety check not found';
  END IF;
  SELECT * INTO v_settings FROM public.smart_sos_settings WHERE user_id = auth.uid();
  IF v_settings.user_id IS NULL OR v_settings.enabled = false THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'smart_detection_disabled');
  END IF;
  IF v_settings.auto_escalation = false THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'auto_escalation_disabled');
  END IF;
  IF _confidence <> 'high' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'confidence_below_threshold');
  END IF;
  UPDATE public.smart_sos_checks
     SET status = 'escalated', confidence = 'high',
         signals = COALESCE(_signals, signals), resolved_at = now()
   WHERE id = _check_id;
  INSERT INTO public.smart_sos_check_events (check_id, action, metadata)
  VALUES (_check_id, 'auto_sos_authorized', jsonb_build_object('confidence', _confidence, 'signals', COALESCE(_signals, '{}'::jsonb)));
  RETURN jsonb_build_object('allowed', true, 'reason', 'threshold_reached');
END;
$$;
REVOKE ALL ON FUNCTION public.escalate_smart_sos_check(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalate_smart_sos_check(UUID, TEXT, JSONB) TO authenticated;