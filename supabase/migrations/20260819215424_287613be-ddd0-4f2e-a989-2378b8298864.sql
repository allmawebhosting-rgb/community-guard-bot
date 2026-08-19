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
  IF _confidence NOT IN ('medium', 'high') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'confidence_below_threshold');
  END IF;
  UPDATE public.smart_sos_checks
     SET status = 'escalated', confidence = _confidence,
         signals = COALESCE(_signals, signals), resolved_at = now()
   WHERE id = _check_id;
  INSERT INTO public.smart_sos_check_events (check_id, action, metadata)
  VALUES (_check_id, 'auto_sos_authorized', jsonb_build_object('confidence', _confidence, 'signals', COALESCE(_signals, '{}'::jsonb)));
  RETURN jsonb_build_object('allowed', true, 'reason', 'threshold_reached');
END;
$$;
REVOKE ALL ON FUNCTION public.escalate_smart_sos_check(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalate_smart_sos_check(UUID, TEXT, JSONB) TO authenticated;