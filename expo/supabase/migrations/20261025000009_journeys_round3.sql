-- Audit round 3 (journeys lane), Batch D.
--
-- 1. J-B8: weekly_reflections.week holds the journey DAY (1-30), but the
--    original CHECK capped it at 4 — days 5-30 failed the constraint and
--    never synced (and the old client-side upsert left them local-only).
--    Widen to 1..30. Existing rows already hold day numbers 1-4, so no
--    data migration is needed.
ALTER TABLE weekly_reflections DROP CONSTRAINT IF EXISTS weekly_reflections_week_check;
ALTER TABLE weekly_reflections ADD CONSTRAINT weekly_reflections_week_check
  CHECK (week >= 1 AND week <= 30);

-- 2. J-B13 + J-S19: theme, voiceover, adaptive-reminder, and playback
--    preferences round-trip through the cloud so a second device or
--    reinstall keeps them. Deliberately NO defaults: a NULL column means
--    "not set", and loadAppState treats it as absent so a local
--    preference is never overwritten by a default on upgrade. Once sync
--    writes the columns, the cloud value is authoritative via merge.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme_preference text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS voiceover_enabled boolean;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS adaptive_reminder_enabled boolean;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS playback_rate double precision;

-- 3. J-S17: persist a failed testimony share's retry flag with the
--    answered-prayer row, so the journal's retry survives restarts.
--    DEFAULT false is correct for old rows (they were never flagged).
ALTER TABLE answered_prayers ADD COLUMN IF NOT EXISTS testimony_share_failed boolean DEFAULT false;
