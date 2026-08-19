-- Replace Twilio metadata with the unique ZEGOCLOUD room/session relationship.
ALTER TABLE public.emergency_calls
  ADD COLUMN IF NOT EXISTS zego_room_id text,
  ADD COLUMN IF NOT EXISTS zego_session_id text;

CREATE UNIQUE INDEX IF NOT EXISTS emergency_calls_zego_room_id_key
  ON public.emergency_calls (zego_room_id)
  WHERE zego_room_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS emergency_calls_zego_session_id_idx
  ON public.emergency_calls (zego_session_id)
  WHERE zego_session_id IS NOT NULL;

ALTER TABLE public.emergency_calls
  DROP COLUMN IF EXISTS twilio_call_sid,
  DROP COLUMN IF EXISTS twilio_from_identity,
  DROP COLUMN IF EXISTS twilio_to_identity;
