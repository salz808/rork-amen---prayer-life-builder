/*
  # Fix RLS Performance, Indexes, and Function Security

  ## Changes

  ### 1. RLS Policy Optimization (All Tables)
  Replace `auth.uid()` with `(select auth.uid())` in all policies across:
  - profiles
  - day_progress
  - weekly_reflections
  - prayer_requests
  - answered_prayers
  - journey_stats
  - phase_timings
  - daily_journal_entries

  This prevents re-evaluation of auth.uid() for every row, improving query performance at scale.

  ### 2. Add Missing Index
  - Add index on `answered_prayers.user_id` to cover the foreign key constraint.

  ### 3. Drop Unused Indexes
  - idx_day_progress_user_journey
  - idx_day_progress_completed
  - idx_prayer_requests_user
  - idx_prayer_requests_answered
  - idx_journey_stats_user
  - idx_daily_journal_user_journey_day
  - idx_daily_journal_created

  ### 4. Fix Function Search Path
  - Set `search_path = ''` on `update_updated_at_column` to prevent search_path injection attacks.
*/

-- ============================================================
-- profiles
-- ============================================================
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- ============================================================
-- day_progress
-- ============================================================
DROP POLICY IF EXISTS "Users can view own progress" ON public.day_progress;
DROP POLICY IF EXISTS "Users can insert own progress" ON public.day_progress;
DROP POLICY IF EXISTS "Users can update own progress" ON public.day_progress;
DROP POLICY IF EXISTS "Users can delete own progress" ON public.day_progress;

CREATE POLICY "Users can view own progress"
  ON public.day_progress FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own progress"
  ON public.day_progress FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own progress"
  ON public.day_progress FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own progress"
  ON public.day_progress FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- weekly_reflections
-- ============================================================
DROP POLICY IF EXISTS "Users can view own reflections" ON public.weekly_reflections;
DROP POLICY IF EXISTS "Users can insert own reflections" ON public.weekly_reflections;
DROP POLICY IF EXISTS "Users can update own reflections" ON public.weekly_reflections;

CREATE POLICY "Users can view own reflections"
  ON public.weekly_reflections FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own reflections"
  ON public.weekly_reflections FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own reflections"
  ON public.weekly_reflections FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- prayer_requests
-- ============================================================
DROP POLICY IF EXISTS "Users can view own prayer requests" ON public.prayer_requests;
DROP POLICY IF EXISTS "Users can insert own prayer requests" ON public.prayer_requests;
DROP POLICY IF EXISTS "Users can update own prayer requests" ON public.prayer_requests;
DROP POLICY IF EXISTS "Users can delete own prayer requests" ON public.prayer_requests;

CREATE POLICY "Users can view own prayer requests"
  ON public.prayer_requests FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own prayer requests"
  ON public.prayer_requests FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own prayer requests"
  ON public.prayer_requests FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own prayer requests"
  ON public.prayer_requests FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- answered_prayers
-- ============================================================
DROP POLICY IF EXISTS "Users can view own answered prayers" ON public.answered_prayers;
DROP POLICY IF EXISTS "Users can insert own answered prayers" ON public.answered_prayers;
DROP POLICY IF EXISTS "Users can update own answered prayers" ON public.answered_prayers;

CREATE POLICY "Users can view own answered prayers"
  ON public.answered_prayers FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own answered prayers"
  ON public.answered_prayers FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own answered prayers"
  ON public.answered_prayers FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- journey_stats
-- ============================================================
DROP POLICY IF EXISTS "Users can view own journey stats" ON public.journey_stats;
DROP POLICY IF EXISTS "Users can insert own journey stats" ON public.journey_stats;
DROP POLICY IF EXISTS "Users can update own journey stats" ON public.journey_stats;

CREATE POLICY "Users can view own journey stats"
  ON public.journey_stats FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own journey stats"
  ON public.journey_stats FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own journey stats"
  ON public.journey_stats FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- phase_timings
-- ============================================================
DROP POLICY IF EXISTS "Users can view own phase timings" ON public.phase_timings;
DROP POLICY IF EXISTS "Users can insert own phase timings" ON public.phase_timings;
DROP POLICY IF EXISTS "Users can update own phase timings" ON public.phase_timings;

CREATE POLICY "Users can view own phase timings"
  ON public.phase_timings FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own phase timings"
  ON public.phase_timings FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own phase timings"
  ON public.phase_timings FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- daily_journal_entries
-- ============================================================
DROP POLICY IF EXISTS "Users can view own journal entries" ON public.daily_journal_entries;
DROP POLICY IF EXISTS "Users can insert own journal entries" ON public.daily_journal_entries;
DROP POLICY IF EXISTS "Users can update own journal entries" ON public.daily_journal_entries;
DROP POLICY IF EXISTS "Users can delete own journal entries" ON public.daily_journal_entries;

CREATE POLICY "Users can view own journal entries"
  ON public.daily_journal_entries FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own journal entries"
  ON public.daily_journal_entries FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own journal entries"
  ON public.daily_journal_entries FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own journal entries"
  ON public.daily_journal_entries FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- Add missing FK index on answered_prayers.user_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_answered_prayers_user_id ON public.answered_prayers (user_id);

-- ============================================================
-- Drop unused indexes
-- ============================================================
DROP INDEX IF EXISTS public.idx_day_progress_user_journey;
DROP INDEX IF EXISTS public.idx_day_progress_completed;
DROP INDEX IF EXISTS public.idx_prayer_requests_user;
DROP INDEX IF EXISTS public.idx_prayer_requests_answered;
DROP INDEX IF EXISTS public.idx_journey_stats_user;
DROP INDEX IF EXISTS public.idx_daily_journal_user_journey_day;
DROP INDEX IF EXISTS public.idx_daily_journal_created;

-- ============================================================
-- Fix mutable search_path on trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
