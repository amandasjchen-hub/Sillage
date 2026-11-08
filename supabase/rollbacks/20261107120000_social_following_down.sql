-- Undo for 20261107120000_social_following.sql. Run manually (SQL editor); not auto-applied.
DROP FUNCTION IF EXISTS public.get_follow_list(text);
DROP FUNCTION IF EXISTS public.get_wearing_today(uuid);
DROP FUNCTION IF EXISTS public.get_shelf_perfumes(uuid);
DROP FUNCTION IF EXISTS public.get_profile_shelves(uuid);
DROP FUNCTION IF EXISTS public.get_public_profile(text);
DROP FUNCTION IF EXISTS public.search_profiles(text);
DROP TABLE IF EXISTS public.follows;
DROP FUNCTION IF EXISTS public.follows_set_status();
DROP FUNCTION IF EXISTS public.can_view_user(uuid);
ALTER TABLE public.shelves DROP COLUMN IF EXISTS is_shared;
DROP INDEX IF EXISTS public.profiles_username_key;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS username,
  DROP COLUMN IF EXISTS is_private_account,
  DROP COLUMN IF EXISTS share_wearing;
-- Also remove the row from the migration history so it can be re-applied later:
-- DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261107120000';
