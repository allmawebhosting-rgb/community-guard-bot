DROP POLICY IF EXISTS "Anyone can read missing persons" ON public.missing_persons;
CREATE POLICY "Signed-in users can read missing persons" ON public.missing_persons FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.missing_persons FROM anon;

DROP POLICY IF EXISTS "Anyone can read stations" ON public.police_stations;
CREATE POLICY "Signed-in users can read stations" ON public.police_stations FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.police_stations FROM anon;

DROP POLICY IF EXISTS "Public can upload lost item photos" ON storage.objects;
CREATE POLICY "Users upload lost item photos to own folder" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'lost-found-photos' AND (storage.foldername(name))[1] = (select auth.uid()::text));