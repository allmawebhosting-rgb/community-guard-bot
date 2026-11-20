BEGIN;

-- Live project may have claimed SOS RPCs without this table if an earlier
-- parallel-claim migration never applied. Required by claim_sos_emergency_call.

CREATE TABLE IF NOT EXISTS public.sos_call_winners (
  sos_activity_id uuid PRIMARY KEY REFERENCES public.safety_activity(id) ON DELETE CASCADE,
  call_id uuid NOT NULL UNIQUE REFERENCES public.emergency_calls(id) ON DELETE CASCADE,
  responder_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sos_call_winners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sos_call_winners FROM PUBLIC, anon, authenticated;

COMMIT;
