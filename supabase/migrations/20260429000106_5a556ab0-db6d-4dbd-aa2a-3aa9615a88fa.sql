-- Convert olfactory_family from text to text[] with canonical values, max 2 per perfume
ALTER TABLE public.perfumes
  ALTER COLUMN olfactory_family DROP DEFAULT;

ALTER TABLE public.perfumes
  ALTER COLUMN olfactory_family TYPE text[]
  USING (
    CASE
      WHEN olfactory_family IS NULL THEN '{}'::text[]
      WHEN lower(olfactory_family) IN ('floral','rose','white floral') THEN ARRAY['floral']
      WHEN lower(olfactory_family) IN ('woody','wood','chypre','leather') THEN ARRAY['woody']
      WHEN lower(olfactory_family) IN ('aquatic','marine','ozonic') THEN ARRAY['aquatic']
      WHEN lower(olfactory_family) IN ('oriental','amber','gourmand','spicy') THEN ARRAY['oriental']
      WHEN lower(olfactory_family) IN ('fresh','citrus','green','aromatic','fougère','fougere') THEN ARRAY['fresh']
      WHEN lower(olfactory_family) IN ('musk','musky','powdery') THEN ARRAY['musk']
      ELSE '{}'::text[]
    END
  );

ALTER TABLE public.perfumes
  ALTER COLUMN olfactory_family SET DEFAULT '{}'::text[],
  ALTER COLUMN olfactory_family SET NOT NULL;

-- Validation: max 2 families, all from canonical set
CREATE OR REPLACE FUNCTION public.validate_olfactory_family()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF array_length(NEW.olfactory_family, 1) > 2 THEN
    RAISE EXCEPTION 'A perfume can belong to at most 2 olfactory families';
  END IF;
  IF NEW.olfactory_family IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(NEW.olfactory_family) f
    WHERE f NOT IN ('floral','woody','aquatic','oriental','fresh','musk')
  ) THEN
    RAISE EXCEPTION 'olfactory_family must be one of: floral, woody, aquatic, oriental, fresh, musk';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS perfumes_validate_family ON public.perfumes;
CREATE TRIGGER perfumes_validate_family
  BEFORE INSERT OR UPDATE ON public.perfumes
  FOR EACH ROW EXECUTE FUNCTION public.validate_olfactory_family();