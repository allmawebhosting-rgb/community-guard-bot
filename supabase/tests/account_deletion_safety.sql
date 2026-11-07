-- Catalog-only assertions for isolated staging. This file does not delete users
-- or modify application data.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.claim_due_health_reminders(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_due_health_reminders(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ordinary roles can execute claim_due_health_reminders';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.claim_due_health_reminders(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute claim_due_health_reminders';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'emergency_calls'
      AND column_name IN ('caller_display_name', 'recipient_display_name')
    GROUP BY table_name
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'emergency call identity snapshots are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'prepare_user_account_deletion'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'account-deletion anonymization trigger is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lost_found_public_reports'
      AND column_name = 'submitted_by'
  ) THEN
    RAISE EXCEPTION 'public lost-and-found ownership link is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lost_found_public_reports'
      AND column_name = 'is_anonymous'
  ) THEN
    RAISE EXCEPTION 'public lost-and-found anonymization field is missing';
  END IF;
END $$;
