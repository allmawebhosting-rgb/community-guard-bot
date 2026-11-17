-- SOS activation was rolling back because record_shared_sos_event() inserts
-- event_type values ('system', 'participant_joined') that the old check rejected.
-- Voice notes also need 'voice_note'. Widen the check and make the trigger
-- non-fatal so emergency activation cannot fail on chat logging.

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
        'voice_note'::text,
        'message'::text
      ]
    )
  );

CREATE OR REPLACE FUNCTION public.record_shared_sos_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_id uuid;
  participant_id uuid;
  linked_thread_id uuid;
  event_body text;
  person_name text;
  accepted boolean := false;
  event_kind text;
BEGIN
  IF TG_TABLE_NAME = 'safety_activity' THEN
    IF TG_OP = 'INSERT' AND NEW.activity_type = 'sos_activated' THEN
      session_id := NEW.id;
      participant_id := NEW.user_id;
      linked_thread_id := coalesce(NEW.thread_id, nullif(NEW.details->>'thread_id', '')::uuid);
      event_body := 'Emergency SOS activated. Safety Network notifications are starting.';
      event_kind := 'system';
    ELSIF TG_OP = 'UPDATE'
      AND OLD.activity_type = 'sos_activated'
      AND NEW.activity_type = 'sos_resolved' THEN
      session_id := NEW.id;
      participant_id := NEW.user_id;
      linked_thread_id := coalesce(NEW.thread_id, nullif(NEW.details->>'thread_id', '')::uuid);
      event_body := 'Emergency SOS ended. The conversation history is still available.';
      event_kind := 'system';
    ELSE
      RETURN NULL;
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'emergency_call_invitations' THEN
      session_id := NEW.emergency_id;
      participant_id := NEW.recipient_user_id;
      accepted := upper(NEW.status) = 'ACCEPTED'
        AND (TG_OP = 'INSERT' OR upper(OLD.status) IS DISTINCT FROM 'ACCEPTED');
    ELSIF TG_TABLE_NAME = 'sos_responder_offers' THEN
      session_id := NEW.sos_activity_id;
      participant_id := NEW.responder_id;
      accepted := lower(NEW.status) = 'accepted'
        AND (TG_OP = 'INSERT' OR lower(OLD.status) IS DISTINCT FROM 'accepted');
    ELSIF TG_TABLE_NAME = 'responder_assignments' THEN
      session_id := NEW.sos_session_id;
      SELECT cr.user_id INTO participant_id
      FROM public.community_responders cr
      WHERE cr.id = NEW.responder_profile_id;
      accepted := lower(NEW.status::text) IN (
        'accepted', 'en_route', 'arrived', 'assisting', 'need_official_help'
      ) AND (
        TG_OP = 'INSERT'
        OR lower(OLD.status::text) NOT IN (
          'accepted', 'en_route', 'arrived', 'assisting', 'need_official_help', 'completed'
        )
      );
    END IF;

    IF NOT accepted OR session_id IS NULL OR participant_id IS NULL THEN
      RETURN NULL;
    END IF;

    SELECT coalesce(a.thread_id, nullif(a.details->>'thread_id', '')::uuid)
      INTO linked_thread_id
    FROM public.safety_activity a
    WHERE a.id = session_id;

    IF linked_thread_id IS NULL THEN
      RETURN NULL;
    END IF;

    SELECT coalesce(p.full_name, 'A responder')
      INTO person_name
    FROM public.profiles p
    WHERE p.id = participant_id;
    event_body := coalesce(person_name, 'A responder') || ' joined the shared conversation.';
    event_kind := 'participant_joined';
  END IF;

  IF linked_thread_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.emergency_chat_events (
        sos_session_id, thread_id, author_id, event_type, body
      )
      VALUES (
        session_id,
        linked_thread_id,
        participant_id,
        event_kind,
        event_body
      )
      ON CONFLICT DO NOTHING;
    EXCEPTION
      WHEN others THEN
        -- Never block SOS activation / responder join on chat timeline logging.
        RAISE WARNING 'record_shared_sos_event skipped: %', SQLERRM;
    END;
  END IF;

  RETURN NULL;
END;
$$;
