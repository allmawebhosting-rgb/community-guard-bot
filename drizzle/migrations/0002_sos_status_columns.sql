ALTER TABLE public.safety_activity ADD COLUMN IF NOT EXISTS sos_status text;
ALTER TABLE public.safety_activity ADD COLUMN IF NOT EXISTS activated_at timestamptz;
ALTER TABLE public.safety_activity ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE public.safety_activity ADD CONSTRAINT safety_activity_sos_status_check CHECK (sos_status IS NULL OR sos_status IN ('active','cancelled','resolved')) NOT VALID;