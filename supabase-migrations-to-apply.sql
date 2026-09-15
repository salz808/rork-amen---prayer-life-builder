
-- ============================================================
-- FILE: 20260615000000_add_community_echoes.sql
-- ============================================================
/*
  # Community Echoes — Shared Prayer Wall

  ## Overview
  Adds community prayer wall tables so users can share prayer requests
  anonymously and support each other with "Amen" interactions.

  ## New Tables

  ### 1. `community_echoes`
  Shared prayer requests visible to all authenticated users
  - `id` (uuid, primary key)
  - `user_id` (uuid, nullable — anonymous posts allowed)
  - `text` (text, not null)
  - `amens` (integer, default 0)
  - `created_at` (timestamptz)

  ### 2. `community_amens`
  Tracks which user amened which echo (prevents duplicates)
  - `id` (uuid, primary key)
  - `echo_id` (uuid, references community_echoes)
  - `user_id` (uuid, not null)
  - `created_at` (timestamptz)
  - UNIQUE(echo_id, user_id)

  ## Security
  - Anyone authenticated can view community echoes
  - Anyone authenticated can create echoes
  - Users can only see their own amen records
  - Users can only create their own amen records
*/

-- Create community_echoes table
CREATE TABLE IF NOT EXISTS community_echoes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid,
  text text NOT NULL,
  amens integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create community_amens table
CREATE TABLE IF NOT EXISTS community_amens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  echo_id uuid NOT NULL REFERENCES community_echoes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(echo_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_community_echoes_created ON community_echoes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_amens_user ON community_amens(user_id);
CREATE INDEX IF NOT EXISTS idx_community_amens_echo ON community_amens(echo_id);

-- Enable Row Level Security
ALTER TABLE community_echoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_amens ENABLE ROW LEVEL SECURITY;

-- RLS Policies for community_echoes

-- Anyone authenticated can view the prayer wall
CREATE POLICY "Anyone can view community echoes"
  ON community_echoes FOR SELECT
  TO authenticated
  USING (true);

-- Anyone authenticated can share a prayer request
CREATE POLICY "Users can create community echoes"
  ON community_echoes FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can delete their own echoes
CREATE POLICY "Users can delete own community echoes"
  ON community_echoes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for community_amens

-- Users can check which echoes they've amened
CREATE POLICY "Users can view own amens"
  ON community_amens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can create their own amens
CREATE POLICY "Users can create amens"
  ON community_amens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow signed-out (anon) users to read the community prayer wall
CREATE POLICY "Signed-out users can view community echoes"
  ON community_echoes FOR SELECT
  TO anon
  USING (true);

-- Atomic amen function: inserts amen record + increments counter.
-- Tables are schema-qualified because search_path is empty (security hardening).
CREATE OR REPLACE FUNCTION amen_community_echo(p_echo_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Insert amen record (will fail on duplicate due to UNIQUE constraint)
  INSERT INTO public.community_amens (echo_id, user_id)
  VALUES (p_echo_id, p_user_id);

  -- Increment the amen counter
  UPDATE public.community_echoes
  SET amens = public.community_echoes.amens + 1
  WHERE public.community_echoes.id = p_echo_id;
END;
$$;

-- Seed data: 10 initial prayer requests so the wall feels alive from day one.
-- Only inserted if the table is empty.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM community_echoes LIMIT 1) THEN
    INSERT INTO community_echoes (text, amens, created_at) VALUES
      ('For my mother''s health — she got her test results back today and we''re waiting to hear from the doctor.', 14, now() - interval '2 minutes'),
      ('For peace of mind today at work. I feel completely overwhelmed by everything on my plate.', 42, now() - interval '15 minutes'),
      ('Thankful for a new job after 6 months of waiting! God is so good and His timing is perfect.', 108, now() - interval '1 hour'),
      ('For my marriage. We''re barely speaking to each other right now and I don''t know what to do.', 89, now() - interval '3 hours'),
      ('Just feeling so distant from God right now. I need a breakthrough in my spirit.', 215, now() - interval '4 hours'),
      ('For my teenage son — he''s struggling with anxiety and won''t leave his room. My heart is breaking.', 304, now() - interval '5 hours'),
      ('To finally let go of the anger I''ve been holding onto for years. It''s eating me alive.', 67, now() - interval '8 hours'),
      ('Starting chemo next week. I''m scared but I know God goes before me. Please pray for strength.', 176, now() - interval '12 hours'),
      ('For my daughter starting college across the country. Praying for the right friends and protection.', 53, now() - interval '18 hours'),
      ('Grateful for 3 years of sobriety today. If you''re struggling, don''t give up — one day at a time.', 241, now() - interval '1 day');
  END IF;
END $$;


-- ============================================================
-- FILE: 20260820000000_add_error_reports.sql
-- ============================================================
-- Crash and error reporting for TRIAD Prayer.
-- Clients can only append reports; reading them requires the service role.

create table if not exists public.error_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  platform text not null,
  app_version text,
  message text not null,
  stack text,
  context jsonb,
  created_at timestamptz not null default now()
);

