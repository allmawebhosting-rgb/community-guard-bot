BEGIN;

-- Promote the soft chat↔ SOS link to a first-class column while keeping
-- details.thread_id as a mirrored compatibility field for older clients.
ALTER TABLE public.safety_activity
  ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL;

UPDATE public.safety_activity a
SET thread_id = nullif(a.details->>'thread_id', '')::uuid
WHERE a.thread_id IS NULL
  AND nullif(a.details->>'thread_id', '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS safety_activity_thread_id_idx
  ON public.safety_activity (thread_id)
  WHERE thread_id IS NOT NULL;

DROP INDEX IF EXISTS one_active_sos_per_chat_thread_idx;
CREATE UNIQUE INDEX one_active_sos_per_chat_thread_idx
  ON public.safety_activity (thread_id)
  WHERE activity_type = 'sos_activated'
    AND coalesce(sos_status::text, details->>'sos_status', 'active') = 'active'
    AND thread_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_safety_activity_thread_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.thread_id IS NULL AND NEW.details ? 'thread_id' THEN
    NEW.thread_id := nullif(NEW.details->>'thread_id', '')::uuid;
  END IF;
  IF NEW.thread_id IS NOT NULL THEN
    NEW.details := coalesce(NEW.details, '{}'::jsonb) || jsonb_build_object('thread_id', NEW.thread_id::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_safety_activity_thread_id ON public.safety_activity;
CREATE TRIGGER sync_safety_activity_thread_id
  BEFORE INSERT OR UPDATE OF thread_id, details ON public.safety_activity
  FOR EACH ROW EXECUTE FUNCTION public.sync_safety_activity_thread_id();

CREATE OR REPLACE FUNCTION public.can_access_sos_thread(_thread_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(_user_id = auth.uid(), false)
    AND EXISTS (
      SELECT 1
      FROM public.threads t
      WHERE t.id = _thread_id
        AND (
          t.user_id = _user_id
          OR EXISTS (
            SELECT 1
            FROM public.safety_activity a
            WHERE (
                a.thread_id = t.id
                OR a.details->>'thread_id' = t.id::text
              )
              AND a.activity_type IN ('sos_activated', 'sos_resolved')
              AND public.can_access_sos_room(a.id, _user_id)
          )
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.can_write_sos_thread(_thread_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(_user_id = auth.uid(), false)
    AND EXISTS (
      SELECT 1
      FROM public.threads t
      WHERE t.id = _thread_id
        AND (
          t.user_id = _user_id
          OR EXISTS (
            SELECT 1
            FROM public.safety_activity a
            WHERE (
                a.thread_id = t.id
                OR a.details->>'thread_id' = t.id::text
              )
              AND a.activity_type = 'sos_activated'
              AND coalesce(a.sos_status::text, a.details->>'sos_status', 'active') = 'active'
              AND public.can_write_sos_room(a.id, _user_id)
          )
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.get_chat_thread_context(p_thread_id uuid)
RETURNS TABLE (
  owner_id uuid,
  is_owner boolean,
  sos_activity_id uuid,
  sos_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.user_id,
    t.user_id = auth.uid(),
    latest.id,
    coalesce(latest.is_active, false)
  FROM public.threads t
  LEFT JOIN LATERAL (
    SELECT
      a.id,
      a.activity_type = 'sos_activated'
        AND coalesce(a.sos_status::text, a.details->>'sos_status', 'active') = 'active'
        AS is_active
    FROM public.safety_activity a
    WHERE (
        a.thread_id = t.id
        OR a.details->>'thread_id' = t.id::text
      )
      AND a.activity_type IN ('sos_activated', 'sos_resolved')
    ORDER BY a.created_at DESC
    LIMIT 1
  ) latest ON true
  WHERE t.id = p_thread_id
    AND (
      t.user_id = auth.uid()
      OR public.can_access_sos_thread(t.id, auth.uid())
    )
$$;

CREATE OR REPLACE FUNCTION public.get_sos_thread_for_activity(p_sos_activity_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.can_access_sos_room(a.id, auth.uid())
      THEN coalesce(a.thread_id, nullif(a.details->>'thread_id', '')::uuid)
    ELSE NULL
  END
  FROM public.safety_activity a
  WHERE a.id = p_sos_activity_id
$$;

-- Authorized responders need to read the conversation metadata for the shared UI.
DROP POLICY IF EXISTS "SOS participants can read linked threads" ON public.threads;
CREATE POLICY "SOS participants can read linked threads"
  ON public.threads FOR SELECT TO authenticated
  USING (public.can_access_sos_thread(id, auth.uid()));

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
BEGIN
  IF TG_TABLE_NAME = 'safety_activity' THEN
    IF TG_OP = 'INSERT' AND NEW.activity_type = 'sos_activated' THEN
      session_id := NEW.id;
      participant_id := NEW.user_id;
      linked_thread_id := coalesce(NEW.thread_id, nullif(NEW.details->>'thread_id', '')::uuid);
      event_body := 'Emergency SOS activated. Safety Network notifications are starting.';
    ELSIF TG_OP = 'UPDATE'
      AND OLD.activity_type = 'sos_activated'
      AND NEW.activity_type = 'sos_resolved' THEN
      session_id := NEW.id;
      participant_id := NEW.user_id;
      linked_thread_id := coalesce(NEW.thread_id, nullif(NEW.details->>'thread_id', '')::uuid);
      event_body := 'Emergency SOS ended. The conversation history is still available.';
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
  END IF;

  IF linked_thread_id IS NOT NULL THEN
    INSERT INTO public.emergency_chat_events (
      sos_session_id, thread_id, author_id, event_type, body
    )
    VALUES (
      session_id,
      linked_thread_id,
      participant_id,
      CASE
        WHEN event_body LIKE '%joined the shared conversation.' THEN 'participant_joined'
        ELSE 'system'
      END,
      event_body
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END
$$;

ALTER TABLE public.messages REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMIT;
