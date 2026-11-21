BEGIN;

-- Auditable push delivery attempts (no private emergency payloads).
CREATE TABLE IF NOT EXISTS public.notification_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  kind text NOT NULL,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id text NULL,
  stage text NOT NULL CHECK (
    stage IN (
      'queued',
      'no_devices',
      'provider_accepted',
      'provider_rejected',
      'failed',
      'skipped_duplicate'
    )
  ),
  provider text NOT NULL DEFAULT 'web_push',
  devices_targeted integer NOT NULL DEFAULT 0,
  devices_accepted integer NOT NULL DEFAULT 0,
  error_code text NULL,
  detail text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_delivery_attempts_idempotency_uidx
  ON public.notification_delivery_attempts (idempotency_key);

CREATE INDEX IF NOT EXISTS notification_delivery_attempts_recipient_created_idx
  ON public.notification_delivery_attempts (recipient_user_id, created_at DESC);

ALTER TABLE public.notification_delivery_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_delivery_attempts_owner_select ON public.notification_delivery_attempts;
CREATE POLICY notification_delivery_attempts_owner_select
  ON public.notification_delivery_attempts
  FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());

-- Idempotent in-app notification keys (optional column; unique when present).
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_idempotency_uidx
  ON public.notifications (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
