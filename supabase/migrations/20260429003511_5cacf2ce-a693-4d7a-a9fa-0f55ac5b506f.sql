INSERT INTO storage.buckets (id, name, public)
VALUES ('perfume-cutouts', 'perfume-cutouts', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "perfume_cutouts_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'perfume-cutouts');

CREATE POLICY "perfume_cutouts_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'perfume-cutouts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "perfume_cutouts_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'perfume-cutouts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "perfume_cutouts_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'perfume-cutouts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );