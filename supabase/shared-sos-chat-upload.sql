-- Allma shared SOS chat: manual upload bundle for Supabase SQL Editor.
-- Sources, applied in order: 20261117000100, 20261117000200, 20261117000300.
-- Prerequisites: earlier SOS migrations and base tables must already exist.
-- This bundle does not update Supabase CLI migration history.

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.threads') IS NULL OR to_regclass('public.messages') IS NULL OR to_regclass('public.safety_activity') IS NULL OR to_regclass('public.emergency_chat_events') IS NULL OR to_regclass('public.emergency_call_invitations') IS NULL OR to_regclass('public.sos_responder_offers') IS NULL OR to_regclass('public.responder_assignments') IS NULL OR to_regclass('public.community_responders') IS NULL OR to_regclass('public.profiles') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'Shared SOS prerequisites are missing. Apply the earlier Supabase migrations before this script.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'safety_activity' AND column_name = 'sos_status') THEN
    RAISE EXCEPTION 'safety_activity.sos_status is missing. Apply the earlier SOS migrations before this script.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.safety_activity WHERE activity_type = 'sos_activated' AND sos_status = 'active' AND details->>'thread_id' IS NOT NULL GROUP BY details->>'thread_id' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Multiple active SOS sessions share a chat thread; resolve duplicates before applying this script.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.emergency_chat_events WHERE event_type = 'participant_joined' AND author_id IS NOT NULL GROUP BY sos_session_id, author_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate responder-join events exist; resolve duplicates before applying this script.';
  END IF;
END
$preflight$;

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

CREATE OR REPLACE FUNCTION public.get_sos_room(p_sos_id uuid)
RETURNS TABLE (
  sos_activity_id uuid,
  owner_id uuid,
  sender_name text,
  sender_avatar_url text,
  emergency_type text,
  severity text,
  area text,
  created_at timestamptz,
  is_mine boolean,
  location_shared boolean,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  participants jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.user_id,
    coalesce(p.full_name, 'Allma member'),
    p.avatar_url,
    coalesce(a.details->>'emergency_type', 'other'),
    coalesce(a.severity, 'critical'),
    coalesce(nullif(a.location_text, ''), 'Location pending'),
    a.created_at,
    a.user_id = auth.uid(),
    a.latitude IS NOT NULL AND a.longitude IS NOT NULL,
    a.latitude,
    a.longitude,
    nullif(a.details->>'accuracy_m', '')::double precision,
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'user_id', members.member_id,
          'name', coalesce(member_profile.full_name, 'Allma member'),
          'avatar_url', member_profile.avatar_url,
          'role', members.member_role
        )
        ORDER BY coalesce(member_profile.full_name, 'Allma member')
      )
      FROM (
        SELECT
          accepted.member_id,
          CASE
            WHEN bool_or(accepted.member_role = 'responder') THEN 'responder'
            ELSE 'contact'
          END AS member_role
        FROM (
          SELECT i.recipient_user_id AS member_id, 'contact'::text AS member_role
          FROM public.emergency_call_invitations i
          WHERE i.emergency_id = a.id
            AND upper(i.status) = 'ACCEPTED'
          UNION ALL
          SELECT o.responder_id, 'responder'::text
          FROM public.sos_responder_offers o
          WHERE o.sos_activity_id = a.id
            AND lower(o.status) = 'accepted'
          UNION ALL
          SELECT cr.user_id, 'responder'::text
          FROM public.responder_assignments ra
          JOIN public.community_responders cr ON cr.id = ra.responder_profile_id
          WHERE ra.sos_session_id = a.id
            AND lower(ra.status::text) IN (
              'accepted', 'en_route', 'arrived', 'assisting',
              'need_official_help', 'completed'
            )
        ) accepted
        WHERE accepted.member_id IS NOT NULL
          AND accepted.member_id <> a.user_id
        GROUP BY accepted.member_id
      ) members
      LEFT JOIN public.profiles member_profile ON member_profile.id = members.member_id
    ), '[]'::jsonb)
  FROM public.safety_activity a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.id = p_sos_id
    AND public.can_access_sos_room(p_sos_id, auth.uid())
$$;

REVOKE ALL ON FUNCTION public.get_sos_room(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sos_room(uuid) TO authenticated;

-- Keep accepted responders' history access after resolution, but stop new
-- messages and recordings once the owner ends the emergency.
CREATE OR REPLACE FUNCTION public.can_write_sos_room(_sos_id uuid, _user_id uuid)
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
        AND a.activity_type = 'sos_activated'
        AND coalesce(a.sos_status::text, a.details->>'sos_status', 'active') = 'active'
        AND public.can_access_sos_room(a.id, _user_id)
    )
$$;

REVOKE ALL ON FUNCTION public.can_write_sos_room(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_sos_room(uuid, uuid) TO authenticated;

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
          -- The conversation owner can continue their private AI chat after SOS ends.
          t.user_id = _user_id
          OR EXISTS (
            SELECT 1
            FROM public.safety_activity a
            WHERE a.details->>'thread_id' = t.id::text
              AND a.activity_type = 'sos_activated'
              AND coalesce(a.sos_status::text, a.details->>'sos_status', 'active') = 'active'
              AND public.can_write_sos_room(a.id, _user_id)
          )
        )
    )
$$;

REVOKE ALL ON FUNCTION public.can_write_sos_thread(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_sos_thread(uuid, uuid) TO authenticated;

-- Restrictive policies add the active-session requirement even if another
-- permissive policy exists for these tables.
DROP POLICY IF EXISTS "Active SOS participants may write linked chat messages" ON public.messages;
CREATE POLICY "Active SOS participants may write linked chat messages"
  ON public.messages AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.can_write_sos_thread(thread_id, auth.uid())
  );

DROP POLICY IF EXISTS "Active SOS participants may post room events" ON public.emergency_chat_events;
CREATE POLICY "Active SOS participants may post room events"
  ON public.emergency_chat_events AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND event_type IN ('user_message', 'voice_note')
    AND sos_session_id IS NOT NULL
    AND public.can_write_sos_room(sos_session_id, auth.uid())
    AND (
      thread_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.safety_activity a
        WHERE a.id = sos_session_id
          AND a.details->>'thread_id' = thread_id::text
          AND public.can_write_sos_thread(thread_id, auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Active SOS participants may upload voice notes" ON storage.objects;
CREATE POLICY "Active SOS participants may upload voice notes"
  ON storage.objects AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'emergency-chat-voice'
    OR (
      split_part(name, '/', 2) = auth.uid()::text
      AND public.can_write_sos_room(split_part(name, '/', 1)::uuid, auth.uid())
      AND coalesce(metadata->>'mimetype', '') LIKE 'audio/%'
    )
  );

COMMIT;
