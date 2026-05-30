-- Shelves
CREATE TABLE public.shelves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shelves ENABLE ROW LEVEL SECURITY;
CREATE POLICY shelves_select_own ON public.shelves FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY shelves_insert_own ON public.shelves FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY shelves_update_own ON public.shelves FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY shelves_delete_own ON public.shelves FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER shelves_touch BEFORE UPDATE ON public.shelves FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX shelves_user_idx ON public.shelves(user_id);

-- Join: perfume <-> shelf
CREATE TABLE public.perfume_shelves (
  perfume_id uuid NOT NULL REFERENCES public.perfumes(id) ON DELETE CASCADE,
  shelf_id uuid NOT NULL REFERENCES public.shelves(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (perfume_id, shelf_id)
);
ALTER TABLE public.perfume_shelves ENABLE ROW LEVEL SECURITY;
CREATE POLICY ps_select_own ON public.perfume_shelves FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY ps_insert_own ON public.perfume_shelves FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY ps_delete_own ON public.perfume_shelves FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX ps_shelf_idx ON public.perfume_shelves(shelf_id);
CREATE INDEX ps_perfume_idx ON public.perfume_shelves(perfume_id);

-- Perfume enrichments
ALTER TABLE public.perfumes
  ADD COLUMN IF NOT EXISTS olfactory_family text,
  ADD COLUMN IF NOT EXISTS price_usd numeric,
  ADD COLUMN IF NOT EXISTS epithet text,
  ADD COLUMN IF NOT EXISTS others_epithet text,
  ADD COLUMN IF NOT EXISTS image_source text;

-- Diary location
ALTER TABLE public.diary_entries
  ADD COLUMN IF NOT EXISTS location text;