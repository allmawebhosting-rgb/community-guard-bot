INSERT INTO storage.buckets (id, name, public)
VALUES ('lost-found-public', 'lost-found-public', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Anyone can view lost found photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'lost-found-public');

CREATE POLICY "Anyone can upload lost found photos"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'lost-found-public' AND (storage.extension(name) IN ('jpg', 'jpeg', 'png', 'webp')));
