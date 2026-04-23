ALTER TABLE public.journey_stats
  ADD COLUMN IF NOT EXISTS tier_level integer NOT NULL DEFAULT 0 CHECK (tier_level >= 0 AND tier_level <= 3);

REVOKE UPDATE ON TABLE public.journey_stats FROM authenticated;

GRANT UPDATE (
  current_day,
  streak_count,
  last_completed_date,
  journey_complete,
  last_opened_date,
  open_streak_count,
  updated_at
) ON TABLE public.journey_stats TO authenticated;
