BEGIN;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. These
-- account-scoped RPCs must be callable only by signed-in users.
REVOKE ALL ON FUNCTION public.list_sos_call_targets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_sos_call_targets() TO authenticated;

REVOKE ALL ON FUNCTION public.start_sos_emergency_call(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_sos_emergency_call(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_sos_call_attempts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_sos_call_attempts(uuid) TO authenticated;

-- This configuration RPC is used only by trusted server-side code.
REVOKE ALL ON FUNCTION public.get_voice_configuration() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_voice_configuration() TO service_role;

-- This helper is exposed to authenticated clients for RLS checks. Prevent it
-- from being used as a membership oracle for another user's SOS rooms.
CREATE OR REPLACE FUNCTION public.can_access_sos_room(_sos_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(_user_id = auth.uid(), false)
    AND (
      EXISTS (
        SELECT 1 FROM public.safety_activity a
        WHERE a.id = _sos_id AND a.user_id = _user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.emergency_call_invitations i
        WHERE i.emergency_id = _sos_id AND i.recipient_user_id = _user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.emergency_calls c
        WHERE c.sos_session_id = _sos_id AND c.recipient_id = _user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.sos_responder_offers o
        WHERE o.sos_activity_id = _sos_id AND o.responder_id = _user_id
      )
    )
$$;
REVOKE ALL ON FUNCTION public.can_access_sos_room(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_sos_room(uuid, uuid) TO authenticated;

-- This room-membership helper writes only for the authenticated identity.
REVOKE ALL ON FUNCTION public.upsert_member_presence(double precision, double precision, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_member_presence(double precision, double precision, boolean)
  TO authenticated;

REVOKE ALL ON FUNCTION public.find_nearby_members(integer, double precision, double precision, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_nearby_members(integer, double precision, double precision, integer)
  TO authenticated;

-- Keep the public lost-and-found bucket useful while enforcing server-side
-- size and MIME limits that match the current upload UI.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lost-found-public',
  'lost-found-public',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- Public buckets remain downloadable by URL, but listing all object names is
-- not needed by the app and would expose a bucket-wide inventory.
DROP POLICY IF EXISTS "Anyone can view lost found photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload lost found photos" ON storage.objects;
CREATE POLICY "Anyone can upload lost found photos"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'lost-found-public'
    AND name LIKE 'public/%'
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
    AND metadata->>'mimetype' IN ('image/jpeg', 'image/png', 'image/webp')
  );

-- The legacy bucket is no longer used by the app. Preserve its objects, but
-- stop anonymous writes and limit reads to verified officers.
DROP POLICY IF EXISTS "Public can upload lost item photos" ON storage.objects;
DROP POLICY IF EXISTS "Officers can view lost item photos" ON storage.objects;
CREATE POLICY "Verified officers can view legacy lost item photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'lost-found-photos'
    AND EXISTS (
      SELECT 1 FROM public.officer_profiles p
      WHERE p.user_id = auth.uid()
        AND p.verification_status = 'verified'
    )
  );

COMMIT;
