-- Emergency auto-contact of nearby health facilities.
-- Emergency emails are logged in email_sends with kind = 'emergency' so they never count
-- against the normal 20-per-day Gmail limit; they are capped per emergency run instead.
BEGIN;

ALTER TABLE public.email_sends
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS emergency_run_id uuid NULL;

ALTER TABLE public.email_sends DROP CONSTRAINT IF EXISTS email_sends_kind_check;
ALTER TABLE public.email_sends
  ADD CONSTRAINT email_sends_kind_check CHECK (kind IN ('normal', 'emergency'));

CREATE INDEX IF NOT EXISTS email_sends_emergency_run_idx
  ON public.email_sends (emergency_run_id)
  WHERE emergency_run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.emergency_contact_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NULL,
  sos_activity_id uuid NULL,
  trigger text NOT NULL CHECK (trigger IN ('chat', 'sos')),
  status text NOT NULL CHECK (status IN ('countdown', 'running', 'completed', 'cancelled', 'no_facilities', 'expired')),
  -- Set when the card is first shown, so the 10 s window is never used up by a slow reply.
  countdown_ends_at timestamptz NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS emergency_contact_runs_user_created_idx
  ON public.emergency_contact_runs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.emergency_contact_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.emergency_contact_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  channel text NOT NULL CHECK (channel IN ('call', 'email')),
  facility_name text NOT NULL,
  facility_address text NULL,
  distance_m integer NULL,
  destination text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'answered', 'no_answer', 'sent', 'failed', 'skipped', 'cancelled')),
  detail text NULL,
  provider_message_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS emergency_contact_actions_run_idx
  ON public.emergency_contact_actions (run_id, seq);

ALTER TABLE public.emergency_contact_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contact_actions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.emergency_contact_runs FROM anon, authenticated;
REVOKE ALL ON public.emergency_contact_actions FROM anon, authenticated;
GRANT SELECT ON public.emergency_contact_runs TO authenticated;
GRANT SELECT ON public.emergency_contact_actions TO authenticated;

DROP POLICY IF EXISTS "Users read own emergency runs" ON public.emergency_contact_runs;
CREATE POLICY "Users read own emergency runs"
  ON public.emergency_contact_runs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users read own emergency actions" ON public.emergency_contact_actions;
CREATE POLICY "Users read own emergency actions"
  ON public.emergency_contact_actions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

COMMIT;
