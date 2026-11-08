-- Report + block. Blocking is mutual in effect: neither side can see or follow the other.

CREATE TABLE public.blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY blocks_select_own ON public.blocks FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY blocks_insert_own ON public.blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY blocks_delete_own ON public.blocks FOR DELETE USING (auth.uid() = blocker_id);

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'impersonation', 'other')),
  details text CHECK (char_length(details) <= 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'actioned', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter_id <> reported_id)
);
CREATE INDEX reports_status_idx ON public.reports (status, created_at DESC);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_insert_own ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY reports_select_own ON public.reports FOR SELECT USING (auth.uid() = reporter_id);

CREATE OR REPLACE FUNCTION public.is_blocked_between(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a)
  );
$$;

-- Blocking removes any follow in either direction.
CREATE OR REPLACE FUNCTION public.blocks_remove_follows()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.follows
  WHERE (follower_id = NEW.blocker_id AND followee_id = NEW.blocked_id)
     OR (follower_id = NEW.blocked_id AND followee_id = NEW.blocker_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER blocks_remove_follows_trg AFTER INSERT ON public.blocks
  FOR EACH ROW EXECUTE FUNCTION public.blocks_remove_follows();

CREATE OR REPLACE FUNCTION public.follows_set_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.is_blocked_between(NEW.follower_id, NEW.followee_id) THEN
      RAISE EXCEPTION 'cannot follow this account';
    END IF;
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

CREATE OR REPLACE FUNCTION public.can_view_user(p_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    auth.uid() = p_owner OR (
      NOT public.is_blocked_between(auth.uid(), p_owner) AND EXISTS (
        SELECT 1 FROM public.follows
        WHERE follower_id = auth.uid() AND followee_id = p_owner AND status = 'accepted'
      )
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
    AND NOT public.is_blocked_between(auth.uid(), p.id)
    AND length(trim(q)) >= 2
    AND starts_with(p.username, lower(trim(q)))
  ORDER BY p.username
  LIMIT 20;
$$;

-- Return type changes (adds is_blocked), so drop and recreate.
DROP FUNCTION public.get_public_profile(text);
CREATE FUNCTION public.get_public_profile(p_username text)
RETURNS TABLE (
  id uuid, username text, full_name text, is_private_account boolean,
  follower_count bigint, following_count bigint, follow_status text,
  can_view boolean, is_blocked boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.full_name, p.is_private_account,
    (SELECT count(*) FROM public.follows WHERE followee_id = p.id AND status = 'accepted'),
    (SELECT count(*) FROM public.follows WHERE follower_id = p.id AND status = 'accepted'),
    (SELECT f.status FROM public.follows f WHERE f.follower_id = auth.uid() AND f.followee_id = p.id),
    public.can_view_user(p.id),
    EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = auth.uid() AND b.blocked_id = p.id)
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.username = lower(p_username)
    AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = p.id AND b.blocked_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.get_blocked_list()
RETURNS TABLE (id uuid, username text, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.username, u.full_name
  FROM public.blocks b
  JOIN public.profiles u ON u.id = b.blocked_id
  WHERE b.blocker_id = auth.uid()
  ORDER BY b.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.is_blocked_between(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_profile(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_blocked_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_blocked_list() TO authenticated;
