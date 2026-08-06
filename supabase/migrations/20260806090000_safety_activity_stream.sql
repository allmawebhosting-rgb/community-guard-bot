-- Unified citizen activity stream for the police integration-ready command center.
-- This is an internal queue. It does not contact or represent an official agency.
CREATE TABLE public.safety_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  title text NOT NULL,
  summary text,
  severity text NOT NULL DEFAULT 'info',
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  location_text text,
  latitude double precision,
  longitude double precision,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX safety_activity_created_idx ON public.safety_activity (created_at DESC);
CREATE INDEX safety_activity_type_idx ON public.safety_activity (activity_type, created_at DESC);
CREATE INDEX safety_activity_report_idx ON public.safety_activity (report_id);

GRANT SELECT, INSERT ON public.safety_activity TO authenticated;
GRANT ALL ON public.safety_activity TO service_role;
ALTER TABLE public.safety_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can add their own activity"
  ON public.safety_activity FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own activity"
  ON public.safety_activity FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Verified officers can view activity"
  ON public.safety_activity FOR SELECT TO authenticated
  USING (public.is_verified_officer(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_activity;