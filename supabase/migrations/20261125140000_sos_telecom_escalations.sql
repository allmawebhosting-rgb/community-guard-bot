BEGIN;

-- Session-level GSM/SMS offline fallback (Africa's Talking / Twilio).
-- Never stores raw phone numbers — only contact display names and phone hashes.
CREATE TABLE IF NOT EXISTS public.sos_telecom_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_activity_id uuid NOT NULL REFERENCES public.safety_activity(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (
    status IN (
      'queued',
      'dialing',
      'completed',
      'partial',
      'failed',
      'skipped_duplicate',
      'not_configured'
    )
  ),
  provider text NULL,
  contacts_targeted integer NOT NULL DEFAULT 0,
  calls_queued integer NOT NULL DEFAULT 0,
  sms_queued integer NOT NULL DEFAULT 0,
  detail text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sos_telecom_escalations_idempotency_uidx
  ON public.sos_telecom_escalations (idempotency_key);

CREATE INDEX IF NOT EXISTS sos_telecom_escalations_activity_idx
  ON public.sos_telecom_escalations (sos_activity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sos_telecom_contact_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id uuid NOT NULL REFERENCES public.sos_telecom_escalations(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  phone_hash text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('voice', 'sms')),
  stage text NOT NULL CHECK (
    stage IN (
      'queued',
      'dialing',
      'provider_accepted',
      'provider_rejected',
      'failed',
      'skipped_blocked'
    )
  ),
  provider text NULL,
  provider_ref text NULL,
  error_code text NULL,
  detail text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sos_telecom_contact_attempts_escalation_idx
  ON public.sos_telecom_contact_attempts (escalation_id, created_at DESC);

ALTER TABLE public.sos_telecom_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_telecom_contact_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sos_telecom_escalations_owner_select ON public.sos_telecom_escalations;
CREATE POLICY sos_telecom_escalations_owner_select
  ON public.sos_telecom_escalations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS sos_telecom_contact_attempts_owner_select ON public.sos_telecom_contact_attempts;
CREATE POLICY sos_telecom_contact_attempts_owner_select
  ON public.sos_telecom_contact_attempts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sos_telecom_escalations e
      WHERE e.id = escalation_id
        AND e.user_id = auth.uid()
    )
  );

COMMIT;
