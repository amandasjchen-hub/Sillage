-- Undo for 20261107130000_report_block.sql. Run manually (SQL editor); not auto-applied.
-- Restores the previous (pre-block) versions of the replaced functions.
DROP FUNCTION IF EXISTS public.get_blocked_list();
DROP FUNCTION IF EXISTS public.get_public_profile(text);
CREATE FUNCTION public.get_public_profile(p_username text)
RETURNS TABLE (
  id uuid, username text, full_name text, is_private_account boolean,
  follower_count bigint, following_count bigint, follow_status text, can_view boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.full_name, p.is_private_account,
    (SELECT count(*) FROM public.follows WHERE followee_id = p.id AND status = 'accepted'),
    (SELECT count(*) FROM public.follows WHERE follower_id = p.id AND status = 'accepted'),
    (SELECT f.status FROM public.follows f WHERE f.follower_id = auth.uid() AND f.followee_id = p.id),
    public.can_view_user(p.id)
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND p.username = lower(p_username);
$$;
REVOKE ALL ON FUNCTION public.get_public_profile(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_profiles(q text)
RETURNS TABLE (id uuid, username text, full_name text, is_private_account boolean, follow_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.full_name, p.is_private_account, f.status
  FROM public.profiles p
  LEFT JOIN public.follows f ON f.follower_id = auth.uid() AND f.followee_id = p.id
  WHERE auth.uid() IS NOT NULL AND p.username IS NOT NULL AND p.id <> auth.uid()
    AND length(trim(q)) >= 2 AND starts_with(p.username, lower(trim(q)))
  ORDER BY p.username LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION public.can_view_user(p_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    auth.uid() = p_owner OR EXISTS (
      SELECT 1 FROM public.follows
      WHERE follower_id = auth.uid() AND followee_id = p_owner AND status = 'accepted'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.follows_set_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := CASE
      WHEN COALESCE((SELECT is_private_account FROM public.profiles WHERE id = NEW.followee_id), false)
        THEN 'pending' ELSE 'accepted' END;
  ELSE
    IF NEW.follower_id <> OLD.follower_id OR NEW.followee_id <> OLD.followee_id
       OR NEW.created_at <> OLD.created_at OR NEW.status <> 'accepted' THEN
      RAISE EXCEPTION 'only approving a follow request is allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS blocks_remove_follows_trg ON public.blocks;
DROP FUNCTION IF EXISTS public.blocks_remove_follows();
DROP TABLE IF EXISTS public.reports;
DROP TABLE IF EXISTS public.blocks;
DROP FUNCTION IF EXISTS public.is_blocked_between(uuid, uuid);
-- DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261107130000';
