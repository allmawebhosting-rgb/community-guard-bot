CREATE POLICY "Public can upload lost item photos"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'lost-found-photos');

CREATE POLICY "Officers can view lost item photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'lost-found-photos');