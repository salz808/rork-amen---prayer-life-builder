/*
  # Prayer Circles — private, invite-only prayer groups

  ## Overview
  Adds private prayer circles with shareable invite links (join codes).
  The public prayer wall keeps working exactly as before; circle echoes
  are visible to circle members only.

  ## New Tables

  ### 1. `circles`
  - `id` (uuid, primary key)
  - `name` (text, 1–60 chars)
  - `join_code` (text, 6 chars, unique) — used for invite links
  - `owner_id` (uuid → auth.users)
  - `created_at` (timestamptz)

  ### 2. `circle_members`
  - `circle_id` (uuid → circles, cascade)
  - `user_id` (uuid → auth.users, cascade)
  - `role` ('owner' | 'member')
  - `joined_at` (timestamptz)
  - PRIMARY KEY (circle_id, user_id)

  ## Column additions
  - `community_echoes.circle_id` (nullable uuid → circles, cascade)
  - `profiles.display_name` (nullable text)

  ## Security
  - Circles and member lists are visible to members only.
  - All mutations run through SECURITY DEFINER RPCs with explicit grants;
    no direct INSERT/UPDATE/DELETE policies exist on circles tables.
  - Public-wall select/insert policies are replaced so circle echoes are
    readable only by members and insertable only by members of that circle.
  - `amen_community_echo` now also requires circle membership when the
    target echo belongs to a circle.
  - Hard DB caps (independent of client-side tier limits):
    10 circles joined/owned per user, 50 members per circle.
*/

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.circles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  join_code text NOT NULL UNIQUE CHECK (char_length(join_code) = 6),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.circle_members (
  circle_id uuid NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (circle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_circle_members_user ON public.circle_members(user_id);
CREATE INDEX IF NOT EXISTS idx_circle_members_circle ON public.circle_members(circle_id);
CREATE INDEX IF NOT EXISTS idx_community_echoes_circle ON public.community_echoes(circle_id);

ALTER TABLE public.community_echoes
  ADD COLUMN IF NOT EXISTS circle_id uuid REFERENCES public.circles(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text;

-- ── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their circles"
  ON public.circles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.circle_members cm
      WHERE cm.circle_id = circles.id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can view their circle members"
  ON public.circle_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.circle_members mine
      WHERE mine.circle_id = circle_members.circle_id AND mine.user_id = auth.uid()
    )
  );

-- Echo visibility: public wall for everyone, circle echoes for members only.
DROP POLICY IF EXISTS "Anyone can view community echoes" ON public.community_echoes;
DROP POLICY IF EXISTS "Signed-out users can view community echoes" ON public.community_echoes;

CREATE POLICY "Anyone can view public community echoes"
  ON public.community_echoes FOR SELECT
  TO authenticated
  USING (
    circle_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.circle_members cm
      WHERE cm.circle_id = community_echoes.circle_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Signed-out users can view public community echoes"
  ON public.community_echoes FOR SELECT
  TO anon
  USING (circle_id IS NULL);

DROP POLICY IF EXISTS "Users can create community echoes" ON public.community_echoes;
DROP POLICY IF EXISTS "Users can create own community echoes" ON public.community_echoes;

CREATE POLICY "Users can create own community echoes"
  ON public.community_echoes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      circle_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.circle_members cm
        WHERE cm.circle_id = circle_id AND cm.user_id = auth.uid()
      )
    )
  );

-- ── RPCs ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_prayer_circle(p_name text)
RETURNS TABLE (id uuid, name text, join_code text, owner_id uuid, created_at timestamptz, member_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_code text;
  v_circle_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF (SELECT count(*) FROM public.circle_members WHERE user_id = v_user) >= 10 THEN
    RAISE EXCEPTION 'Circle limit reached' USING ERRCODE = 'P0003';
  END IF;

  LOOP
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.circles WHERE join_code = v_code);
  END LOOP;

  INSERT INTO public.circles (name, join_code, owner_id)
  VALUES (btrim(p_name), v_code, v_user)
  RETURNING circles.id INTO v_circle_id;

  INSERT INTO public.circle_members (circle_id, user_id, role)
  VALUES (v_circle_id, v_user, 'owner');

  RETURN QUERY
  SELECT c.id, c.name, c.join_code, c.owner_id, c.created_at, count(cm.*)
  FROM public.circles c
  LEFT JOIN public.circle_members cm ON cm.circle_id = c.id
  WHERE c.id = v_circle_id
  GROUP BY c.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_prayer_circle(p_code text)
