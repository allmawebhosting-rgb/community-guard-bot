BEGIN;

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
