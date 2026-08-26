GRANT SELECT ON public.lost_found_items TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lost_found_items' AND policyname = 'Public can view found lost and found items') THEN
    CREATE POLICY "Public can view found lost and found items" ON public.lost_found_items
      FOR SELECT TO anon, authenticated USING (kind = 'found');
  END IF;
END
$$;

CREATE TABLE public.lost_found_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.lost_found_items(id) ON DELETE CASCADE,
  claimant_name TEXT NOT NULL CHECK (char_length(claimant_name) BETWEEN 2 AND 120),
  claimant_phone TEXT NOT NULL CHECK (char_length(claimant_phone) BETWEEN 5 AND 40),
  proof_text TEXT NOT NULL CHECK (char_length(proof_text) BETWEEN 10 AND 1200),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.lost_found_public_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_type TEXT NOT NULL CHECK (char_length(item_type) BETWEEN 2 AND 100),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 1200),
  location_text TEXT NOT NULL CHECK (char_length(location_text) BETWEEN 2 AND 200),
  district TEXT NOT NULL CHECK (char_length(district) BETWEEN 2 AND 100),
  occurred_on DATE NOT NULL,
  photo_url TEXT,
  contact_name TEXT NOT NULL CHECK (char_length(contact_name) BETWEEN 2 AND 120),
  contact_phone TEXT NOT NULL CHECK (char_length(contact_phone) BETWEEN 5 AND 40),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX lost_found_claims_item_idx ON public.lost_found_claims (item_id, status, created_at DESC);
CREATE INDEX lost_found_public_reports_status_idx ON public.lost_found_public_reports (status, created_at DESC);

ALTER TABLE public.lost_found_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lost_found_public_reports ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON public.lost_found_claims TO anon, authenticated;
GRANT SELECT, UPDATE ON public.lost_found_claims TO authenticated;
GRANT INSERT ON public.lost_found_public_reports TO anon, authenticated;
GRANT SELECT, UPDATE ON public.lost_found_public_reports TO authenticated;
GRANT ALL ON public.lost_found_claims, public.lost_found_public_reports TO service_role;

CREATE POLICY "Anyone can submit a lost found claim" ON public.lost_found_claims
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Verified officers review lost found claims" ON public.lost_found_claims
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.officer_profiles p WHERE p.user_id = auth.uid() AND p.verification_status = 'verified'));
CREATE POLICY "Verified officers update lost found claims" ON public.lost_found_claims
  FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.officer_profiles p WHERE p.user_id = auth.uid() AND p.verification_status = 'verified'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.officer_profiles p WHERE p.user_id = auth.uid() AND p.verification_status = 'verified'));

CREATE POLICY "Anyone can submit a lost item report" ON public.lost_found_public_reports
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Verified officers review lost item reports" ON public.lost_found_public_reports
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.officer_profiles p WHERE p.user_id = auth.uid() AND p.verification_status = 'verified'));
CREATE POLICY "Verified officers update lost item reports" ON public.lost_found_public_reports
  FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.officer_profiles p WHERE p.user_id = auth.uid() AND p.verification_status = 'verified'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.officer_profiles p WHERE p.user_id = auth.uid() AND p.verification_status = 'verified'));

CREATE OR REPLACE FUNCTION public.update_lost_found_claim_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER lost_found_claims_updated_at BEFORE UPDATE ON public.lost_found_claims FOR EACH ROW EXECUTE FUNCTION public.update_lost_found_claim_updated_at();
CREATE TRIGGER lost_found_public_reports_updated_at BEFORE UPDATE ON public.lost_found_public_reports FOR EACH ROW EXECUTE FUNCTION public.update_lost_found_claim_updated_at();

CREATE OR REPLACE FUNCTION public.approve_lost_found_claim(p_claim_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.officer_profiles p WHERE p.user_id = auth.uid() AND p.verification_status = 'verified') THEN RAISE EXCEPTION 'Verified officer access required'; END IF;
  UPDATE public.lost_found_claims SET status = 'approved' WHERE id = p_claim_id RETURNING item_id INTO v_item_id;
  IF v_item_id IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;
  UPDATE public.lost_found_claims SET status = 'rejected' WHERE item_id = v_item_id AND id <> p_claim_id AND status = 'pending';
  UPDATE public.lost_found_items SET status = 'released', released_at = now() WHERE id = v_item_id;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_lost_found_claim(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_lost_found_claim(UUID) TO authenticated;
