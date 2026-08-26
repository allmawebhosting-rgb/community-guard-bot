ALTER TABLE public.emergency_calls DROP CONSTRAINT IF EXISTS emergency_calls_status_check;
ALTER TABLE public.emergency_calls ADD CONSTRAINT emergency_calls_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'initiating'::text, 'calling'::text, 'ringing'::text,
    'accepted'::text, 'connecting'::text, 'connected'::text, 'declined'::text,
    'no_answer'::text, 'busy'::text, 'missed'::text, 'failed'::text, 'ended'::text
  ]));