-- Voice notes (and any direct emergency_chat_events insert by a responder)
-- were rejected with "new row violates row-level security policy" even for
-- accepted room members. Root cause: the INSERT policies on
-- emergency_chat_events check the thread link with a direct EXISTS scan over
-- public.safety_activity, but that table's SELECT policies are owner-only,
-- so the scan finds no row for a responder and the check always fails.
-- The security-definer access helpers (can_access_sos_room and friends) all
-- return true for the same responder -- only the raw table scan is blind.
-- Fix: do the thread-link check inside a SECURITY DEFINER helper, the same
-- pattern as the other can_* helpers, and use it in both INSERT policies.
-- Every other condition is preserved exactly as it stands on the live DB.

BEGIN;

CREATE OR REPLACE FUNCTION public.sos_event_thread_linked(_sos_id uuid, _thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.safety_activity a
    WHERE a.id = _sos_id
      AND a.details->>'thread_id' = _thread_id::text
  )
$$;

REVOKE ALL ON FUNCTION public.sos_event_thread_linked(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sos_event_thread_linked(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "room members post emergency chat" ON public.emergency_chat_events;
CREATE POLICY "room members post emergency chat"
ON public.emergency_chat_events
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND event_type IN ('user_message', 'voice_note', 'system', 'participant_joined')
  AND sos_session_id IS NOT NULL
  AND public.can_access_sos_room(sos_session_id, auth.uid())
  AND (
    thread_id IS NULL
    OR (
      public.sos_event_thread_linked(sos_session_id, thread_id)
      AND public.can_access_sos_thread(thread_id, auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Active SOS participants may post room events" ON public.emergency_chat_events;
CREATE POLICY "Active SOS participants may post room events"
ON public.emergency_chat_events AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND event_type IN ('user_message', 'voice_note', 'system', 'participant_joined')
  AND sos_session_id IS NOT NULL
  AND public.can_write_sos_room(sos_session_id, auth.uid())
  AND (
    thread_id IS NULL
    OR (
      public.sos_event_thread_linked(sos_session_id, thread_id)
      AND public.can_write_sos_thread(thread_id, auth.uid())
    )
  )
);

COMMIT;
