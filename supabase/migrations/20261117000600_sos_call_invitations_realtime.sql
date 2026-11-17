-- SOS inbox listens to emergency_call_invitations over Realtime. Without this
-- publication, receivers only notice an invitation on a manual refresh — so
-- "ringing you now" and Call Centre alerts appear intermittently.
ALTER TABLE public.emergency_call_invitations REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_call_invitations;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;