alter table public.error_reports enable row level security;

revoke all on public.error_reports from anon, authenticated;
grant insert on public.error_reports to anon, authenticated;

create policy "Clients can append error reports"
  on public.error_reports
  for insert
  to anon, authenticated
  with check (true);

create index if not exists error_reports_created_at_idx
  on public.error_reports (created_at desc);


-- ============================================================
-- FILE: 20260821000000_harden_community_echo_security.sql
-- ============================================================
/*
  Harden Community Echo ownership and Amen RPC identity.
  Additive policy/function replacement; existing public wall reads remain unchanged.
*/

DROP POLICY IF EXISTS "Users can create community echoes" ON public.community_echoes;

CREATE POLICY "Users can create own community echoes"
  ON public.community_echoes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP FUNCTION IF EXISTS public.amen_community_echo(uuid, uuid);

CREATE OR REPLACE FUNCTION public.amen_community_echo(p_echo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION public.amen_community_echo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.amen_community_echo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.amen_community_echo(uuid) TO authenticated;


-- ============================================================
-- FILE: 20260822000000_add_prayer_circles.sql
-- ============================================================
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


-- ============================================================
-- FILE: 20260823000000_add_echo_moderation.sql
-- ============================================================
/*
  # Prayer Wall Moderation — Report & Block (App Store Guideline 1.2)

  ## Overview
  Adds user-generated-content moderation to the community prayer wall:
  - `echo_reports`: users can report a request they find offensive.
    Reporting also hides the author's requests from the reporter.
  - `echo_mutes`: users can block an author ("hide requests from this person").
    Muted requests are filtered client-side after fetch (a NULL user_id must
    never be dropped by a NOT IN filter, so exclusion happens in the app).

  ## Review access
  Moderators can read all reports with the service role key; users only ever
  see their own reports and mutes via RLS.

  ## Security
  - Insert-only for reports and mutes, scoped to auth.uid().
  - Delete only your own mute rows (unblock).
  - SECURITY DEFINER RPCs (empty search_path, schema-qualified) handle the
    report + hide pair atomically. Anonymous sessions may report/mute; fully
    signed-out visitors cannot.
*/

-- Reports: one per echo per reporter (idempotent re-reports).
CREATE TABLE IF NOT EXISTS echo_reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  echo_id uuid NOT NULL REFERENCES community_echoes(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(echo_id, reporter_id)
);

-- Mutes: block an author's requests from your wall.
CREATE TABLE IF NOT EXISTS echo_mutes (
  user_id uuid NOT NULL,
  muted_user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, muted_user_id)
);

CREATE INDEX IF NOT EXISTS idx_echo_reports_echo ON echo_reports(echo_id);
CREATE INDEX IF NOT EXISTS idx_echo_mutes_user ON echo_mutes(user_id);

ALTER TABLE echo_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE echo_mutes ENABLE ROW LEVEL SECURITY;

-- Reports: insert your own, read your own.
CREATE POLICY "Users can file reports"
  ON echo_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view own reports"
  ON echo_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

-- Mutes: manage your own block list.
CREATE POLICY "Users can view own mutes"
  ON echo_mutes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mute authors"
  ON echo_mutes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND muted_user_id <> auth.uid());

CREATE POLICY "Users can unmute authors"
  ON echo_mutes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Report a request: files the report AND mutes the author in one transaction,
-- so the offensive request disappears from the reporter's wall immediately.
CREATE OR REPLACE FUNCTION report_community_echo(p_echo_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_author uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT user_id INTO v_author
  FROM public.community_echoes
  WHERE id = p_echo_id;

  IF v_author IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.community_echoes WHERE id = p_echo_id
  ) THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  INSERT INTO public.echo_reports (echo_id, reporter_id, reason)
  VALUES (p_echo_id, auth.uid(), NULLIF(p_reason, ''))
  ON CONFLICT (echo_id, reporter_id) DO NOTHING;

  -- Hide the author going forward (their seeded/anonymous posts may have no author).
  IF v_author IS NOT NULL AND v_author <> auth.uid() THEN
    INSERT INTO public.echo_mutes (user_id, muted_user_id)
    VALUES (auth.uid(), v_author)
    ON CONFLICT (user_id, muted_user_id) DO NOTHING;
  END IF;
END;
$$;

-- Unblock an author.
CREATE OR REPLACE FUNCTION unmute_community_echo_author(p_muted_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.echo_mutes
  WHERE user_id = auth.uid() AND muted_user_id = p_muted_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION report_community_echo(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION unmute_community_echo_author(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION report_community_echo(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION unmute_community_echo_author(uuid) TO authenticated;

