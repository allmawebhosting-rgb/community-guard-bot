-- Let the SOS caller audit invitations created for their own call rows.
CREATE POLICY "SOS callers view own invitations"
ON public.emergency_call_invitations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.emergency_calls c
    WHERE c.id = call_session_id
      AND c.caller_id = auth.uid()
  )
);