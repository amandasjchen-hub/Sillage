ALTER TABLE public.perfumes
  ADD COLUMN IF NOT EXISTS official_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS community_summary text,
  ADD COLUMN IF NOT EXISTS community_accords text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS community_descriptors text[] NOT NULL DEFAULT '{}'::text[];