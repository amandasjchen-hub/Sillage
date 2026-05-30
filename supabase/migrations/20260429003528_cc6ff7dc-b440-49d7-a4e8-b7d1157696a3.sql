DROP POLICY IF EXISTS "perfume_cutouts_public_read" ON storage.objects;

CREATE POLICY "perfume_cutouts_owner_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'perfume-cutouts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );