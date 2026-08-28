-- Add kind column to lost_found_public_reports to distinguish lost vs found items
ALTER TABLE public.lost_found_public_reports
ADD COLUMN kind text NOT NULL DEFAULT 'lost'
  CHECK (kind IN ('lost', 'found'));

-- Create index for common queries filtering by kind
CREATE INDEX idx_lost_found_public_reports_kind 
  ON public.lost_found_public_reports(kind, created_at DESC);
