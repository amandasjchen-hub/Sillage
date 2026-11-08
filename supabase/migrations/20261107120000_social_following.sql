-- Social: usernames, follows, opt-in sharing.
-- Existing tables stay owner-only. Followers read shared content only through
-- the SECURITY DEFINER functions below, which return a limited set of columns.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS is_private_account boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_wearing boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format
  CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,24}$');
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (username);

ALTER TABLE public.shelves
  ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

CREATE TABLE public.follows (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX follows_followee_idx ON public.follows (followee_id, status);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY follows_select_involved ON public.follows FOR SELECT
  USING (auth.uid() IN (follower_id, followee_id));
CREATE POLICY follows_insert_self ON public.follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);
CREATE POLICY follows_update_followee ON public.follows FOR UPDATE
  USING (auth.uid() = followee_id) WITH CHECK (auth.uid() = followee_id);
CREATE POLICY follows_delete_involved ON public.follows FOR DELETE
  USING (auth.uid() IN (follower_id, followee_id));

-- Status is decided server-side: following a private account is always pending,
-- and the only allowed update is the followee approving a request.
CREATE OR REPLACE FUNCTION public.follows_set_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := CASE
      WHEN COALESCE((SELECT is_private_account FROM public.profiles WHERE id = NEW.followee_id), false)
        THEN 'pending' ELSE 'accepted' END;
  ELSE
    IF NEW.follower_id <> OLD.follower_id
       OR NEW.followee_id <> OLD.followee_id
       OR NEW.created_at <> OLD.created_at
       OR NEW.status <> 'accepted' THEN
      RAISE EXCEPTION 'only approving a follow request is allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER follows_status_trg BEFORE INSERT OR UPDATE ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.follows_set_status();

CREATE OR REPLACE FUNCTION public.can_view_user(p_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    auth.uid() = p_owner OR EXISTS (
      SELECT 1 FROM public.follows
      WHERE follower_id = auth.uid() AND followee_id = p_owner AND status = 'accepted'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.search_profiles(q text)
RETURNS TABLE (id uuid, username text, full_name text, is_private_account boolean, follow_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.full_name, p.is_private_account, f.status
  FROM public.profiles p
  LEFT JOIN public.follows f ON f.follower_id = auth.uid() AND f.followee_id = p.id
  WHERE auth.uid() IS NOT NULL
    AND p.username IS NOT NULL
    AND p.id <> auth.uid()
    AND length(trim(q)) >= 2
    AND starts_with(p.username, lower(trim(q)))
  ORDER BY p.username
  LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION public.get_public_profile(p_username text)
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

CREATE OR REPLACE FUNCTION public.get_profile_shelves(p_user uuid)
RETURNS TABLE (id uuid, name text, description text, perfume_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.description,
    (SELECT count(*) FROM public.perfume_shelves ps WHERE ps.shelf_id = s.id)
  FROM public.shelves s
  WHERE s.user_id = p_user AND s.is_shared AND public.can_view_user(p_user)
  ORDER BY s.created_at;
$$;

CREATE OR REPLACE FUNCTION public.get_shelf_perfumes(p_shelf uuid)
RETURNS TABLE (id uuid, name text, house text, image_url text, status public.perfume_status)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pf.id, pf.name, pf.house, pf.image_url, pf.status
  FROM public.perfume_shelves ps
  JOIN public.shelves s ON s.id = ps.shelf_id
  JOIN public.perfumes pf ON pf.id = ps.perfume_id
  WHERE ps.shelf_id = p_shelf AND s.is_shared AND public.can_view_user(s.user_id)
  ORDER BY pf.name;
$$;

-- "Wearing today": most recent diary entry from today or yesterday (tolerates
-- timezone differences with the server's UTC date). Only perfume identity is
-- returned; the memory and occasion text stay private.
CREATE OR REPLACE FUNCTION public.get_wearing_today(p_user uuid)
RETURNS TABLE (perfume_id uuid, name text, house text, image_url text, worn_on date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pf.id, pf.name, pf.house, pf.image_url, d.worn_on
  FROM public.profiles p
  JOIN public.diary_entries d ON d.user_id = p.id
  JOIN public.perfumes pf ON pf.id = d.perfume_id
  WHERE p.id = p_user
    AND p.share_wearing
    AND public.can_view_user(p_user)
    AND d.worn_on >= current_date - 1
  ORDER BY d.worn_on DESC, d.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_follow_list(kind text)
RETURNS TABLE (id uuid, username text, full_name text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.username, u.full_name, f.status
  FROM public.follows f
  JOIN public.profiles u
    ON u.id = CASE WHEN kind = 'following' THEN f.followee_id ELSE f.follower_id END
  WHERE auth.uid() IS NOT NULL AND (
    (kind = 'followers' AND f.followee_id = auth.uid() AND f.status = 'accepted') OR
    (kind = 'requests'  AND f.followee_id = auth.uid() AND f.status = 'pending') OR
    (kind = 'following' AND f.follower_id = auth.uid())
  )
  ORDER BY f.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.can_view_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_profiles(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_public_profile(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_profile_shelves(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_shelf_perfumes(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_wearing_today(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_follow_list(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_shelves(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shelf_perfumes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wearing_today(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_follow_list(text) TO authenticated;
