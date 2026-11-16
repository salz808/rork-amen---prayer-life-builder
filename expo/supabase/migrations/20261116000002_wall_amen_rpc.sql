-- =====================================================================
-- P0-4 — Wall Amen RPC with IP ledger + Wall hardening (2026-11-16)
--
-- VERIFIED BEFORE WRITING (repo HEAD 9bdf33d):
--   * The real Wall table is `community_echoes` — NOT `prayer_wall`
--     (no such table exists in any migration). Columns (base
--     20260615000000 + later migrations): id uuid, user_id uuid,
--     text text NOT NULL, amens integer DEFAULT 0, created_at
--     timestamptz, circle_id uuid NULL, hidden_at timestamptz NULL,
--     hidden_reason text NULL. There is NO `amen_count` column and NO
--     `content` column — the brief's `NEW.amen_count` / `trim(content)`
--     were adapted to the real columns `amens` / `text` below.
--     A max-length CHECK already exists: lane5_echoes_text_len
--     (char_length(text) <= 1000, 20261025000012:382-385). Only the
--     min-length side (3 chars) is new here.
--   * The existing amen path is `amen_community_echo(p_echo_id uuid)`,
--     latest version in 20261025000020 §S8 (authenticated-only,
--     SECURITY DEFINER, inserts into community_amens, increments
--     community_echoes.amens, with not-found / hidden-masking /
--     self-amen / circle-membership checks + milestone bells at
--     1/5/10/25/50/100). This migration does NOT modify, drop, or
--     redefine it. The new RPC below is ADDITIVE and copies those
--     checks verbatim so the new path cannot be used to bypass them.
--   * Client Wall paths (expo/lib/database.ts, verified by grep):
--     SELECT wall list + getCommunityEchoById, INSERT a new echo,
--     DELETE own echo. There is NO client UPDATE on community_echoes,
--     so §1 (REVOKE UPDATE) breaks no client path. Deletes and
--     moderation go through SECURITY DEFINER RPCs, which bypass table
--     grants and RLS.
--   * `community_echoes_zero_amens` BEFORE INSERT trigger already
--     forces NEW.amens := 0 (20261025000001). §4 REPLACES that
--     function (same trigger name, no duplicate trigger) to also
--     force NEW.created_at := now(), with the brief's exception for
--     current_user = 'postgres' (seed / SQL-editor backfill; the only
--     INSERT INTO community_echoes in migrations is the 00006 seed).
--   * Dormant tables: `circles` + `circle_members` exist
--     (20260822000000). NO table named `daily_prayers` exists in any
--     migration, and `daily_prayer_log` is explicitly "not defined
--     in-repo" (20261025000015:89) — the daily_prayers part of the
--     brief is SKIPPED (nothing to lock) and reported as such.
--     Circles are already launch-gated server-side
--     (20261025000012: launch_flags 'circles' = false, fail closed;
--     create/join/preview RPCs reject while gated) and removed from
--     the client binary — but direct member SELECTs were still
--     possible via PostgREST. §5 closes that: the only policies on
--     those tables are the two member-view SELECT policies, and they
--     are dropped. Leave/delete stay available through their
--     SECURITY DEFINER RPCs (leave_prayer_circle /
--     delete_prayer_circle, 20260822000000:222,259), which bypass RLS
--     and grants — the 00012 "leave/delete must always work" intent
--     is preserved. RE-ENABLE NOTE: re-enabling circles requires
--     dropping the deny policies below and restoring member policies;
--     see §5.
--   * `cf-connecting-ip` has NO precedent in the repo (grep: zero
--     hits). The header read below uses PostgREST's documented
--     per-transaction `request.headers` setting
--     (current_setting('request.headers', true)::jsonb). If the
--     gateway ever strips the header, the RPC falls back to the
--     authenticated-user actor key and the guards still apply per
--     actor — the fallback is explicit in the code, not silent.
--   * pgcrypto precedent: gen_random_bytes() already used in
--     20261025000012:189. digest()/encode() need the same extension;
--     CREATE EXTENSION IF NOT EXISTS pgcrypto is included (Supabase
--     allowlists pgcrypto; the base migration already does the same
--     for uuid-ossp).
--
-- WHAT THIS DOES:
--   §1  REVOKE UPDATE on community_echoes from anon/authenticated.
--       (Column revokes for hidden_at/hidden_reason/created_at from
--       20261025000010:440 stay in place; this is the table-level
--       lock. The amen RPCs run SECURITY DEFINER as the owner and
--       are unaffected.)
--   §2  Ledger public.prayer_wall_amens (prayer_id, actor_key,
--       ip_hash, created_at) + owner-only salt table. actor_key is
--       the dedup key: 'user:<auth.uid()>' for authenticated callers
--       (guests included — they are anonymous-auth users), so one
--       account amens a prayer at most once; ip_hash is the salted
--       SHA-256 of cf-connecting-ip, used ONLY for the per-IP guards
--       (never exposed to clients: RLS enabled, REVOKE ALL, no
--       policies).
--   §3  SECURITY DEFINER RPC increment_prayer_amen(p_prayer_id uuid)
--       RETURNS integer (current amen count). Same pre-checks as
--       amen_community_echo (not-found / hidden-masking / self-amen /
--       circle membership), then Guard A (max 3 Amens per prayer per
--       IP — i.e. at most 3 distinct actors behind one IP per prayer)
--       and Guard B (max 30 Amens per minute per IP), then
--       INSERT ... ON CONFLICT (prayer_id, actor_key) DO NOTHING
--       (already-amen-ed returns the current count instead of
--       erroring), then increments amens and replicates the milestone
--       bell block (1/5/10/25/50/100). Granted to authenticated only.
--   §4  BEFORE INSERT trigger rework + min-length CHECK (NOT VALID).
--   §5  Circles lock (USING (false) deny policies + REVOKE ALL).
--       NOTE on Postgres semantics: a USING (false) policy permits
--       nothing by itself; the lock is the DROP of the permissive
--       member-view policies + REVOKE ALL (RLS default-deny). The
--       deny policies document the intent.
--
-- NO CLIENT CHANGE in this migration. The client keeps calling
-- amen_community_echo until the client switch lands (after live
-- application of this file). Do NOT switch the client before then.
--
-- DEPLOY: staging first, then live. Re-runnable where marked.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── §1 — Revoke direct UPDATE on the Wall table ────────────────────────

