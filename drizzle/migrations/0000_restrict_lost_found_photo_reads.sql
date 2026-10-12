DROP POLICY IF EXISTS "Officers can view lost item photos" ON storage.objects;
CREATE POLICY "Officers can view lost item photos" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'lost-found-photos' AND (public.is_verified_officer(auth.uid()) OR public.has_role(auth.uid(), 'admin')));