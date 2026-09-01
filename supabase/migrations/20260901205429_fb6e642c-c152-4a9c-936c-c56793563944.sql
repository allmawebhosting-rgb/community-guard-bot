DROP POLICY IF EXISTS "room members post emergency chat" ON public.emergency_chat_events;
CREATE POLICY "room members post emergency chat"
ON public.emergency_chat_events
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND event_type = 'user_message'
  AND sos_session_id IS NOT NULL
  AND public.can_access_sos_room(sos_session_id, auth.uid())
);