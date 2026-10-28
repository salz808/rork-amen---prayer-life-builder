-- =====================================================================
-- 20261025000022 — Wall content anonymized on account deletion.
-- =====================================================================
-- STATUS: NOT YET APPLIED — staging test required before any deploy.
-- This file has NOT been applied to any database and has NOT been
-- executed against staging or live. It IS committed in the repo
-- (HEAD 0701cdb); "not applied" is about databases, not the repo.
-- Do NOT run `supabase db push` (or any deploy) with this file
-- until every staging test in this file passes.
--
-- KAI-APPROVED 2026-10-26 (shorthand item 10, "For ten yes approve"):
-- on account deletion, wall posts are ANONYMIZED, not deleted. The
-- author link is removed (user_id → NULL), testimony first_name
-- becomes 'A friend', and the posts stay up for intercessors.
-- This closes audit item H9, which migration 00020 explicitly left
-- open pending Kai's delete-vs-anonymize ruling. That ruling has
-- now been given; this migration implements it.
--
-- VERIFICATION LEGEND (same as 00020):
--   * VERIFIED-SYNTAX-ONLY — the SQL below was checked by READING it
--     against the working-tree migration files named below (no
--     database was available, nothing was executed or parsed by a
--     database). Parenthesis and dollar-quote balance was checked
--     by reading only.
--   * NEEDS-STAGING-TEST — the behaviour cannot be verified without
--     a live database. The section lists the exact staging test
--     that would resolve it. Do not describe such a section as
--     verified.
-- Nothing in this file is claimed to have been executed, tested, or
-- verified against staging/live.
--
-- SOURCES READ (working tree, repo
-- /home/hatch/workspace/triad-build/source/rork-amen-v2/, HEAD 6a40e2b
-- plus uncommitted changes; no existing migration file was edited):
--   * 20260615000000_add_community_echoes.sql — community_echoes
--     user_id is a plain nullable uuid (no FK to auth.users), so
--     setting it to NULL is schema-compatible and deleting the auth
--     user does NOT cascade to wall requests.
--   * 20260825000000_add_community_testimonies.sql —
--     community_testimonies user_id is NOT NULL (so NULL anonymize
--     needs the DROP NOT NULL in §1 below) and first_name is
--     NOT NULL DEFAULT 'A friend' (so setting 'A friend' is safe).
--   * 20260822000000_add_prayer_circles.sql — circles.owner_id is
--     REFERENCES auth.users(id) ON DELETE CASCADE.
--
-- DELIBERATELY NOT CHANGED HERE (flagged, not silently fixed):
--   * CIRCLE-OWNER CASCADE: deleting the auth user still deletes
--     every circle that user owns, plus all of that circle's prayers
--     (owner_id ON DELETE CASCADE, above). Kai's item-10 approval
--     covered wall posts only; the circle cascade is a separate
--     decision and is NOT altered by this migration. If a circle
--     owner deletes their account, their circle disappears with
--     them. Kai 2026-10-26: Circles stay HIDDEN for launch (posture
--     C stands); the cascade fix is deferred to the Circles
--     re-enable package, not rebuilt for build 7.
--   * AMENS by the deleted user (community_amens rows) are NOT
--     touched: amen counts stay, and amen rows are never displayed
--     with an author name. Removing them would silently change
--     other users' prayer counts; keeping them leaves a user↔post
--     link in a table nobody reads by author. Kai ruled 2026-10-26:
--     keep the counts (decided, no longer a follow-up).
--   * bug_reports / error_reports rows are NOT touched (not wall
--     posts; out of the item-10 approval's scope).
--   * No wall post is ever DELETED by this migration. A held post
--     stays held (hidden_at / hidden_reason untouched) — anonymize
--     removes the author link, it does not publish anything.
--
-- EDGE FUNCTION — IMPLEMENTED FILE-ONLY, NOT DEPLOYED (see §3).
-- Correction to the earlier note: the source DOES live in this
-- repo, at backend/functions/delete-account/index.ts (this repo
-- keeps edge sources under backend/functions/, not
-- supabase/functions/). That file now calls this function BEFORE
-- any delete and aborts on anonymize error, and no longer deletes
-- community_echoes, community_testimonies, or community_amens
-- (see backend/functions/delete-account/TESTING.md). Until §3's
-- deploy + staging tests are done, deleting an account does NOT
-- anonymize anything: the auth user row goes away, the wall rows
-- keep their old user_id values (orphaned uuids, no FK to cascade
-- them), and the client alert's anonymize sentence would be
-- untrue. Do not ship the client wording without the
-- edge-function deploy step.
--
-- §1 — Testimonies user_id must accept NULL (VERIFIED-SYNTAX-ONLY,
-- NEEDS-STAGING-TEST: §T1 below).
-- Echoes already allow NULL user_id (anonymous posts), so no change
-- is needed there. Dropping NOT NULL is idempotent-safe: running
-- it twice is a no-op, and it changes no existing row.
-- =====================================================================
ALTER TABLE public.community_testimonies
  ALTER COLUMN user_id DROP NOT NULL;

-- =====================================================================
-- §2 — Anonymize function, service-role only (VERIFIED-SYNTAX-ONLY,
-- NEEDS-STAGING-TEST: §T2–§T4 below).
-- SECURITY DEFINER so the edge function (service role) can run it
-- regardless of RLS; the function takes an explicit user id and
-- touches ONLY that user's wall rows. It is revoked from every
-- client role: a signed-in user must never be able to anonymize
-- someone else's posts by calling it directly.
-- Returns one row: how many echoes and testimonies were anonymized,
-- so the edge function can verify the counts before it deletes the
-- auth user (see §3, step 2).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.anonymize_wall_content_for_user(p_user_id uuid)
RETURNS TABLE (echoes_anonymized integer, testimonies_anonymized integer)
LANGUAGE plpgsql
SECURITY DEFINER
-- Hardened: empty search_path (was 'public, pg_temp'), matching the
-- codebase's other SECURITY DEFINER functions. Safe here because
-- the body references ONLY schema-qualified names
-- (public.community_echoes, public.community_testimonies) plus
-- builtins — no unqualified lookup can be hijacked via any
-- caller-controlled search_path, and no behaviour changes.
SET search_path = ''
AS $func$
DECLARE
  v_echoes integer := 0;
  v_testimonies integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'anonymize_wall_content_for_user: p_user_id must not be null';
  END IF;

  -- Prayer requests: drop the author link, keep the prayer up.
  UPDATE public.community_echoes
     SET user_id = NULL
   WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_echoes = ROW_COUNT;

  -- Testimonies: drop the author link AND reset the displayed name
  -- to the same 'A friend' the DB default already uses for new
  -- shares, so no old first name survives on screen.
  UPDATE public.community_testimonies
     SET user_id = NULL,
         first_name = 'A friend'
   WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_testimonies = ROW_COUNT;

  RETURN QUERY SELECT v_echoes, v_testimonies;
END;
$func$;

REVOKE ALL ON FUNCTION public.anonymize_wall_content_for_user(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_wall_content_for_user(uuid)
  TO service_role;

COMMENT ON FUNCTION public.anonymize_wall_content_for_user(uuid) IS
  'Kai-approved 2026-10-26 (item 10): on account deletion, wall posts are anonymized, not deleted. Echoes: user_id → NULL. Testimonies: user_id → NULL, first_name → ''A friend''. Called by the delete-account edge function with the service role BEFORE it deletes the auth user. Service-role only; never grant to anon/authenticated.';

-- =====================================================================
-- §3 — EDGE-FUNCTION STEPS (steps 1, 2, and 4 are now implemented
-- FILE-ONLY in backend/functions/delete-account/index.ts,
-- function anonymizeWallContent, called FIRST in deleteUserData;
-- DEPLOY + staging tests below are still owed before build 7):
--   1. Authenticate the caller (the client already sends its access
--      token and confirmationText 'DELETE'; keep both checks).
--   2. BEFORE deleting the auth user (and before any other delete),
--      call anonymize_wall_content_for_user(caller_uid) with the
--      service role and verify the returned single row plus that
--      no echo/testimony still carries the caller's user_id. If
--      the call errors, ABORT the deletion (return an error,
--      delete nothing) — a half-deleted account with un-anonymized
--      posts is worse than a failed delete the user can retry.
--      DEPLOY ORDER: apply this migration BEFORE deploying the
--      updated function, or deletes fail closed until it lands.
--   3. Delete the auth user (existing behaviour). NOTE the circle
--      cascade: this still deletes every circle the user owns plus
--      that circle's prayers (see header). Either warn the user
--      in the client delete alert, or get a separate Kai ruling on
--      circle transfer/preserve — do not silently change the
--      cascade in the edge function.
--   4. Do NOT delete rows from community_echoes or
--      community_testimonies anywhere in the function — and do NOT
--      delete community_amens either (Kai ruled amens stay and
--      counts are preserved). All three are removed from the
--      function's delete + verify lists; wall rows are verified
--      anonymized (author link gone), not verified absent.
--   5. Keep the existing local cleanup (sign-out, local state wipe,
--      reminder drain) — unchanged by this migration.
--
-- STAGING TESTS (run against staging, never live, before deploy):
--   §T1 — Apply this migration on staging; confirm
--     community_testimonies.user_id is nullable (information_schema)
--     and existing testimony rows are untouched.
--   §T2 — As service_role, insert a test echo + testimony for a test
--     uid, call anonymize_wall_content_for_user(test_uid), and
--     confirm: echoes_anonymized = 1, testimonies_anonymized = 1,
--     both rows still exist, echo user_id IS NULL, testimony
--     user_id IS NULL AND first_name = 'A friend', hidden_at /
--     hidden_reason unchanged on a held test row, and no other
--     user's rows changed.
--   §T3 — As anon and as an authenticated test user, confirm calling
--     the function is denied (permission error), not silently
--     ignored.
--   §T4 — Full delete flow on staging with the updated edge
--     function: test user's wall posts survive anonymized, their
--     circles cascade (documented behaviour, confirm it is what
--     Kai expects before live), and a failed anonymize call aborts
--     the delete with the account intact.
-- =====================================================================
