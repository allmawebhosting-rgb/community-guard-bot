BEGIN;

-- Keep reminder claims available only to the trusted backend role.
REVOKE ALL ON FUNCTION public.claim_due_health_reminders(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_health_reminders(integer) TO service_role;

-- Keep shared call history while removing the deleted account's identity.
ALTER TABLE public.emergency_calls
  ADD COLUMN IF NOT EXISTS caller_display_name text,
  ADD COLUMN IF NOT EXISTS recipient_display_name text,
  ALTER COLUMN caller_id DROP NOT NULL,
  ALTER COLUMN recipient_id DROP NOT NULL;

-- Retain dispatch measurements and timestamps, not free-text or identity links.
ALTER TABLE public.responder_assignments
  ALTER COLUMN responder_id DROP NOT NULL;

-- Publicly useful reports are retained but detached from the deleted account.
ALTER TABLE public.reports
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.lost_found_public_reports
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false,
  ALTER COLUMN contact_name DROP NOT NULL,
  ALTER COLUMN contact_phone DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.set_lost_found_report_submitter()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Never trust a client-supplied owner value.
  NEW.submitted_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lost_found_public_report_submitter
  ON public.lost_found_public_reports;
CREATE TRIGGER lost_found_public_report_submitter
  BEFORE INSERT ON public.lost_found_public_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_lost_found_report_submitter();

CREATE OR REPLACE FUNCTION public.prepare_user_account_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Null only the deleted participant. Do not change call status, timestamps,
  -- duration, or the surviving participant's relationship to the call.
  UPDATE public.emergency_calls
  SET caller_id = NULL,
      caller_display_name = 'Former Member'
  WHERE caller_id = OLD.id;

  UPDATE public.emergency_calls
  SET recipient_id = NULL,
      recipient_display_name = 'Former Member'
  WHERE recipient_id = OLD.id;

  -- Preserve dispatch metrics and time fields while stripping responder text
  -- and account/profile identifiers.
  UPDATE public.responder_assignments
  SET responder_id = NULL,
      responder_profile_id = NULL,
      notes = NULL,
      response_outcome = 'Anonymized'
  WHERE responder_id = OLD.id
     OR responder_profile_id IN (
       SELECT cr.id
       FROM public.community_responders cr
       WHERE cr.user_id = OLD.id
     );

  -- Preserve the public incident record without retaining direct contact data.
  UPDATE public.reports
  SET user_id = NULL,
      thread_id = NULL,
      is_anonymous = true,
      contact_name = NULL,
      contact_phone = NULL
  WHERE user_id = OLD.id;

  UPDATE public.safety_activity
  SET user_id = NULL
  WHERE user_id = OLD.id;

  -- New public lost-and-found reports carry an owner link. Keep the report and
  -- its matching photo, but remove the deleted member's direct contact details.
  UPDATE public.lost_found_public_reports
  SET submitted_by = NULL,
      is_anonymous = true,
      contact_name = 'Former Member',
      contact_phone = NULL
  WHERE submitted_by = OLD.id;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_user_account_deletion()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_lost_found_report_submitter()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prepare_user_account_deletion
  ON auth.users;
CREATE TRIGGER prepare_user_account_deletion
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.prepare_user_account_deletion();

-- One malformed or concurrently deleted reminder must not abort the batch.
CREATE OR REPLACE FUNCTION public.deliver_due_health_reminders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reminder public.health_reminders;
  delivered INTEGER := 0;
  settings public.health_reminder_settings;
BEGIN
  FOR reminder IN SELECT * FROM public.claim_due_health_reminders(100) LOOP
    BEGIN
      SELECT * INTO settings
      FROM public.health_reminder_settings
      WHERE user_id = reminder.user_id;

      IF settings.user_id IS NULL
         OR (settings.opted_in AND settings.notifications_enabled AND NOT settings.do_not_disturb) THEN
        INSERT INTO public.notifications (user_id, title, body, kind, link)
        VALUES (
          reminder.user_id,
          'ALLMA HEALTH REMINDER',
          'You have ' || lower(reminder.title) || ' on ' ||
            reminder.appointment_date::text || ' at ' ||
            left(reminder.appointment_time::text, 5) ||
            COALESCE(E'\n\n' || reminder.facility_optional, ''),
          'health_reminder',
          '/health-reminders'
        );
        delivered := delivered + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Skipping one health reminder after delivery failure (SQLSTATE %)', SQLSTATE;
    END;
  END LOOP;
  RETURN delivered;
END;
$$;
REVOKE ALL ON FUNCTION public.deliver_due_health_reminders()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_due_health_reminders() TO service_role;

-- Preserve the caller's SOS attempt list if a called member later deletes
-- their account. Keep the existing caller-only authorization.
DROP FUNCTION IF EXISTS public.list_sos_call_attempts(uuid);
CREATE FUNCTION public.list_sos_call_attempts(p_sos_activity_id uuid)
RETURNS TABLE(
  call_id uuid,
  recipient_id uuid,
  full_name text,
  avatar_url text,
  safety_role text,
  status text,
  created_at timestamptz,
  accepted_at timestamptz,
  connected_at timestamptz,
  ended_at timestamptz,
  duration integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.recipient_id,
    COALESCE(
      NULLIF(c.recipient_display_name, ''),
      NULLIF(p.full_name, ''),
      CASE WHEN c.recipient_id IS NULL THEN 'Former Member' ELSE 'Allma member' END
    ),
    p.avatar_url,
    COALESCE(sc.safety_role, 'Emergency contact'),
    c.status,
    c.created_at,
    c.accepted_at,
    c.connected_at,
    c.ended_at,
    c.duration
  FROM public.emergency_calls c
  LEFT JOIN public.profiles p ON p.id = c.recipient_id
  LEFT JOIN public.safety_connections sc
    ON sc.owner_id = c.caller_id AND sc.member_id = c.recipient_id
  WHERE c.sos_session_id = p_sos_activity_id
    AND c.caller_id = auth.uid()
  ORDER BY c.created_at ASC;
$$;
REVOKE ALL ON FUNCTION public.list_sos_call_attempts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_sos_call_attempts(uuid) TO authenticated;

-- The call-history RPC uses a LEFT JOIN so a deleted participant's call still
-- appears to the surviving participant with a generic label and no avatar.
DROP FUNCTION IF EXISTS public.list_my_calls(integer);
CREATE FUNCTION public.list_my_calls(p_limit integer DEFAULT 30)
RETURNS TABLE(
  id uuid,
  direction text,
  other_user_id uuid,
  full_name text,
  avatar_url text,
  status text,
  duration integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH calls AS (
    SELECT
      c.*,
      CASE WHEN c.caller_id = auth.uid() THEN 'outgoing' ELSE 'incoming' END AS call_direction,
      CASE WHEN c.caller_id = auth.uid() THEN c.recipient_id ELSE c.caller_id END AS other_id,
      CASE WHEN c.caller_id = auth.uid()
        THEN c.recipient_display_name ELSE c.caller_display_name END AS saved_name
    FROM public.emergency_calls c
    WHERE auth.uid() IS NOT NULL
      AND (c.caller_id = auth.uid() OR c.recipient_id = auth.uid())
    ORDER BY c.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)
  )
  SELECT
    c.id,
    c.call_direction,
    c.other_id,
    COALESCE(
      NULLIF(c.saved_name, ''),
      NULLIF(p.full_name, ''),
      CASE WHEN c.other_id IS NULL THEN 'Former Member' ELSE 'Allma member' END
    ),
    p.avatar_url,
    c.status,
    c.duration,
    c.created_at
  FROM calls c
  LEFT JOIN public.profiles p ON p.id = c.other_id
  ORDER BY c.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.list_my_calls(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_calls(integer) TO authenticated;

-- A recipient may still answer or end a retained call after its caller's
-- profile has been removed. Keep the original authorization and location rules.
DROP FUNCTION IF EXISTS public.get_emergency_call_context(uuid);
CREATE FUNCTION public.get_emergency_call_context(p_call_id uuid)
RETURNS TABLE(
  is_emergency boolean,
  caller_name text,
  caller_avatar_url text,
  emergency_type text,
  severity text,
  area text,
  location_shared boolean,
  location_requested boolean,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.sos_session_id IS NOT NULL,
    COALESCE(
      NULLIF(c.caller_display_name, ''),
      NULLIF(p.full_name, ''),
      CASE WHEN c.caller_id IS NULL THEN 'Former Member' ELSE 'Allma member' END
    ),
    p.avatar_url,
    COALESCE(sa.details ->> 'emergency_type', 'unspecified'),
    COALESCE(sa.severity, 'high'),
    CASE
      WHEN COALESCE((sa.details ->> 'location_consent')::boolean, true)
           AND sc.share_location_on_sos IS TRUE
        THEN CASE
          WHEN sa.latitude IS NOT NULL AND sa.longitude IS NOT NULL
            THEN COALESCE(NULLIF(sa.location_text, ''), 'Location shared')
          ELSE 'Acquiring caller GPS…'
        END
      ELSE 'Not shared with you'
    END,
    COALESCE((sa.details ->> 'location_consent')::boolean, true)
      AND sc.share_location_on_sos IS TRUE
      AND sa.latitude IS NOT NULL
      AND sa.longitude IS NOT NULL,
    COALESCE((sa.details ->> 'location_consent')::boolean, true)
      AND sc.share_location_on_sos IS TRUE,
    CASE
      WHEN COALESCE((sa.details ->> 'location_consent')::boolean, true)
           AND sc.share_location_on_sos IS TRUE
        THEN sa.latitude
      ELSE NULL
    END,
    CASE
      WHEN COALESCE((sa.details ->> 'location_consent')::boolean, true)
           AND sc.share_location_on_sos IS TRUE
        THEN sa.longitude
      ELSE NULL
    END,
    CASE
      WHEN COALESCE((sa.details ->> 'location_consent')::boolean, true)
           AND sc.share_location_on_sos IS TRUE
        THEN (sa.details ->> 'accuracy_m')::double precision
      ELSE NULL
    END
  FROM public.emergency_calls c
  LEFT JOIN public.profiles p ON p.id = c.caller_id
  LEFT JOIN public.safety_activity sa ON sa.id = c.sos_session_id
  LEFT JOIN public.safety_connections sc
    ON sc.owner_id = c.caller_id
   AND sc.member_id = auth.uid()
  WHERE c.id = p_call_id
    AND c.recipient_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_emergency_call_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_emergency_call_context(uuid) TO authenticated;

COMMIT;
