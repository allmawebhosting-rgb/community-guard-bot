-- ===== ENUMS =====
CREATE TYPE public.officer_rank AS ENUM (
  'inspector_general','deputy_inspector_general','director','regional_commander',
  'district_commander','division_commander','station_commander','operations_officer',
  'investigator','cid_officer','traffic_officer','patrol_officer','dispatch_officer',
  'community_liaison_officer','call_centre_officer','evidence_officer','read_only',
  'system_administrator'
);

CREATE TYPE public.officer_status AS ENUM ('pending','verified','suspended','rejected');
CREATE TYPE public.duty_status AS ENUM ('offline','available','on_duty','en_route','on_scene','unavailable');
CREATE TYPE public.incident_priority AS ENUM ('critical','high','medium','low');
CREATE TYPE public.dispatch_status AS ENUM ('assigned','notified','en_route','on_scene','completed','reassigned','cancelled');

-- ===== POLICE STATIONS =====
CREATE TABLE public.police_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  district text NOT NULL,
  region text NOT NULL,
  sub_county text,
  parish text,
  village text,
  latitude double precision,
  longitude double precision,
  coverage_area text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.police_stations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.police_stations TO authenticated;
GRANT ALL ON public.police_stations TO service_role;
ALTER TABLE public.police_stations ENABLE ROW LEVEL SECURITY;

-- ===== OFFICER PROFILES =====
CREATE TABLE public.officer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  badge_number text UNIQUE,
  rank public.officer_rank,
  force_id text,
  phone text,
  official_email text,
  photo_url text,
  station_id uuid REFERENCES public.police_stations(id) ON DELETE SET NULL,
  jurisdiction_level text,
  jurisdiction_area text,
  notification_prefs jsonb NOT NULL DEFAULT '{"desktop":true,"sms":false,"email":true,"push":true,"scope":"critical"}'::jsonb,
  onboarding_step int NOT NULL DEFAULT 1,
  onboarding_completed boolean NOT NULL DEFAULT false,
  status public.officer_status NOT NULL DEFAULT 'pending',
  duty_status public.duty_status NOT NULL DEFAULT 'offline',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.officer_profiles TO authenticated;
GRANT ALL ON public.officer_profiles TO service_role;
ALTER TABLE public.officer_profiles ENABLE ROW LEVEL SECURITY;

-- helper: verified officer
CREATE OR REPLACE FUNCTION public.is_verified_officer(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.officer_profiles
    WHERE user_id = _user_id AND status = 'verified' AND onboarding_completed = true
  )
$$;

CREATE OR REPLACE FUNCTION public.is_command_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin') OR EXISTS (
    SELECT 1 FROM public.officer_profiles
    WHERE user_id = _user_id AND status = 'verified'
      AND rank IN ('inspector_general','deputy_inspector_general','director',
                   'regional_commander','district_commander','division_commander',
                   'station_commander','system_administrator')
  )
$$;

-- stations policies
CREATE POLICY "Anyone can read stations" ON public.police_stations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Command staff manage stations" ON public.police_stations FOR ALL TO authenticated
  USING (public.is_command_staff(auth.uid())) WITH CHECK (public.is_command_staff(auth.uid()));

-- officer profile policies
CREATE POLICY "Officers manage own profile" ON public.officer_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Officers view directory" ON public.officer_profiles FOR SELECT TO authenticated
  USING (public.is_verified_officer(auth.uid()));
CREATE POLICY "Command staff manage officers" ON public.officer_profiles FOR UPDATE TO authenticated
  USING (public.is_command_staff(auth.uid())) WITH CHECK (public.is_command_staff(auth.uid()));

-- ===== REPORTS: incident/command fields =====
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS priority public.incident_priority NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_suggested_category text,
  ADD COLUMN IF NOT EXISTS ai_recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_possible_duplicate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES public.police_stations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_officer_id uuid REFERENCES public.officer_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE POLICY "Officers view all reports" ON public.reports FOR SELECT TO authenticated
  USING (public.is_verified_officer(auth.uid()));
CREATE POLICY "Officers update reports" ON public.reports FOR UPDATE TO authenticated
  USING (public.is_verified_officer(auth.uid())) WITH CHECK (public.is_verified_officer(auth.uid()));

CREATE POLICY "Officers view all evidence" ON public.report_evidence FOR SELECT TO authenticated
  USING (public.is_verified_officer(auth.uid()));
CREATE POLICY "Officers view all history" ON public.report_status_history FOR SELECT TO authenticated
  USING (public.is_verified_officer(auth.uid()));
