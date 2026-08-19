ALTER TABLE public.emergency_calls
  ADD COLUMN IF NOT EXISTS twilio_call_sid text,
  ADD COLUMN IF NOT EXISTS twilio_from_identity text,
  ADD COLUMN IF NOT EXISTS twilio_to_identity text;