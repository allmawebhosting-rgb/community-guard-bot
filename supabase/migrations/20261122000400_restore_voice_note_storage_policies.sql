-- Repair: the live database is missing the three PERMISSIVE storage
-- policies for the emergency-chat-voice bucket that migration
-- 20261116000100_in_chat_sos_voice_notes.sql defines. Only the RESTRICTIVE
-- policy from 20261117000300 is present, so no permissive policy grants
-- INSERT into the bucket and every voice-note upload fails with
-- "new row violates row-level security policy" (verified live
-- 2026-11-22: zero voice_note events have ever been recorded).
-- This restores the three policies verbatim from 20261116000100.
-- Idempotent: DROP IF EXISTS + CREATE, safe if re-applied.

BEGIN;

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

COMMIT;
