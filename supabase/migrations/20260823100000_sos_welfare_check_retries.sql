CREATE TABLE public.sos_welfare_checks (
  sos_activity_id UUID NOT NULL PRIMARY KEY REFERENCES public.safety_activity(id) ON DELETE CASCADE,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sos_welfare_checks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.sos_welfare_checks TO authenticated;
GRANT ALL ON public.sos_welfare_checks TO service_role;

CREATE POLICY "SOS owner can view welfare check" ON public.sos_welfare_checks
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.safety_activity a WHERE a.id = sos_activity_id AND a.user_id = auth.uid()));
CREATE POLICY "Authorized responder can view welfare check" ON public.sos_welfare_checks
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.emergency_calls c WHERE c.sos_session_id = sos_activity_id AND c.recipient_id = auth.uid()));
CREATE POLICY "Authorized responder can confirm welfare check" ON public.sos_welfare_checks
  FOR INSERT TO authenticated
  WITH CHECK (confirmed_by = auth.uid() AND EXISTS (SELECT 1 FROM public.emergency_calls c WHERE c.sos_session_id = sos_activity_id AND c.recipient_id = auth.uid()));
CREATE POLICY "Authorized responder can update welfare check" ON public.sos_welfare_checks
  FOR UPDATE TO authenticated
  USING (confirmed_by = auth.uid() OR EXISTS (SELECT 1 FROM public.emergency_calls c WHERE c.sos_session_id = sos_activity_id AND c.recipient_id = auth.uid()))
  WITH CHECK (confirmed_by = auth.uid());

ALTER TABLE public.sos_welfare_checks REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_welfare_checks;

CREATE OR REPLACE FUNCTION public.confirm_sos_welfare_check(p_sos_activity_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.emergency_calls c
    WHERE c.sos_session_id = p_sos_activity_id
      AND c.recipient_id = auth.uid()
      AND c.status IN ('connected', 'accepted', 'ended')
  ) THEN
    RAISE EXCEPTION 'Only an authorized responder can confirm this welfare check';
  END IF;
  INSERT INTO public.sos_welfare_checks (sos_activity_id, confirmed_by, confirmed_at)
  VALUES (p_sos_activity_id, auth.uid(), now())
  ON CONFLICT (sos_activity_id) DO UPDATE
    SET confirmed_by = EXCLUDED.confirmed_by, confirmed_at = EXCLUDED.confirmed_at;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_sos_welfare_check(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_sos_welfare_check(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_sos_welfare_check_on_arrival()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  responder_user UUID;
BEGIN
  IF NEW.sos_session_id IS NULL OR NEW.status NOT IN ('arrived', 'assisting', 'completed') THEN
    RETURN NEW;
  END IF;
  SELECT user_id INTO responder_user
  FROM public.community_responders
  WHERE id = NEW.responder_profile_id;
  IF responder_user IS NOT NULL THEN
    INSERT INTO public.sos_welfare_checks (sos_activity_id, confirmed_by, confirmed_at)
    VALUES (NEW.sos_session_id, responder_user, now())
    ON CONFLICT (sos_activity_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER responder_arrival_confirms_sos_welfare
  AFTER UPDATE OF status ON public.responder_assignments
  FOR EACH ROW EXECUTE FUNCTION public.record_sos_welfare_check_on_arrival();
