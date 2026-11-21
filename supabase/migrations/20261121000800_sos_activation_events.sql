BEGIN;

-- Auditable SOS activation diagnostics (no free-text PII / no GPS).
CREATE TABLE IF NOT EXISTS public.sos_activation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NULL REFERENCES public.threads(id) ON DELETE SET NULL,
  activity_id uuid NULL REFERENCES public.safety_activity(id) ON DELETE SET NULL,
  stage text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure', 'retry')),
  error_code text NULL,
  detail text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sos_activation_events_user_created_idx
  ON public.sos_activation_events (user_id, created_at DESC);

ALTER TABLE public.sos_activation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sos_activation_events_owner_select ON public.sos_activation_events;
CREATE POLICY sos_activation_events_owner_select
  ON public.sos_activation_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS sos_activation_events_owner_insert ON public.sos_activation_events;
CREATE POLICY sos_activation_events_owner_insert
  ON public.sos_activation_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

COMMIT;
