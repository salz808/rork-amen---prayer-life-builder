-- Audit round 4, fix lane 4 (sync/merge data-loss), Phase 1.
--
-- 1. SYNC-3 — sync_deletes (tombstones). A durable "this id was deleted"
--    record per user/list/item. The client uploads tombstones BEFORE
--    upserts and merge drops tombstoned ids BEFORE any union, so a
--    second device's stale copy can never resurrect a delete. Lists:
--    prayerRequests, answeredPrayers, favorites, reflections (item ids
--    for reflections are "<journey_pass>:<week>"). Checklist deletes
--    are NOT tombstoned: they use timestamp last-write-wins instead
--    (see the lane report — a checklist item has no stable per-edit
--    identity to tombstone against re-checks).
-- 2. SYNC-5 — journey_stats.reset_at: the synced reset marker. Merge
--    drops progress/flag/streak rows completed at or before the marker.
--    journey_stats has explicit column grants (20260423131500), so the
--    new column is granted here or client upserts including it fail.
-- 3. SYNC-9 — non-negativity CHECKs for client-trusted counters, and a
--    BEFORE INSERT OR UPDATE trigger clamping future completed_at to
--    now() on day_progress (and on daily_prayer_log when that table
--    exists — it is not defined in-repo, and the client already
--    tolerates its absence, so that half is guarded).
--
-- NOT deployed by this change (no deploys in this lane). Deploy with
-- build 7: the client tolerates a missing sync_deletes table and a
-- missing reset_at column (it retries stats without the column), but
-- tombstones only protect devices once this migration is live.
-- This migration never touches migrations 00000-00009.

-- ── Reset marker ─────────────────────────────────────────────────────────

ALTER TABLE public.journey_stats
  ADD COLUMN IF NOT EXISTS reset_at timestamptz;

GRANT INSERT (reset_at) ON TABLE public.journey_stats TO authenticated;
GRANT UPDATE (reset_at) ON TABLE public.journey_stats TO authenticated;

-- ── Tombstones ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sync_deletes (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  list text NOT NULL CHECK (list IN ('prayerRequests', 'answeredPrayers', 'favorites', 'reflections')),
  item_id text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, list, item_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_deletes_user
  ON public.sync_deletes(user_id);

ALTER TABLE public.sync_deletes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sync deletes"
  ON public.sync_deletes;
CREATE POLICY "Users can view own sync deletes"
  ON public.sync_deletes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can write own sync deletes"
  ON public.sync_deletes;
CREATE POLICY "Users can write own sync deletes"
  ON public.sync_deletes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own sync deletes"
  ON public.sync_deletes;
CREATE POLICY "Users can delete own sync deletes"
  ON public.sync_deletes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ── Non-negativity CHECKs (SYNC-9) ───────────────────────────────────────

ALTER TABLE public.journey_stats DROP CONSTRAINT IF EXISTS journey_stats_streak_count_nonneg;
ALTER TABLE public.journey_stats ADD CONSTRAINT journey_stats_streak_count_nonneg
  CHECK (streak_count >= 0);
ALTER TABLE public.journey_stats DROP CONSTRAINT IF EXISTS journey_stats_open_streak_count_nonneg;
ALTER TABLE public.journey_stats ADD CONSTRAINT journey_stats_open_streak_count_nonneg
  CHECK (open_streak_count >= 0);

ALTER TABLE public.phase_timings DROP CONSTRAINT IF EXISTS phase_timings_total_seconds_nonneg;
ALTER TABLE public.phase_timings ADD CONSTRAINT phase_timings_total_seconds_nonneg
  CHECK (total_seconds >= 0);

ALTER TABLE public.day_progress DROP CONSTRAINT IF EXISTS day_progress_duration_nonneg;
ALTER TABLE public.day_progress ADD CONSTRAINT day_progress_duration_nonneg
  CHECK (duration >= 0);

-- daily_prayer_log is not defined in-repo: guard the CHECK so this
-- migration still applies cleanly whether or not the table exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'daily_prayer_log'
      AND column_name = 'duration'
  ) THEN
    ALTER TABLE public.daily_prayer_log DROP CONSTRAINT IF EXISTS daily_prayer_log_duration_nonneg;
    ALTER TABLE public.daily_prayer_log ADD CONSTRAINT daily_prayer_log_duration_nonneg
      CHECK (duration >= 0);
  END IF;
END $$;

-- ── Future completed_at clamp (SYNC-9) ───────────────────────────────────
-- A device clock set ahead (or a direct-API write) used to win merge's
-- newest-wins slot forever and zero the streak. The client clamps too;
-- this trigger is the server backstop for the sync write path.

CREATE OR REPLACE FUNCTION public.clamp_future_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND NEW.completed_at > now() THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clamp_future_completed_at ON public.day_progress;
CREATE TRIGGER trg_clamp_future_completed_at
  BEFORE INSERT OR UPDATE ON public.day_progress
  FOR EACH ROW EXECUTE FUNCTION public.clamp_future_completed_at();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'daily_prayer_log'
      AND column_name = 'completed_at'
  ) THEN
    DROP TRIGGER IF EXISTS trg_clamp_future_completed_at ON public.daily_prayer_log;
    CREATE TRIGGER trg_clamp_future_completed_at
      BEFORE INSERT OR UPDATE ON public.daily_prayer_log
      FOR EACH ROW EXECUTE FUNCTION public.clamp_future_completed_at();
  END IF;
END $$;