CREATE POLICY "Officers write history" ON public.report_status_history FOR INSERT TO authenticated
  WITH CHECK (public.is_verified_officer(auth.uid()));

-- ===== DISPATCHES =====
CREATE TABLE public.dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  officer_id uuid NOT NULL REFERENCES public.officer_profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.officer_profiles(id) ON DELETE SET NULL,
  status public.dispatch_status NOT NULL DEFAULT 'assigned',
  distance_km double precision,
  eta_minutes int,
  notified_at timestamptz,
  en_route_at timestamptz,
  on_scene_at timestamptz,
  completed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatches TO authenticated;
GRANT ALL ON public.dispatches TO service_role;
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Officers manage dispatches" ON public.dispatches FOR ALL TO authenticated
  USING (public.is_verified_officer(auth.uid())) WITH CHECK (public.is_verified_officer(auth.uid()));

-- ===== CASE NOTES =====
CREATE TABLE public.case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  officer_id uuid REFERENCES public.officer_profiles(id) ON DELETE SET NULL,
  author_kind text NOT NULL DEFAULT 'officer',
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_notes TO authenticated;
GRANT ALL ON public.case_notes TO service_role;
ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Officers manage case notes" ON public.case_notes FOR ALL TO authenticated
  USING (public.is_verified_officer(auth.uid())) WITH CHECK (public.is_verified_officer(auth.uid()));

-- ===== MISSING PERSONS =====
CREATE TABLE public.missing_persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  age int,
  gender text,
  photo_url text,
  description text,
  last_seen_at timestamptz,
  last_seen_location text,
  latitude double precision,
  longitude double precision,
  status text NOT NULL DEFAULT 'missing',
  district text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.missing_persons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missing_persons TO authenticated;
GRANT ALL ON public.missing_persons TO service_role;
ALTER TABLE public.missing_persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read missing persons" ON public.missing_persons FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Officers manage missing persons" ON public.missing_persons FOR ALL TO authenticated
  USING (public.is_verified_officer(auth.uid())) WITH CHECK (public.is_verified_officer(auth.uid()));

-- ===== LOST & FOUND =====
CREATE TABLE public.lost_found_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'lost',
  item_type text NOT NULL,
  description text,
  identifier text,
  photo_url text,
  location_text text,
  district text,
  status text NOT NULL DEFAULT 'open',
  matched_item_id uuid,
  claimed_by text,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lost_found_items TO authenticated;
GRANT ALL ON public.lost_found_items TO service_role;
ALTER TABLE public.lost_found_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Officers manage lost found" ON public.lost_found_items FOR ALL TO authenticated
  USING (public.is_verified_officer(auth.uid())) WITH CHECK (public.is_verified_officer(auth.uid()));

-- ===== OFFICER MESSAGES =====
CREATE TABLE public.officer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL DEFAULT 'command',
  report_id uuid REFERENCES public.reports(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.officer_profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.officer_messages TO authenticated;
GRANT ALL ON public.officer_messages TO service_role;
ALTER TABLE public.officer_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Officers manage messages" ON public.officer_messages FOR ALL TO authenticated
  USING (public.is_verified_officer(auth.uid())) WITH CHECK (public.is_verified_officer(auth.uid()));

-- ===== AUDIT LOG =====
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Officers write audit" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id);
CREATE POLICY "Admins read audit" ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ===== COMMUNITY ALERTS: publisher + write access =====
ALTER TABLE public.community_alerts
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.officer_profiles(id) ON DELETE SET NULL;
GRANT INSERT, UPDATE, DELETE ON public.community_alerts TO authenticated;
CREATE POLICY "Command staff manage alerts" ON public.community_alerts FOR ALL TO authenticated
  USING (public.is_command_staff(auth.uid())) WITH CHECK (public.is_command_staff(auth.uid()));

-- ===== TRIGGERS =====
CREATE TRIGGER trg_stations_updated BEFORE UPDATE ON public.police_stations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_officers_updated BEFORE UPDATE ON public.officer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_dispatches_updated BEFORE UPDATE ON public.dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_missing_updated BEFORE UPDATE ON public.missing_persons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_lostfound_updated BEFORE UPDATE ON public.lost_found_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== INDEXES =====
CREATE INDEX idx_reports_status ON public.reports(status);
CREATE INDEX idx_reports_priority ON public.reports(priority);
CREATE INDEX idx_reports_created ON public.reports(created_at DESC);
CREATE INDEX idx_dispatches_report ON public.dispatches(report_id);
CREATE INDEX idx_case_notes_report ON public.case_notes(report_id);
CREATE INDEX idx_officer_station ON public.officer_profiles(station_id);

-- ===== REALTIME =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.officer_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.officer_messages;