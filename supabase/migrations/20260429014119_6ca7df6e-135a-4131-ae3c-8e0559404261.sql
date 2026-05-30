-- Rename theme values: old "sillage" -> "maison", old "maison" -> "ledger".
-- Two-step to avoid collision.
UPDATE public.profiles SET theme = 'maison_legacy' WHERE theme = 'maison';
UPDATE public.profiles SET theme = 'maison' WHERE theme = 'sillage';
UPDATE public.profiles SET theme = 'ledger' WHERE theme = 'maison_legacy';
ALTER TABLE public.profiles ALTER COLUMN theme SET DEFAULT 'maison';