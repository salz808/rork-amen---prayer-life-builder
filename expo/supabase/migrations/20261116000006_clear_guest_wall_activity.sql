-- =====================================================================
-- 20261116000006 — Clear guest Wall activity (GPT-6 item 16, 2026-11-16)
--
-- Guests who Amen get a server-side anonymous Supabase Auth user
-- (signInAnonymously), but Settings hides Delete Account for
-- anonymous sessions — so a guest had NO way to remove their
-- server-side footprint. This migration adds the missing path: a
-- caller-only RPC that deletes the anonymous user's server-side
-- identity and Wall interaction data. It is NOT a sign-out: the
-- client must call this RPC first and only then clear the local
-- session (lib/clearGuestActivity.ts).
--
-- WHAT THIS DOES (single RPC, clear_guest_wall_activity(), no args):
--   §1  Caller must be an authenticated ANONYMOUS session
--       (auth.jwt() ->> 'is_anonymous'). Signed-in users get
--       'Only anonymous sessions can clear guest activity' — their
--       path is the delete-account edge function, not this RPC.
--       Unauthenticated callers get 'Authentication required'.
--   §2  Wall interaction rows with NO foreign key to auth.users are
--       deleted explicitly, or the identity link would survive the
--       auth.users delete below:
--         * prayer_wall_amens (actor_key = 'user:<uid>' — text key,
--           no FK; 00002 ledger)
--         * community_amens (legacy ledger; user_id has no FK)
--         * echo_mutes / testimony_mutes (user_id has no FK)
--         * echo_reports / testimony_reports as reporter
--           (reporter_id has no FK; guests cannot report through
--           the RPCs, but direct table inserts were possible)
--   §3  Wall posts, if any ever carried this id, are ANONYMIZED
--       first via anonymize_wall_content_for_user (00022: echoes
--       user_id → NULL, testimonies user_id → NULL + first_name →
--       'A friend'), matching the Kai-approved 2026-10-26 rule for
--       signed-in deletes. Guests cannot post through the client,
--       so this normally anonymizes 0 rows; it is defense-in-depth
--       for any row that got the id another way. No wall post is
--       ever DELETED here.
--   §4  The server-side identity itself is deleted:
--       DELETE FROM auth.users WHERE id = auth.uid(). Every public
--       table with REFERENCES auth.users(id) carries an ON DELETE
--       action (verified: all 12 references in-repo are CASCADE or
--       SET NULL — none is NO ACTION), so this cascades profiles,
--       prayer_notifications, bug_reports, declaration_favorites,
--       apple_refresh_tokens, and any circles the guest owned, and
--       nulls error_reports.user_id. The auth row's own
--       refresh_tokens / identities go with it (GoTrue schema).
--
-- DELIBERATELY NOT DONE HERE:
--   * community_echoes.amens counters are NOT decremented. Kai
--     ruled 2026-10-26/27 that amens by a deleted user stay and
--     counts are preserved — only the identity link is removed.
--     (Same rule the signed-in delete path follows.)
--   * Local prayer progress is NOT touched by this RPC — it cannot
--     be; it lives in AsyncStorage on the device. The client keeps
--     it (keep-local marker, lib/clearGuestActivity.ts +
--     AppProvider passive-sign-out guard). Do NOT "fix" this RPC to
--     wipe anything local.
--   * NO silent ephemeral pruning, NO schedule, NO cron. Clearing
--     is an explicit user action only, exactly as the task states.
--
-- PERMISSION NOTE (staging must prove this): the DELETE FROM
--   auth.users runs as the function owner (postgres) under SECURITY
--   DEFINER. Supabase's postgres role can delete auth.users rows
--   (the SQL-editor manual-cleanup pattern), and every FK carries
--   an ON DELETE action, but this has never been executed from an
--   RPC in this repo — staging test §T1 below is the proof. If it
--   fails with a permission error, the fallback is the edge-function
--   route (service_role Admin API, like delete-account) — do NOT
--   widen grants on auth.users to make this pass.
--
-- DEPLOY: staging first, then live. Re-runnable (CREATE OR REPLACE).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.clear_guest_wall_activity()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_actor_key text;
BEGIN
  -- §1 — Anonymous callers only.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Only anonymous sessions can clear guest activity' USING ERRCODE = '42501';
  END IF;

  v_actor_key := 'user:' || v_user_id::text;

  -- §2 — Wall interaction rows with no FK to auth.users: delete
  -- explicitly, or the guest's identity link survives. Counters on
  -- community_echoes are deliberately untouched (Kai ruling:
  -- amens by a deleted user stay, counts preserved).
  DELETE FROM public.prayer_wall_amens WHERE actor_key = v_actor_key;
  DELETE FROM public.community_amens WHERE user_id = v_user_id;
  DELETE FROM public.echo_mutes WHERE user_id = v_user_id;
  DELETE FROM public.testimony_mutes WHERE user_id = v_user_id;
  DELETE FROM public.echo_reports WHERE reporter_id = v_user_id;
  DELETE FROM public.testimony_reports WHERE reporter_id = v_user_id;

  -- §3 — Anonymize any wall post carrying this id (00022 rule;
  -- normally 0 rows — guests cannot post through the client).
  PERFORM * FROM public.anonymize_wall_content_for_user(v_user_id);

  -- §4 — Delete the server-side identity. FK cascades (all ON DELETE
  -- CASCADE / SET NULL in-repo) take profiles, prayer_notifications,
  -- bug_reports, declaration_favorites, apple_refresh_tokens, and
  -- owned circles; error_reports.user_id is nulled, not deleted.
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

COMMENT ON FUNCTION public.clear_guest_wall_activity() IS
  'GPT-6 item 16 (2026-11-16): anonymous-only self-service clear of the guest''s server-side identity + Wall interaction data (prayer_wall_amens, community_amens, mutes, reports as reporter). Wall posts are anonymized per the 2026-10-26 rule, never deleted; amen counters are NOT decremented. Local device progress is untouched — the client keeps it.';

REVOKE ALL ON FUNCTION public.clear_guest_wall_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_guest_wall_activity() TO authenticated;

-- STAGING TESTS (anonymous JWT + signed-in JWT + anon JWT):
--   §T1 As an anonymous test user who amened 2 prayers (rows in
--       prayer_wall_amens + community_amens via the legacy path),
--       muted 1 author, and received 1 milestone bell: call the RPC
--       -> void, no error. Verify: auth.users row GONE; profiles row
--       gone (cascade); prayer_wall_amens / community_amens / mutes /
--       notifications rows for that uid gone; community_echoes.amens
--       counters UNCHANGED; no other user's rows changed; the user's
--       local device state is untouched by the RPC (client-side check).
--   §T2 Same user calling again (fresh anon session, different uid)
--       clears only THAT uid's rows — nothing cross-user.
--   §T3 Signed-in (non-anonymous) caller -> 'Only anonymous
--       sessions can clear guest activity'; account intact.
--   §T4 Anon caller -> permission denied (no grant).
--   §T5 A guest WITH a wall post carrying their id (inserted
--       directly, bypassing the client gate): after the RPC the post
--       still exists, user_id IS NULL (testimonies also first_name =
--       'A friend').
--   §T6 After the RPC, the old access token no longer refreshes
--       (GoTrue: user deleted) — the client must have signed out
--       locally already; confirm no server error surfaces in the app.
--   §T7 (regression) The signed-in delete-account edge function is
--       untouched by this migration; its flow still works on staging.
