/*
  # Foundations Together — circles walking the 30 days side by side

  ## Overview
  Layers a shared Foundations journey on top of Prayer Circles. A circle
  can run ONE together-journey at a time (Foundations only for this MVP).
  Members opt in individually; the roster shows each walker's current
  Foundations day, whether they have prayed today, and their streak.

  Pacing stays personal: the roster only READS progress — one day per
  prayer day (4 AM local) still applies to each member exactly as before.

  ## New Tables

  ### 1. `circle_journeys`
  - `id` (uuid, primary key)
  - `circle_id` (uuid → circles, cascade, UNIQUE — one journey per circle)
  - `track_id` (text, 'foundations' only for now)
  - `start_prayer_day` (date) — the prayer day the circle began walking
  - `started_by` (uuid → auth.users)
  - `status` ('active' | 'completed')
  - `created_at` (timestamptz)

  ### 2. `circle_journey_members`
  - `journey_id` (uuid → circle_journeys, cascade)
  - `user_id` (uuid → auth.users, cascade)
  - `joined_at` (timestamptz)
  - PRIMARY KEY (journey_id, user_id)

  ### 3. `journey_progress`
  Published per-user journey summary (progress itself stays local-first;
  the app upserts this summary when a Foundations day is completed and on
  app open when it has changed).
  - `user_id` (uuid → auth.users, cascade)
  - `track_id` (text, 'foundations')
  - `current_day` (int, 1–30 — the day the member is on)
  - `last_completed_prayer_day` (date, nullable — prayer-day key, 4 AM local)
  - `current_streak` (int)
  - `updated_at` (timestamptz)
  - PRIMARY KEY (user_id, track_id)

  ## Security
  - `journey_progress` is readable by the owner and by anyone who shares a
    circle with them; writable only by the owner.
  - `circle_journeys` are readable by circle members; any member may start
    the one journey for their circle.
  - `circle_journey_members` are readable by the circle's members; a user
    may add/remove only their own row, and only for a circle they belong to.
  - One extra `profiles` SELECT policy lets circle co-members read each
    other's display names (the roster needs names; base profiles RLS is
    own-row-only).
  - Until this migration runs, the app feature-detects the missing tables
    and the Journey Together card simply does not render — circles behave
    exactly as before.
*/

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.circle_journeys (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  circle_id uuid NOT NULL UNIQUE REFERENCES public.circles(id) ON DELETE CASCADE,
  track_id text NOT NULL DEFAULT 'foundations' CHECK (track_id = 'foundations'),
  start_prayer_day date NOT NULL,
  started_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.circle_journey_members (
  journey_id uuid NOT NULL REFERENCES public.circle_journeys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (journey_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.journey_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id text NOT NULL DEFAULT 'foundations',
  current_day int NOT NULL DEFAULT 1 CHECK (current_day BETWEEN 1 AND 30),
  last_completed_prayer_day date,
  current_streak int NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_circle_journey_members_user
  ON public.circle_journey_members(user_id);
CREATE INDEX IF NOT EXISTS idx_journey_progress_track
  ON public.journey_progress(track_id);

-- ── Membership helpers (SECURITY DEFINER so policies never recurse) ─────────

CREATE OR REPLACE FUNCTION public.is_circle_member(p_circle_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.circle_members cm
    WHERE cm.circle_id = p_circle_id AND cm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_circle_with(p_other_user uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.circle_members mine
    JOIN public.circle_members theirs ON theirs.circle_id = mine.circle_id
    WHERE mine.user_id = auth.uid() AND theirs.user_id = p_other_user
  );
$$;

REVOKE ALL ON FUNCTION public.is_circle_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_circle_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_circle_member(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.shares_circle_with(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shares_circle_with(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.shares_circle_with(uuid) TO authenticated;

-- ── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.circle_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_journey_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_progress ENABLE ROW LEVEL SECURITY;

-- circle_journeys: members read; any member may start their circle's journey.
DROP POLICY IF EXISTS "Members can view circle journeys" ON public.circle_journeys;
CREATE POLICY "Members can view circle journeys"
  ON public.circle_journeys FOR SELECT
  TO authenticated
  USING (public.is_circle_member(circle_id));

DROP POLICY IF EXISTS "Members can start a circle journey" ON public.circle_journeys;
CREATE POLICY "Members can start a circle journey"
  ON public.circle_journeys FOR INSERT
  TO authenticated
  WITH CHECK (
    started_by = auth.uid()
    AND public.is_circle_member(circle_id)
  );

-- circle_journey_members: the circle can see who is walking; join/leave self.
DROP POLICY IF EXISTS "Circle members can view journey members" ON public.circle_journey_members;
CREATE POLICY "Circle members can view journey members"
  ON public.circle_journey_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.circle_journeys j
      WHERE j.id = journey_id AND public.is_circle_member(j.circle_id)
    )
  );

DROP POLICY IF EXISTS "Members can join a circle journey" ON public.circle_journey_members;
CREATE POLICY "Members can join a circle journey"
  ON public.circle_journey_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.circle_journeys j
      WHERE j.id = journey_id AND public.is_circle_member(j.circle_id)
    )
  );

DROP POLICY IF EXISTS "Members can leave a circle journey" ON public.circle_journey_members;
CREATE POLICY "Members can leave a circle journey"
  ON public.circle_journey_members FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- journey_progress: owner + circle-mates read; owner writes their own row.
DROP POLICY IF EXISTS "Circle mates can view journey progress" ON public.journey_progress;
CREATE POLICY "Circle mates can view journey progress"
  ON public.journey_progress FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.shares_circle_with(user_id)
  );

DROP POLICY IF EXISTS "Users can publish own journey progress" ON public.journey_progress;
CREATE POLICY "Users can publish own journey progress"
  ON public.journey_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own journey progress" ON public.journey_progress;
CREATE POLICY "Users can update own journey progress"
  ON public.journey_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Roster names: co-members may read each other's profile rows (display name).
DROP POLICY IF EXISTS "Circle members can view co-member profiles" ON public.profiles;
CREATE POLICY "Circle members can view co-member profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.shares_circle_with(id));
