CREATE POLICY "Users read own evidence files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'evidence' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own evidence files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'evidence' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own evidence files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'evidence' AND auth.uid()::text = (storage.foldername(name))[1]);