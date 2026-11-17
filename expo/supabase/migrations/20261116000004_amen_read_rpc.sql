-- =====================================================================
-- 20261116000004 — Amen read RPC (GPT-6 item 11, 2026-11-16)
--
-- RELEASE CONDITION — READ BEFORE APPLYING ANYTHING:
--   Do NOT apply migration 20261116000002 (increment_prayer_amen /
--   prayer_wall_amens) to production until THIS migration AND the
--   client read path (DatabaseService.getUserAmenedEchoIds, switched
--   to this RPC in the same change) are in place. 00002 moves the
--   amen WRITE to prayer_wall_amens, a table clients cannot read
--   (RLS enabled, REVOKE ALL, no policies); without this read RPC
--   the wall cannot tell which prayers the current user already
--   amened, so every Amen pill renders tappable again after a fresh
--   login (a second tap is idempotent server-side — no double count
--   — but the screen bumps the local count +1 until the next
--   refetch). Deploy order: 00004 + client first, then 00002.
--   (00002's own header says "Do NOT switch the client before
--   then" for the WRITE side; this file is the matching READ side.)
--
-- WHAT THIS DOES:
--   §1  SECURITY DEFINER RPC get_my_amened_prayer_ids(p_prayer_ids
--       uuid[]) RETURNS TABLE (prayer_id uuid). The actor is derived
--       server-side from auth.uid() — the caller can only ever see
--       their OWN amened ids, and only for the page ids they pass
--       (NULL = the caller's whole history, preserving the legacy
--       unbounded call; an empty array returns no rows). No direct
--       client read of prayer_wall_amens is exposed: the ledger stays
--       REVOKE ALL with no policies (00002 §2), and this RPC is the
--       only read path.
--
-- KNOWN LIMIT (documented, not hidden): this reads ONLY
--   prayer_wall_amens. Amens made BEFORE 00002 goes live live in
--   the legacy community_amens ledger and are invisible to this RPC
--   — for those, the pill renders tappable once more; a re-tap is
--   idempotent (increment_prayer_amen returns the current count, no
--   double count) and the pill self-corrects on the next refetch.
--   That set is frozen the moment 00002 is live (the client prefers
--   the new RPC then; the legacy RPC is fallback-only while the
--   function is missing), so the gap shrinks to nothing over time.
--   A UNION over both ledgers was considered and deliberately NOT
--   done: the legacy table is the path being retired, and the task
--   specifies prayer_wall_amens only. If the owner wants legacy
--   amens visible too, extend this function — do not add a client
--   read of either ledger.
--
-- NO CLIENT CHANGE in this migration file. The client keeps its
--   legacy community_amens read as a PGRST202 fallback until this
--   function exists live (same pattern as amenEcho's fallback in
--   00002) — see DatabaseService.getUserAmenedEchoIds.
--
-- DEPLOY: staging first, then live, TOGETHER WITH the client read
--   path, BEFORE 00002. Re-runnable (CREATE OR REPLACE + grants).
-- =====================================================================

-- ── §1 — Caller-only Amen read RPC ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_amened_prayer_ids(p_prayer_ids uuid[] DEFAULT NULL)
RETURNS TABLE (prayer_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.prayer_id
  FROM public.prayer_wall_amens p
  WHERE p.actor_key = 'user:' || auth.uid()::text
    AND (p_prayer_ids IS NULL OR p.prayer_id = ANY(p_prayer_ids));
$$;

COMMENT ON FUNCTION public.get_my_amened_prayer_ids(uuid[]) IS
  'GPT-6 item 11 (2026-11-16): caller-only read of the caller''s own Amen IDs from prayer_wall_amens. Actor is auth.uid() — never a parameter. NULL p_prayer_ids returns the caller''s whole history; an empty array returns no rows. RELEASE CONDITION: apply before 20261116000002 goes live, together with the client read path.';

REVOKE ALL ON FUNCTION public.get_my_amened_prayer_ids(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_amened_prayer_ids(uuid[]) TO authenticated;

-- STAGING TESTS (moderator JWT not needed — any authenticated JWT):
--   §1a Authenticated caller amens prayer P via increment_prayer_amen
--       (00002 applied on staging), then calls
--       get_my_amened_prayer_ids(ARRAY[P]) -> one row, P.
--   §1b Same caller, get_my_amened_prayer_ids(ARRAY[other]) -> no rows.
--   §1c Same caller, get_my_amened_prayer_ids(NULL) -> includes P.
--   §1d Same caller, get_my_amened_prayer_ids(ARRAY[]::uuid[]) -> no rows.
--   §1e A DIFFERENT authenticated caller calls with ARRAY[P] -> no rows
--       (the actor is auth.uid(), never the parameter).
--   §1f Anon caller -> permission denied (no grant), not an empty set.
--   §1g Apply order: on staging, apply 00002 BEFORE 00004 (this
--       function body references prayer_wall_amens, which 00002
--       creates). The LIVE rule is unchanged: 00002 must not go live
--       until 00004 + the client read path are staged, verified, and
--       ready to ship with it — apply 00002 + 00004 to live in the
--       same window, with the client already shipped.
