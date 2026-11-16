BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('emergency-chat-voice', 'emergency-chat-voice', false, 15728640)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 15728640;

DROP POLICY IF EXISTS "SOS room members upload voice notes" ON storage.objects;
CREATE POLICY "SOS room members upload voice notes"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'emergency-chat-voice'
  AND split_part(name, '/', 2) = auth.uid()::text
  AND public.can_access_sos_room(split_part(name, '/', 1)::uuid, auth.uid())
  AND coalesce(metadata->>'mimetype', '') LIKE 'audio/%'
);

DROP POLICY IF EXISTS "SOS room members read voice notes" ON storage.objects;
CREATE POLICY "SOS room members read voice notes"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'emergency-chat-voice'
  AND public.can_access_sos_room(split_part(name, '/', 1)::uuid, auth.uid())
);

DROP POLICY IF EXISTS "Voice note owners delete their uploads" ON storage.objects;
CREATE POLICY "Voice note owners delete their uploads"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'emergency-chat-voice'
  AND split_part(name, '/', 2) = auth.uid()::text
  AND public.can_access_sos_room(split_part(name, '/', 1)::uuid, auth.uid())
);

DROP POLICY IF EXISTS "room members post emergency chat" ON public.emergency_chat_events;
CREATE POLICY "room members post emergency chat"
ON public.emergency_chat_events
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND event_type IN ('user_message', 'voice_note')
  AND sos_session_id IS NOT NULL
  AND public.can_access_sos_room(sos_session_id, auth.uid())
);

COMMIT;
