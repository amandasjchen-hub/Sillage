ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS niche_level smallint NOT NULL DEFAULT 3
    CHECK (niche_level BETWEEN 1 AND 5);

CREATE TABLE IF NOT EXISTS public.discover_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('twins','vibe','wildcard')),
  prompt text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS discover_history_user_created_idx
  ON public.discover_history (user_id, created_at DESC);

ALTER TABLE public.discover_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY dh_select_own ON public.discover_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY dh_insert_own ON public.discover_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY dh_delete_own ON public.discover_history
  FOR DELETE USING (auth.uid() = user_id);