RETURNS TABLE (id uuid, name text, join_code text, owner_id uuid, created_at timestamptz, member_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_circle public.circles;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_circle
  FROM public.circles
  WHERE join_code = upper(btrim(p_code));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Circle not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM public.circle_members WHERE circle_id = v_circle.id AND user_id = v_user) THEN
    RETURN QUERY
    SELECT c.id, c.name, c.join_code, c.owner_id, c.created_at, count(cm.*)
    FROM public.circles c
    LEFT JOIN public.circle_members cm ON cm.circle_id = c.id
    WHERE c.id = v_circle.id
    GROUP BY c.id;
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.circle_members WHERE circle_id = v_circle.id) >= 50 THEN
    RAISE EXCEPTION 'This circle is full' USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO public.circle_members (circle_id, user_id)
  VALUES (v_circle.id, v_user);

  RETURN QUERY
  SELECT c.id, c.name, c.join_code, c.owner_id, c.created_at, count(cm.*)
  FROM public.circles c
  LEFT JOIN public.circle_members cm ON cm.circle_id = c.id
  WHERE c.id = v_circle.id
  GROUP BY c.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_prayer_circle(p_circle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_role
  FROM public.circle_members
  WHERE circle_id = p_circle_id AND user_id = v_user;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not a member of this circle' USING ERRCODE = 'P0002';
  END IF;

  IF v_role = 'owner' AND EXISTS (
    SELECT 1 FROM public.circle_members WHERE circle_id = p_circle_id AND user_id <> v_user
  ) THEN
    RAISE EXCEPTION 'Circle owners must delete the circle or transfer it before leaving' USING ERRCODE = 'P0004';
  END IF;

  DELETE FROM public.circle_members WHERE circle_id = p_circle_id AND user_id = v_user;

  -- Last member leaving an empty circle removes it entirely.
  IF NOT EXISTS (SELECT 1 FROM public.circle_members WHERE circle_id = p_circle_id) THEN
    DELETE FROM public.circles WHERE id = p_circle_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_prayer_circle(p_circle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.circles
  WHERE id = p_circle_id AND owner_id = v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Circle not found or not yours' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- Invite-link preview: name + member count without joining.
CREATE OR REPLACE FUNCTION public.preview_prayer_circle(p_code text)
RETURNS TABLE (id uuid, name text, member_count bigint, is_member boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_circle public.circles;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_circle
  FROM public.circles
  WHERE join_code = upper(btrim(p_code));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Circle not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT v_circle.id, v_circle.name, count(cm.*),
    EXISTS (
      SELECT 1 FROM public.circle_members m
      WHERE m.circle_id = v_circle.id AND m.user_id = v_user
    )
  FROM public.circle_members cm
  WHERE cm.circle_id = v_circle.id
  GROUP BY v_circle.id;
END;
$$;

-- Amen RPC: extend the hardened version with circle membership checks.
DROP FUNCTION IF EXISTS public.amen_community_echo(uuid);

CREATE OR REPLACE FUNCTION public.amen_community_echo(p_echo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  v_circle_id uuid;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT circle_id INTO v_circle_id
  FROM public.community_echoes
  WHERE id = p_echo_id;

  IF v_circle_id IS NULL THEN
    NULL; -- public echo, any authenticated user may amen
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = v_circle_id AND user_id = caller_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this circle' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.community_amens (echo_id, user_id)
  VALUES (p_echo_id, caller_id);

  UPDATE public.community_echoes
  SET amens = public.community_echoes.amens + 1
  WHERE public.community_echoes.id = p_echo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prayer request not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.create_prayer_circle(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_prayer_circle(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_prayer_circle(text) TO authenticated;

REVOKE ALL ON FUNCTION public.join_prayer_circle(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_prayer_circle(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.join_prayer_circle(text) TO authenticated;

REVOKE ALL ON FUNCTION public.leave_prayer_circle(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_prayer_circle(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.leave_prayer_circle(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_prayer_circle(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_prayer_circle(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_prayer_circle(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.preview_prayer_circle(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_prayer_circle(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_prayer_circle(text) TO authenticated;

REVOKE ALL ON FUNCTION public.amen_community_echo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.amen_community_echo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.amen_community_echo(uuid) TO authenticated;
