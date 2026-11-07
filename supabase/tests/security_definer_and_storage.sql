-- Catalog and policy assertions only: this test does not read user records.
DO $$
DECLARE
  function_signature text;
  function_definition text;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.list_sos_call_targets()',
    'public.start_sos_emergency_call(uuid, uuid)',
    'public.list_sos_call_attempts(uuid)',
    'public.can_access_sos_room(uuid, uuid)',
    'public.upsert_member_presence(double precision, double precision, boolean)',
    'public.find_nearby_members(integer, double precision, double precision, integer)'
  ] LOOP
    IF has_function_privilege('anon', function_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon can execute %', function_signature;
    END IF;
    IF NOT has_function_privilege('authenticated', function_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated cannot execute %', function_signature;
    END IF;
  END LOOP;

  IF has_function_privilege('anon', 'public.get_voice_configuration()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_voice_configuration()', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_voice_configuration must remain service_role-only';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.get_voice_configuration()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must be able to execute get_voice_configuration';
  END IF;

  IF has_function_privilege('anon', 'public.claim_due_health_reminders(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_due_health_reminders(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ordinary roles must not execute claim_due_health_reminders';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.claim_due_health_reminders(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must be able to execute claim_due_health_reminders';
  END IF;

  SELECT pg_get_functiondef('public.can_access_sos_room(uuid, uuid)'::regprocedure)
  INTO function_definition;
  IF position('_user_id = auth.uid()' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'can_access_sos_room must only inspect the current caller';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'lost-found-public'
      AND file_size_limit = 5242880
      AND allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ) THEN
    RAISE EXCEPTION 'lost-found-public upload limits are missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public can upload lost item photos'
  ) THEN
    RAISE EXCEPTION 'legacy lost-found-photos anonymous upload policy remains active';
  END IF;
END $$;
