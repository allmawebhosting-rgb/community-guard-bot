-- Public read access to handed-in (found) items
GRANT SELECT ON public.lost_found_items TO anon, authenticated;

CREATE POLICY "Public can view handed-in items"
  ON public.lost_found_items FOR SELECT
  TO anon, authenticated
  USING (kind = 'found');

-- Claims submitted by the public
CREATE TABLE public.lost_found_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES public.lost_found_items(id) ON DELETE CASCADE,
  claimant_name text NOT NULL,
  claimant_phone text NOT NULL,
  proof_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT INSERT ON public.lost_found_claims TO anon, authenticated;
GRANT SELECT, UPDATE ON public.lost_found_claims TO authenticated;
GRANT ALL ON public.lost_found_claims TO service_role;

ALTER TABLE public.lost_found_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a claim"
  ON public.lost_found_claims FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND length(btrim(claimant_name)) BETWEEN 2 AND 120
    AND length(btrim(claimant_phone)) BETWEEN 7 AND 20
    AND length(btrim(proof_text)) BETWEEN 10 AND 2000
  );

CREATE POLICY "Officers read claims"
  ON public.lost_found_claims FOR SELECT
  TO authenticated
  USING (public.is_verified_officer(auth.uid()));

CREATE POLICY "Officers decide claims"
  ON public.lost_found_claims FOR UPDATE
  TO authenticated
  USING (public.is_verified_officer(auth.uid()))
  WITH CHECK (public.is_verified_officer(auth.uid()));

CREATE TRIGGER trg_lost_found_claims_updated
  BEFORE UPDATE ON public.lost_found_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_lost_found_claims_item ON public.lost_found_claims(item_id);

-- Items the public reports as lost
CREATE TABLE public.lost_found_public_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_type text NOT NULL,
  description text,
  location_text text,
  district text,
  occurred_on date,
  photo_url text,
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_match',
  matched_item_id uuid REFERENCES public.lost_found_items(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT INSERT ON public.lost_found_public_reports TO anon, authenticated;
GRANT SELECT, UPDATE ON public.lost_found_public_reports TO authenticated;
GRANT ALL ON public.lost_found_public_reports TO service_role;

ALTER TABLE public.lost_found_public_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can post a lost item"
  ON public.lost_found_public_reports FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'awaiting_match'
    AND length(btrim(item_type)) BETWEEN 2 AND 120
    AND length(btrim(contact_name)) BETWEEN 2 AND 120
    AND length(btrim(contact_phone)) BETWEEN 7 AND 20
  );

CREATE POLICY "Officers read public lost reports"
  ON public.lost_found_public_reports FOR SELECT
  TO authenticated
  USING (public.is_verified_officer(auth.uid()));

CREATE POLICY "Officers update public lost reports"
  ON public.lost_found_public_reports FOR UPDATE
  TO authenticated
  USING (public.is_verified_officer(auth.uid()))
  WITH CHECK (public.is_verified_officer(auth.uid()));

CREATE TRIGGER trg_lost_found_public_reports_updated
  BEFORE UPDATE ON public.lost_found_public_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_lost_found_public_reports_created ON public.lost_found_public_reports(created_at DESC);