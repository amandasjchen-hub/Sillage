-- 1. blind_buy on perfumes
DO $$ BEGIN
  CREATE TYPE blind_buy_score AS ENUM ('safe','risky','polarizing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.perfumes
  ADD COLUMN IF NOT EXISTS blind_buy blind_buy_score;

-- 2. scent_personas (one cached persona per user)
CREATE TABLE IF NOT EXISTS public.scent_personas (
  user_id uuid PRIMARY KEY,
  title text NOT NULL,
  tagline text NOT NULL,
  description text NOT NULL,
  signature_notes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scent_personas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sp_select_own ON public.scent_personas;
CREATE POLICY sp_select_own ON public.scent_personas FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS sp_insert_own ON public.scent_personas;
CREATE POLICY sp_insert_own ON public.scent_personas FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sp_update_own ON public.scent_personas;
CREATE POLICY sp_update_own ON public.scent_personas FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS sp_delete_own ON public.scent_personas;
CREATE POLICY sp_delete_own ON public.scent_personas FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS sp_touch ON public.scent_personas;
CREATE TRIGGER sp_touch BEFORE UPDATE ON public.scent_personas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. capsules + capsule_perfumes
CREATE TABLE IF NOT EXISTS public.capsules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  trip_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.capsules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cap_select_own ON public.capsules;
CREATE POLICY cap_select_own ON public.capsules FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS cap_insert_own ON public.capsules;
CREATE POLICY cap_insert_own ON public.capsules FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS cap_update_own ON public.capsules;
CREATE POLICY cap_update_own ON public.capsules FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS cap_delete_own ON public.capsules;
CREATE POLICY cap_delete_own ON public.capsules FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS cap_touch ON public.capsules;
CREATE TRIGGER cap_touch BEFORE UPDATE ON public.capsules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.capsule_perfumes (
  capsule_id uuid NOT NULL REFERENCES public.capsules(id) ON DELETE CASCADE,
  perfume_id uuid NOT NULL,
  user_id uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (capsule_id, perfume_id)
);

ALTER TABLE public.capsule_perfumes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cp_select_own ON public.capsule_perfumes;
CREATE POLICY cp_select_own ON public.capsule_perfumes FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS cp_insert_own ON public.capsule_perfumes;
CREATE POLICY cp_insert_own ON public.capsule_perfumes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS cp_delete_own ON public.capsule_perfumes;
CREATE POLICY cp_delete_own ON public.capsule_perfumes FOR DELETE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS cp_update_own ON public.capsule_perfumes;
CREATE POLICY cp_update_own ON public.capsule_perfumes FOR UPDATE USING (auth.uid() = user_id);
