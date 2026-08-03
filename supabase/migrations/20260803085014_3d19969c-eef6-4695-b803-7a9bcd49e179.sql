ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS district text;
CREATE INDEX IF NOT EXISTS idx_reports_district ON public.reports(district);