REVOKE INSERT ON TABLE public.journey_stats FROM authenticated;

GRANT INSERT (
  user_id,
  journey_pass,
  current_day,
  streak_count,
  last_completed_date,
  journey_complete,
  last_opened_date,
  open_streak_count
) ON TABLE public.journey_stats TO authenticated;
