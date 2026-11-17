BEGIN;

ALTER TABLE public.emergency_chat_events
  ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

CREATE INDEX IF NOT EXISTS emergency_chat_events_thread_created_idx
  ON public.emergency_chat_events (thread_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_sos_per_chat_thread_idx
  ON public.safety_activity ((details->>'thread_id'))
  WHERE activity_type = 'sos_activated'
    AND sos_status = 'active'
    AND details->>'thread_id' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS emergency_chat_participant_join_once_idx
  ON public.emergency_chat_events (sos_session_id, author_id)
  WHERE event_type = 'participant_joined' AND author_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.can_access_sos_room(_sos_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(_user_id = auth.uid(), false)
    AND EXISTS (
      SELECT 1
      FROM public.safety_activity a
      WHERE a.id = _sos_id
        AND (
          a.user_id = _user_id
          OR EXISTS (
            SELECT 1
            FROM public.emergency_call_invitations i
            WHERE i.emergency_id = a.id
              AND i.recipient_user_id = _user_id
              AND upper(i.status) = 'ACCEPTED'
          )
          OR EXISTS (
            SELECT 1
            FROM public.sos_responder_offers o
            WHERE o.sos_activity_id = a.id
              AND o.responder_id = _user_id
              AND lower(o.status) = 'accepted'
          )
          OR EXISTS (
            SELECT 1
            FROM public.responder_assignments ra
            JOIN public.community_responders cr ON cr.id = ra.responder_profile_id
            WHERE ra.sos_session_id = a.id
              AND cr.user_id = _user_id
              AND lower(ra.status::text) IN (
                'accepted', 'en_route', 'arrived', 'assisting',
                'need_official_help', 'completed'
              )
          )
        )
    )
$$;

REVOKE ALL ON FUNCTION public.can_access_sos_room(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_sos_room(uuid, uuid) TO authenticated;

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
            WHERE a.details->>'thread_id' = t.id::text
              AND a.activity_type IN ('sos_activated', 'sos_resolved')
              AND public.can_access_sos_room(a.id, _user_id)
          )
        )
    )
$$;

REVOKE ALL ON FUNCTION public.can_access_sos_thread(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_sos_thread(uuid, uuid) TO authenticated;

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
    WHERE a.details->>'thread_id' = t.id::text
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

REVOKE ALL ON FUNCTION public.get_chat_thread_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_thread_context(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_sos_thread_for_activity(p_sos_activity_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.can_access_sos_room(a.id, auth.uid())
      THEN nullif(a.details->>'thread_id', '')::uuid
    ELSE NULL
  END
  FROM public.safety_activity a
  WHERE a.id = p_sos_activity_id
$$;

REVOKE ALL ON FUNCTION public.get_sos_thread_for_activity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sos_thread_for_activity(uuid) TO authenticated;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SOS participants read linked conversation messages" ON public.messages;
CREATE POLICY "SOS participants read linked conversation messages"
  ON public.messages FOR SELECT TO authenticated
  USING (public.can_access_sos_thread(thread_id, auth.uid()));

DROP POLICY IF EXISTS "SOS participants add linked conversation messages" ON public.messages;
CREATE POLICY "SOS participants add linked conversation messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.can_access_sos_thread(thread_id, auth.uid())
  );

DROP POLICY IF EXISTS "room members view emergency chat" ON public.emergency_chat_events;
CREATE POLICY "room members view emergency chat"
  ON public.emergency_chat_events FOR SELECT TO authenticated
  USING (
    public.can_access_sos_room(sos_session_id, auth.uid())
    AND (
      thread_id IS NULL
      OR public.can_access_sos_thread(thread_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "room members post emergency chat" ON public.emergency_chat_events;
CREATE POLICY "room members post emergency chat"
  ON public.emergency_chat_events FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND event_type IN ('user_message', 'voice_note')
    AND sos_session_id IS NOT NULL
    AND public.can_access_sos_room(sos_session_id, auth.uid())
    AND (
      thread_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.safety_activity a
        WHERE a.id = sos_session_id
          AND a.details->>'thread_id' = thread_id::text
          AND public.can_access_sos_thread(thread_id, auth.uid())
      )
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
BEGIN
  IF TG_TABLE_NAME = 'safety_activity' THEN
    IF TG_OP = 'INSERT' AND NEW.activity_type = 'sos_activated' THEN
      session_id := NEW.id;
      participant_id := NEW.user_id;
      linked_thread_id := nullif(NEW.details->>'thread_id', '')::uuid;
      event_body := 'Emergency SOS activated. Safety Network notifications are starting.';
    ELSIF TG_OP = 'UPDATE'
      AND OLD.activity_type = 'sos_activated'
      AND NEW.activity_type = 'sos_resolved' THEN
      session_id := NEW.id;
      participant_id := NEW.user_id;
      linked_thread_id := nullif(NEW.details->>'thread_id', '')::uuid;
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

    SELECT nullif(a.details->>'thread_id', '')::uuid
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

DROP TRIGGER IF EXISTS shared_sos_activation_event ON public.safety_activity;
CREATE TRIGGER shared_sos_activation_event
  AFTER INSERT ON public.safety_activity
  FOR EACH ROW EXECUTE FUNCTION public.record_shared_sos_event();

DROP TRIGGER IF EXISTS shared_sos_resolved_event ON public.safety_activity;
CREATE TRIGGER shared_sos_resolved_event
  AFTER UPDATE OF activity_type ON public.safety_activity
  FOR EACH ROW EXECUTE FUNCTION public.record_shared_sos_event();

DROP TRIGGER IF EXISTS shared_sos_contact_join_event ON public.emergency_call_invitations;
CREATE TRIGGER shared_sos_contact_join_event
  AFTER INSERT OR UPDATE OF status ON public.emergency_call_invitations
  FOR EACH ROW EXECUTE FUNCTION public.record_shared_sos_event();

DROP TRIGGER IF EXISTS shared_sos_offer_join_event ON public.sos_responder_offers;
CREATE TRIGGER shared_sos_offer_join_event
  AFTER INSERT OR UPDATE OF status ON public.sos_responder_offers
  FOR EACH ROW EXECUTE FUNCTION public.record_shared_sos_event();

DROP TRIGGER IF EXISTS shared_sos_assignment_join_event ON public.responder_assignments;
CREATE TRIGGER shared_sos_assignment_join_event
  AFTER INSERT OR UPDATE OF status ON public.responder_assignments
  FOR EACH ROW EXECUTE FUNCTION public.record_shared_sos_event();

ALTER TABLE public.messages REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMIT;
