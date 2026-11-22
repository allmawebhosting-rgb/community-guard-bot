-- Leave emergency was failing: leave_sos_room inserts an
-- emergency_chat_events row with event_type 'participant_left', but the
-- table's check constraint (last widened in 20261117000700) never listed
-- that value, so every leave attempt was rejected with
-- "violates check constraint emergency_chat_events_event_type_check".
-- Widen the check with the same list plus 'participant_left'.

ALTER TABLE public.emergency_chat_events
  DROP CONSTRAINT IF EXISTS emergency_chat_events_event_type_check;

ALTER TABLE public.emergency_chat_events
  ADD CONSTRAINT emergency_chat_events_event_type_check
  CHECK (
    event_type = ANY (
      ARRAY[
        'user_message'::text,
        'ai_message'::text,
        'system'::text,
        'system_event'::text,
        'official_notification'::text,
        'participant_joined'::text,
        'participant_left'::text,
        'voice_note'::text,
        'message'::text
      ]
    )
  );
