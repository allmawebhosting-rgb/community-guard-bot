CREATE TABLE public.health_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('doctor_visit', 'hospital_appointment', 'follow_up', 'medication', 'routine_check', 'other')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  health_context_optional TEXT CHECK (health_context_optional IS NULL OR char_length(health_context_optional) <= 240),
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Africa/Kampala',
  facility_optional TEXT CHECK (facility_optional IS NULL OR char_length(facility_optional) <= 160),
  notes_optional TEXT CHECK (notes_optional IS NULL OR char_length(notes_optional) <= 1000),
  reminder_schedule JSONB NOT NULL DEFAULT '["1_day_before"]'::jsonb,
  notification_enabled BOOLEAN NOT NULL DEFAULT true,
  call_enabled BOOLEAN NOT NULL DEFAULT false,
  call_time TIME,
  recurrence JSONB NOT NULL DEFAULT '{"type":"none"}'::jsonb,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'SENT', 'ACKNOWLEDGED', 'COMPLETED', 'RESCHEDULED', 'CANCELLED', 'MISSED')),
  next_delivery_at TIMESTAMPTZ,
  last_delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT health_reminders_call_consent CHECK (call_enabled = false OR call_time IS NOT NULL),
  CONSTRAINT health_reminders_schedule_array CHECK (jsonb_typeof(reminder_schedule) = 'array')
);

CREATE INDEX health_reminders_user_status_idx ON public.health_reminders (user_id, status, appointment_date, appointment_time);
CREATE INDEX health_reminders_due_idx ON public.health_reminders (next_delivery_at) WHERE status = 'SCHEDULED';

CREATE TABLE public.health_reminder_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  calls_enabled BOOLEAN NOT NULL DEFAULT false,
  do_not_disturb BOOLEAN NOT NULL DEFAULT false,
  call_window_start TIME NOT NULL DEFAULT '08:00',
  call_window_end TIME NOT NULL DEFAULT '20:00',
  opted_in BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.health_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_reminder_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_reminders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_reminder_settings TO authenticated;
GRANT ALL ON public.health_reminders TO service_role;
GRANT ALL ON public.health_reminder_settings TO service_role;

CREATE POLICY "Users manage own health reminders" ON public.health_reminders
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own health reminder settings" ON public.health_reminder_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.claim_due_health_reminders(p_limit INTEGER DEFAULT 100)
RETURNS SETOF public.health_reminders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.health_reminders
     SET status = 'SENT', last_delivered_at = now(), updated_at = now()
   WHERE id IN (
     SELECT id
       FROM public.health_reminders
      WHERE status = 'SCHEDULED'
        AND next_delivery_at IS NOT NULL
        AND next_delivery_at <= now()
      ORDER BY next_delivery_at
      FOR UPDATE SKIP LOCKED
      LIMIT greatest(1, least(p_limit, 500))
   )
  RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_due_health_reminders(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_health_reminders(INTEGER) TO service_role;

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
    SELECT * INTO settings FROM public.health_reminder_settings WHERE user_id = reminder.user_id;
    IF settings.user_id IS NULL OR (settings.opted_in AND settings.notifications_enabled AND NOT settings.do_not_disturb) THEN
      INSERT INTO public.notifications (user_id, title, body, kind, link)
      VALUES (
        reminder.user_id,
        'ALLMA HEALTH REMINDER',
        'You have ' || lower(reminder.title) || ' on ' || reminder.appointment_date::text || ' at ' || left(reminder.appointment_time::text, 5) || COALESCE(E'\n\n' || reminder.facility_optional, ''),
        'health_reminder',
        '/health-reminders'
      );
      delivered := delivered + 1;
    END IF;
  END LOOP;
  RETURN delivered;
END;
$$;
REVOKE ALL ON FUNCTION public.deliver_due_health_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_due_health_reminders() TO service_role;

-- Supabase's managed scheduler keeps reminders working when the app is closed.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('allma-health-reminders-every-minute', '* * * * *', 'SELECT public.deliver_due_health_reminders();')
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'allma-health-reminders-every-minute');

CREATE OR REPLACE FUNCTION public.set_health_reminder_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER health_reminders_updated_at
  BEFORE UPDATE ON public.health_reminders
  FOR EACH ROW EXECUTE FUNCTION public.set_health_reminder_updated_at();

CREATE TRIGGER health_reminder_settings_updated_at
  BEFORE UPDATE ON public.health_reminder_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_health_reminder_updated_at();
