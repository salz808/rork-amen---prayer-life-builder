-- =====================================================================
-- error_reports: cap anonymous inserts (BE-3 follow-up, 2026-11-16)
--
-- The daily cap in 20261025000020 only fires for signed-in users:
--   IF auth.uid() IS NOT NULL THEN ... 100/day per caller_uid ...
-- Anonymous inserts (auth.uid() IS NULL) skipped the cap entirely, so
-- anyone with the public anon key could insert unlimited rows.
--
-- This migration extends the same trigger with a shared daily cap for
-- anonymous inserts: 1000 anonymous reports per UTC day, across all
-- anonymous callers. Legitimate anonymous volume is near zero (errors
-- from signed-out sessions are rare), so 1000 is far above real use
-- while bounding a flood to 1000 rows/day. Signed-in behavior is
-- unchanged (100/day per user).
--
-- Apply to STAGING first, verify with the tests below, then live.
-- No client change needed: the trigger rejects over-cap inserts and the
-- client already treats a failed reportError as fire-and-forget.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.enforce_error_report_daily_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count bigint;
  v_anon_count bigint;
  v_day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
BEGIN
  NEW.caller_uid := auth.uid();
  IF auth.uid() IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count FROM public.error_reports
    WHERE caller_uid = auth.uid() AND created_at >= v_day_start;
    IF v_count >= 100 THEN
      RAISE EXCEPTION 'ERROR_REPORT_DAILY_LIMIT: daily error report limit reached';
    END IF;
  ELSE
    SELECT COUNT(*) INTO v_anon_count FROM public.error_reports
    WHERE caller_uid IS NULL AND created_at >= v_day_start;
    IF v_anon_count >= 1000 THEN
      RAISE EXCEPTION 'ERROR_REPORT_DAILY_LIMIT: anonymous daily limit reached';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_error_report_daily_cap ON public.error_reports;
CREATE TRIGGER enforce_error_report_daily_cap
  BEFORE INSERT ON public.error_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_error_report_daily_cap();

-- STAGING TESTS (anon key only, no auth):
--   1. One anonymous insert succeeds (expect 201).
--   2. Insert anonymous rows in a loop up to the cap, then one more
--      (expect the 1001st to fail with ERROR_REPORT_DAILY_LIMIT).
--   3. A signed-in user can still insert up to 100/day (unchanged).
--   4. Confirm the cap resets at the UTC day boundary.
-- NOTE: the loop writes test rows; delete them after the test
-- (DELETE FROM public.error_reports WHERE caller_uid IS NULL AND
-- created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')).
-- Do NOT run test 2 on live.
