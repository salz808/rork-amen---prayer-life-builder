/*
  # Community Testimonies — publicly shared answered prayers (free for all)

  ## Overview
  Opt-in "Share as testimony" answers become public testimonies on the prayer
  wall. Cards show the request, the answer, and the author's first name only —
  never full profiles.

  ## Security
  - Public read (signed-out visitors + anonymous sessions may READ; the same
    policy shape as the public echo wall).
  - Insert: verified (non-anonymous) owners only — anonymous sessions may amen
    but never post to the public wall, mirroring community_echoes.
  - Update/delete: own rows only.
  - `testimony_reports`: insert-only moderation (App Store Guideline 1.2),
    scoped to auth.uid(); SECURITY DEFINER RPC records a report and mutes the
    author's testimonies for the reporter (same shape as echo moderation).
  - RPCs are SECURITY DEFINER with empty search_path and schema-qualified
    identifiers.
*/

CREATE TABLE IF NOT EXISTS public.community_testimonies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  request text NOT NULL,
  answer text NOT NULL,
  first_name text NOT NULL DEFAULT 'A friend',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_testimonies_created
  ON public.community_testimonies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_testimonies_user
  ON public.community_testimonies(user_id);

ALTER TABLE public.community_testimonies ENABLE ROW LEVEL SECURITY;

-- Public read (wall is browsable signed-out), capped client-side at 50.
CREATE POLICY "Anyone can view testimonies"
  ON public.community_testimonies FOR SELECT
  USING (true);

CREATE POLICY "Verified users can share own testimony"
  ON public.community_testimonies FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );

CREATE POLICY "Users can update own testimony"
  ON public.community_testimonies FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own testimony"
  ON public.community_testimonies FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Moderation reports: one per testimony per reporter (idempotent re-reports).
CREATE TABLE IF NOT EXISTS public.testimony_reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  testimony_id uuid NOT NULL REFERENCES public.community_testimonies(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(testimony_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_testimony_reports_testimony
  ON public.testimony_reports(testimony_id);

ALTER TABLE public.testimony_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can file testimony reports"
  ON public.testimony_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view own testimony reports"
  ON public.testimony_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

-- Mutes: hide an author's testimonies from your wall.
CREATE TABLE IF NOT EXISTS public.testimony_mutes (
  user_id uuid NOT NULL,
  muted_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, muted_user_id)
);

ALTER TABLE public.testimony_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own testimony mutes"
  ON public.testimony_mutes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own testimony mutes"
  ON public.testimony_mutes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own testimony mutes"
  ON public.testimony_mutes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Reporting a testimony also hides that author's testimonies from the
-- reporter, mirroring echo report-and-hide.
DROP FUNCTION IF EXISTS public.report_testimony(uuid, text);

CREATE OR REPLACE FUNCTION public.report_testimony(p_testimony_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  author_id uuid;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO author_id
  FROM public.community_testimonies
  WHERE id = p_testimony_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testimony not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.testimony_reports (testimony_id, reporter_id, reason)
  VALUES (p_testimony_id, caller_id, p_reason)
  ON CONFLICT (testimony_id, reporter_id) DO NOTHING;

  -- Hide the author's testimonies from this reporter (same shape as echo_mutes).
  INSERT INTO public.testimony_mutes (user_id, muted_user_id)
  VALUES (caller_id, author_id)
  ON CONFLICT (user_id, muted_user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.report_testimony(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_testimony(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_testimony(uuid, text) TO authenticated;