REVOKE UPDATE ON public.community_echoes FROM anon, authenticated;

-- ── §2 — IP ledger + owner-only salt ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prayer_wall_amens (
  prayer_id uuid NOT NULL REFERENCES public.community_echoes(id) ON DELETE CASCADE,
  actor_key text NOT NULL,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (prayer_id, actor_key)
);
ALTER TABLE public.prayer_wall_amens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.prayer_wall_amens FROM anon, authenticated;
-- No policies: the table is reachable only through the SECURITY DEFINER
-- RPC below (owner) and service_role. Clients never read it.

CREATE INDEX IF NOT EXISTS idx_prayer_wall_amens_ip_hash_time
  ON public.prayer_wall_amens (ip_hash, created_at DESC);

-- One-row salt table. The salt is generated once, at deploy time, and
-- never leaves the database (no policies, REVOKE ALL). If the row is
-- ever rotated, previously recorded ip_hash values stop matching new
-- ones — guards then count only post-rotation rows, which is safe
-- (fail-closed direction for abuse, fail-open for no one).
CREATE TABLE IF NOT EXISTS public.prayer_wall_amen_salt (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  salt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.prayer_wall_amen_salt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.prayer_wall_amen_salt FROM anon, authenticated;

INSERT INTO public.prayer_wall_amen_salt (id, salt)
VALUES (1, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

-- ── §3 — increment_prayer_amen RPC ─────────────────────────────────────
-- Pre-checks copied verbatim from amen_community_echo as of
-- 20261025000020 §S8 (not-found, hidden-masking, self-amen, circle
-- membership) + milestone bell block (1/5/10/25/50/100). Only the
-- ledger/dedup and the IP guards are new.

CREATE OR REPLACE FUNCTION public.increment_prayer_amen(p_prayer_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  caller_id uuid := auth.uid();
  v_circle_id uuid;
  v_author_id uuid;
  v_hidden_at timestamptz;
  v_new_count integer;
  v_notify boolean;
  v_headers jsonb;
  v_ip text;
  v_salt text;
  v_ip_hash text;
  v_actor_key text;
  v_same_ip_prayer bigint;
  v_same_ip_minute bigint;
  v_inserted boolean;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Same existence / visibility / self / circle checks as
  -- amen_community_echo (00020 §S8). Error messages are identical so
  -- the two paths are indistinguishable to a prober.
  SELECT user_id, circle_id, hidden_at INTO v_author_id, v_circle_id, v_hidden_at
  FROM public.community_echoes WHERE id = p_prayer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prayer request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_hidden_at IS NOT NULL THEN
    IF v_author_id = caller_id THEN
      RAISE EXCEPTION 'Post under review' USING ERRCODE = '42501';
    ELSE
      RAISE EXCEPTION 'Prayer request not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  IF v_author_id = caller_id THEN
    RAISE EXCEPTION 'Cannot amen your own request' USING ERRCODE = '42501';
  END IF;
  IF v_circle_id IS NULL THEN
    NULL; -- public echo, any authenticated user may amen
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = v_circle_id AND user_id = caller_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this circle' USING ERRCODE = '42501';
  END IF;

  -- Actor key: one amen per account per prayer. IP hash: salted
  -- SHA-256 of cf-connecting-ip from PostgREST's request.headers.
  -- If the header is absent (direct SQL, stripped gateway), v_ip_hash
  -- stays NULL and the guards below fall back to the actor key, so
  -- dedup still holds and abuse is still bounded per account.
  v_actor_key := 'user:' || caller_id::text;
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;
  v_ip := NULLIF(btrim(COALESCE(
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'CF-Connecting-IP',
    ''
  )), '');
  IF v_ip IS NOT NULL THEN
    SELECT salt INTO v_salt FROM public.prayer_wall_amen_salt WHERE id = 1;
    IF v_salt IS NULL THEN
      RAISE EXCEPTION 'AMEN_SALT_MISSING: amen ledger salt is not configured' USING ERRCODE = 'P0001';
    END IF;
    v_ip_hash := encode(digest(v_salt || ':' || v_ip, 'sha256'), 'hex');
  END IF;

  -- Guard A: at most 3 distinct actors behind one IP may amen the
  -- same prayer (Sybil cap). Guard B: at most 30 Amens per minute
  -- per IP (flood cap). Counts are count-then-insert (soft, like the
  -- other caps in this codebase); the (prayer_id, actor_key) primary
  -- key is the exact backstop for the per-actor case.
  IF v_ip_hash IS NOT NULL THEN
    SELECT COUNT(*) INTO v_same_ip_prayer FROM public.prayer_wall_amens
    WHERE prayer_id = p_prayer_id AND ip_hash = v_ip_hash;
    IF v_same_ip_prayer >= 3 THEN
      RAISE EXCEPTION 'AMEN_IP_LIMIT: too many Amens for this prayer from this network' USING ERRCODE = '42501';
    END IF;
    SELECT COUNT(*) INTO v_same_ip_minute FROM public.prayer_wall_amens
    WHERE ip_hash = v_ip_hash AND created_at >= now() - interval '1 minute';
    IF v_same_ip_minute >= 30 THEN
      RAISE EXCEPTION 'AMEN_RATE_LIMIT: too many Amens from this network, try again later' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT COUNT(*) INTO v_same_ip_minute FROM public.prayer_wall_amens
    WHERE actor_key = v_actor_key AND created_at >= now() - interval '1 minute';
    IF v_same_ip_minute >= 30 THEN
      RAISE EXCEPTION 'AMEN_RATE_LIMIT: too many Amens, try again later' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Idempotent ledger insert: a repeat amen from the same actor
  -- returns the current count instead of erroring (contrast
  -- amen_community_echo, which raises a unique-violation).
  INSERT INTO public.prayer_wall_amens (prayer_id, actor_key, ip_hash)
  VALUES (p_prayer_id, v_actor_key, v_ip_hash)
  ON CONFLICT (prayer_id, actor_key) DO NOTHING
  RETURNING true INTO v_inserted;

  IF v_inserted IS NOT TRUE THEN
    SELECT amens INTO v_new_count FROM public.community_echoes WHERE id = p_prayer_id;
    RETURN COALESCE(v_new_count, 0);
  END IF;

  UPDATE public.community_echoes
  SET amens = public.community_echoes.amens + 1
  WHERE public.community_echoes.id = p_prayer_id
  RETURNING public.community_echoes.amens
  INTO v_new_count;

  -- Milestone bells (copied from amen_community_echo, 00020 §S8).
  IF v_author_id IS NOT NULL
    AND v_author_id <> caller_id
    AND v_new_count IN (1, 5, 10, 25, 50, 100)
  THEN
    SELECT COALESCE(
      (SELECT wall_prayer_notifications FROM public.profiles WHERE id = v_author_id),
      true
    ) INTO v_notify;
    IF v_notify THEN
      INSERT INTO public.prayer_notifications (recipient_id, echo_id, milestone)
      VALUES (v_author_id, p_prayer_id, v_new_count)
      ON CONFLICT (recipient_id, echo_id, milestone) DO NOTHING;
    END IF;
  END IF;

  RETURN v_new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_prayer_amen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_prayer_amen(uuid) TO authenticated;

-- ── §4 — BEFORE INSERT trigger rework + min-length CHECK ───────────────
-- Replaces the body of community_echoes_zero_amens (20261025000001).
-- The trigger itself is unchanged (same name, same timing), so no
-- duplicate trigger: one function, one trigger. The postgres exception
-- preserves seed / SQL-editor backfill (the only INSERT INTO
-- community_echoes in migrations is the 00006 seed, which runs as
-- postgres); client inserts run as authenticated/anon and are forced.
-- created_at forcing closes the forged-created_at hole on INSERT
-- (UPDATE was already column-revoked in 20261025000010:440).

CREATE OR REPLACE FUNCTION public.community_echoes_zero_amens()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;
  NEW.amens := 0;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

-- Min length only: the max (char_length(text) <= 1000) already exists
-- as lane5_echoes_text_len (20261025000012:382-385). NOT VALID (not
-- in-file VALIDATE): a legacy 1–2 char row must not fail the deploy.
-- Staging pre-check before VALIDATE:
--   SELECT count(*) FROM public.community_echoes
--   WHERE char_length(trim(text)) < 3;
-- Post-deploy, once that returns 0, run:
--   ALTER TABLE public.community_echoes
--     VALIDATE CONSTRAINT community_echoes_text_min_len;
ALTER TABLE public.community_echoes DROP CONSTRAINT IF EXISTS community_echoes_text_min_len;
ALTER TABLE public.community_echoes
  ADD CONSTRAINT community_echoes_text_min_len
  CHECK (char_length(trim(text)) >= 3) NOT VALID;

-- ── §5 — Lock dormant Circles tables ───────────────────────────────────
-- The only client-role access to these tables is the two member-view
-- SELECT policies below (no INSERT/UPDATE/DELETE policies exist).
-- Dropping them + REVOKE ALL is the lock; the USING (false) policies
-- document it. SECURITY DEFINER circle RPCs (create/join/leave/delete,
-- get_circle_member_profiles) bypass RLS and grants, so leave/delete
-- keep working for existing members and the launch gate
-- (launch_flags 'circles' = false) is untouched.
-- RE-ENABLE CHECKLIST (when Kai lifts the Circles hold): drop the two
-- deny policies below, restore the member-view SELECT policies, and
-- flip launch_flags 'circles' + FEATURES.circles in the same release.
-- daily_prayers: SKIPPED — no such table exists in any migration, and
-- daily_prayer_log is explicitly "not defined in-repo"
-- (20261025000015:89). There is nothing to lock; do not invent a
-- table here.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('circles', 'circle_members')
  LOOP
    EXECUTE 'DROP POLICY ' || quote_ident(r.policyname)
      || ' ON ' || quote_ident(r.schemaname)
      || '.' || quote_ident(r.tablename);
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE public.circles FROM anon, authenticated;
REVOKE ALL ON TABLE public.circle_members FROM anon, authenticated;

CREATE POLICY "Circles are dormant — no client access"
  ON public.circles FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Circle members are dormant — no client access"
  ON public.circle_members FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- STAGING TESTS (do NOT run the flood parts on live):
--  §1  Authenticated UPDATE community_echoes SET amens = 999 ->
--      permission denied (REVOKE). amen_community_echo still works.
--  §3a First increment_prayer_amen(id) as authenticated non-author
--      -> returns 1 (or current+1); row appears in
--      prayer_wall_amens; community_echoes.amens incremented by 1.
--  §3b Same caller again -> returns the SAME count, no new ledger
--      row, no counter change (ON CONFLICT DO NOTHING).
--  §3c Author amening own post -> 'Cannot amen your own request'.
--  §3d Hidden post as non-author -> 'Prayer request not found'
--      (same as a missing id); as author -> 'Post under review'.
--  §3e Missing id -> 'Prayer request not found'.
--  §3f Guard A: 3 distinct authenticated users behind one
--      cf-connecting-ip amen the same prayer, then a 4th ->
--      AMEN_IP_LIMIT. (Set the header per request; PostgREST
--      forwards request headers into request.headers.)
--  §3g Guard B: 30 Amens in a minute from one IP, 31st ->
--      AMEN_RATE_LIMIT.
--  §3h Milestone bell: amen the echo whose count lands on 5 ->
--      prayer_notifications row (recipient=author, milestone=5).
--  §3i amen_community_echo still behaves exactly as before (no
--      regression: same errors, same counter, same bells).
--  §4a Client INSERT with amens=999 + backdated created_at ->
--      stored amens=0, created_at≈now().
--  §4b INSERT with text 'hi' (2 chars) -> CHECK violation;
--      text 'hey' (3 chars) -> lands.
--  §4c INSERT as postgres with amens=42 + backdated created_at ->
--      values preserved (seed exception). Delete the row after.
--  §5a Authenticated SELECT from circles / circle_members ->
--      empty (deny policy), no error. RPC leave/delete paths
--      unaffected (SECURITY DEFINER).
--  §5b circles_enabled() still returns false.
