-- 20261025000018 — Staging-matrix forward-fix (TRIAD round-4 follow-up).
--
-- Found by the §B JWT matrix on staging 2026-10-26 (run record
-- deploy-run-2026-10-26-resumed4.md): three independent wall defects,
-- all execution-proven, none visible to the §A policy-text review.
-- Forward-fix per post-deploy-verification.md §F.1: a bad migration is
-- fixed by a NEW migration, never an edit. (The §F.1 pre-deploy
-- amendment exception does not fit here: 00014 and 00017 are already
-- applied on staging, so editing their files would leave staging's
-- deployed state inconsistent with the migration record, and
-- re-applying 00017 whole would break on its non-idempotent
-- ADD CONSTRAINT statements. A new migration keeps the version record
-- truthful and the live run clean: live applies 00010–00017 as-is,
-- then this file.)
-- This file supersedes:
--   (1) the base circle_members SELECT policy (20260822000000, line 85),
--   (2) reject_deleted_wall_insert() as defined in 00014,
--   (3) enforce_report_daily_cap() as defined in 00017 (which had
--       superseded 00010's version with the PL-H1 created_at forcing).
-- Each fix preserves the original behavior except for the defect.
-- Nothing here touches live data; it only replaces one policy and two
-- function definitions. Triggers attached to the replaced functions
-- stay attached (CREATE OR REPLACE).

-- =====================================================================
-- 1. Defect 1: circle_members SELECT policy recursed infinitely (42P17).
--    The base policy queried circle_members inside its own USING clause,
--    so RLS re-applied forever; every authenticated echo read/write and
--    every authenticated report check failed with HTTP 500. The schema
--    already has the SECURITY DEFINER helper is_circle_member()
--    (defined 20260826000000, "so policies never recurse"); the policy
--    now calls it. This single change also unblocks the circles and
--    echo policies that query circle_members, since their inner queries
--    now evaluate under this non-recursive policy.
-- =====================================================================
DROP POLICY IF EXISTS "Members can view their circle members" ON public.circle_members;
CREATE POLICY "Members can view their circle members"
  ON public.circle_members FOR SELECT
  TO authenticated
  USING (public.is_circle_member(circle_id));

-- =====================================================================
-- 2. Defect 2: reject_deleted_wall_insert() ran as invoker (403).
--    The function reads public.deleted_users, on which authenticated has
--    no grant by design (00014 REVOKE). As SECURITY INVOKER every
--    testimony insert (and, once defect 1 is fixed, every echo insert)
--    failed with "permission denied for table deleted_users". Its
--    sibling wall triggers are SECURITY DEFINER; this one now is too.
--    Body identical to 00014's version.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reject_deleted_wall_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.deleted_users WHERE user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'account deleted: wall post is blocked';
  END IF;
  RETURN NEW;
END;
$$;

-- =====================================================================
-- 3. Defect 3: enforce_report_daily_cap() touched the wrong table's
--    NEW field (400 "record new has no field testimony_id").
--    The shared function guarded each table's NEW field behind
--    "TG_TABLE_NAME = '...' AND EXISTS (... NEW.<field> ...)" in a
--    single AND expression, and the SQL executor could evaluate the
--    EXISTS branch first — breaking ALL reporting on both tables and
--    both paths. The TG_TABLE_NAME test is now its own statement, so
--    the EXISTS branch for the other table can never be evaluated.
--    Based on 00017's version: PL-H1 created_at forcing kept, duplicate
--    short-circuit kept per table, combined 10/day cap unchanged.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enforce_report_daily_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count bigint;
  v_day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
BEGIN
  -- PL-H1 fix (from 00017): created_at is caller-settable on direct
  -- inserts, and the cap below counts created_at >= day start. Force
  -- it first so a backdated created_at can never dodge the cap.
  NEW.created_at := now();
  IF TG_TABLE_NAME = 'echo_reports' THEN
    IF EXISTS (
      SELECT 1 FROM public.echo_reports
      WHERE echo_id = NEW.echo_id AND reporter_id = NEW.reporter_id
    ) THEN
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'testimony_reports' THEN
    IF EXISTS (
      SELECT 1 FROM public.testimony_reports
      WHERE testimony_id = NEW.testimony_id AND reporter_id = NEW.reporter_id
    ) THEN
      RETURN NEW;
    END IF;
  END IF;
  SELECT COUNT(*) INTO v_count FROM (
    SELECT created_at FROM public.echo_reports
    WHERE reporter_id = NEW.reporter_id AND created_at >= v_day_start
    UNION ALL
    SELECT created_at FROM public.testimony_reports
    WHERE reporter_id = NEW.reporter_id AND created_at >= v_day_start
  ) s;
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'MODERATION_REPORT_LIMIT: daily report limit reached';
  END IF;
  RETURN NEW;
END;
$$;
