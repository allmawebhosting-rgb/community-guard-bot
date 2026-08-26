CREATE TABLE public.emergency_call_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  emergency_id UUID NOT NULL REFERENCES public.safety_activity(id) ON DELETE CASCADE,
  call_session_id UUID NOT NULL REFERENCES public.emergency_calls(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (call_session_id, recipient_user_id)
);

CREATE INDEX emergency_call_invitations_emergency_idx ON public.emergency_call_invitations (emergency_id, status);
CREATE INDEX emergency_call_invitations_recipient_idx ON public.emergency_call_invitations (recipient_user_id, status);
ALTER TABLE public.emergency_call_invitations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.emergency_call_invitations TO authenticated;
GRANT ALL ON public.emergency_call_invitations TO service_role;

CREATE POLICY "Recipients view own emergency invitations" ON public.emergency_call_invitations
  FOR SELECT TO authenticated USING (recipient_user_id = auth.uid());
CREATE POLICY "Recipients update own emergency invitations" ON public.emergency_call_invitations
  FOR UPDATE TO authenticated USING (recipient_user_id = auth.uid()) WITH CHECK (recipient_user_id = auth.uid());
CREATE POLICY "SOS callers create own invitations" ON public.emergency_call_invitations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.safety_activity a WHERE a.id = emergency_id AND a.user_id = auth.uid() AND a.activity_type = 'sos_activated') AND EXISTS (SELECT 1 FROM public.emergency_calls c WHERE c.id = call_session_id AND c.sos_session_id = emergency_id AND c.caller_id = auth.uid() AND c.recipient_id = recipient_user_id));
CREATE POLICY "SOS callers update own invitations" ON public.emergency_call_invitations
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.emergency_calls c WHERE c.id = call_session_id AND c.caller_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.emergency_calls c WHERE c.id = call_session_id AND c.caller_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.accept_emergency_call_invitation(p_invitation_id UUID)
RETURNS TABLE (accepted BOOLEAN, call_session_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  invitation public.emergency_call_invitations;
  winner UUID;
BEGIN
  SELECT * INTO invitation
  FROM public.emergency_call_invitations
  WHERE id = p_invitation_id AND recipient_user_id = auth.uid()
  FOR UPDATE;
  IF invitation.id IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF invitation.status NOT IN ('PENDING', 'SENT', 'DELIVERED') THEN
    RETURN QUERY SELECT false, invitation.call_session_id;
    RETURN;
  END IF;
  SELECT id INTO winner
  FROM public.emergency_call_invitations
  WHERE emergency_id = invitation.emergency_id AND status = 'ACCEPTED'
  ORDER BY accepted_at LIMIT 1
  FOR UPDATE;
  IF winner IS NOT NULL THEN
    UPDATE public.emergency_call_invitations
       SET status = 'CANCELLED', cancelled_at = now(), updated_at = now()
     WHERE id = invitation.id;
    RETURN QUERY SELECT false, invitation.call_session_id;
    RETURN;
  END IF;
  UPDATE public.emergency_call_invitations
     SET status = 'ACCEPTED', accepted_at = now(), updated_at = now()
   WHERE id = invitation.id;
  UPDATE public.emergency_call_invitations
     SET status = 'CANCELLED', cancelled_at = now(), updated_at = now()
   WHERE emergency_id = invitation.emergency_id
     AND id <> invitation.id
     AND status IN ('PENDING', 'SENT', 'DELIVERED');
  RETURN QUERY SELECT true, invitation.call_session_id;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_emergency_call_invitation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_emergency_call_invitation(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_emergency_call_invitation_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER emergency_call_invitations_updated_at
  BEFORE UPDATE ON public.emergency_call_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_emergency_call_invitation_updated_at();
