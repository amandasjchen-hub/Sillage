CREATE TABLE IF NOT EXISTS public.perfume_image_cache (
  key text PRIMARY KEY,
  name text NOT NULL,
  house text,
  image_url text NOT NULL,
  image_source text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.perfume_image_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "image_cache_select_authenticated"
  ON public.perfume_image_cache
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "image_cache_insert_authenticated"
  ON public.perfume_image_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);