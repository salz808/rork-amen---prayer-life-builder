-- Audit round 4, fix lane 5 (circles / privacy / client-trust) — CIRC-1,
-- G-M1, G-M2 (server side), RLS-11, RLS-17, RLS-15.
--
-- CIRC-1: "Circles hidden for launch" was client-only. This migration is
-- the server side of that posture:
--   1. A launch flag (`public.launch_flags`, key 'circles') gates
--      create/join/preview. It FAILS CLOSED: a missing row reads as
--      disabled, and the flag table has no client policies at all, so it
--      can only be flipped via service-role SQL (see the re-enable note
--      at the bottom). leave/delete are deliberately NOT gated — an
--      existing member must always be able to leave, and an owner must
--      always be able to delete.
--   2. The ruled tier caps are enforced server-side (Free: 1 circle /
--      3 members; Partner: 10 circles / 20 members). Partner status is
--      read from the webhook mirror (`journey_stats.is_subscriber` AND
--      `tier_level >= 1`, i.e. support/missions/partner/premium) — never
--      from a client claim. `tier_level`/`is_subscriber` are not
--      client-writable (20260423 column grants), so this read cannot be
--      forged via PostgREST. A user with no `journey_stats` row, or a
--      stale mirror, reads as Free: the caps fail closed.
--      Member caps are governed by the CIRCLE OWNER's tier (a Partner
--      leads a circle of up to 20; a Free owner's circle caps at 3),
--      matching the client copy ("Partners can lead 10 circles of up to
--      20 people each"). The per-user circle cap is governed by the
--      CALLER's tier. `join_prayer_circle` previously enforced no
--      per-user cap at all (RLS-11) — it now enforces the caller's cap.
--   3. Join codes widen from 6 hex chars (16.7M space) to 10 chars from
--      a 31-symbol alphabet (no I/L/O/0/1, so codes survive being read
--      aloud) — ~8.2e14 possibilities. The CHECK allows 6..10 so
--      already-issued 6-char codes keep working.
--   4. Preview/join are rate-limited per account (DB-backed, so the
--      limit survives across edge isolates, unlike an in-memory map):
--      60 previews/hour, 20 joins/hour. This SLOWS enumeration; it does
--      not stop a determined enumerator minting fresh anonymous
--      accounts (each gets a fresh budget) — the widened codes are the
--      real barrier for new circles, and legacy 6-hex codes remain
--      guessable in principle. See the residual list in the lane report.
--   5. Circle RPCs now reject anonymous sessions. Circles are private
--      groups; a throwaway identity must not create, join, or preview
--      one. (While the launch gate is on this is moot — everything is
--      rejected — but it must hold after re-enable too.)
--
-- G-M1: server-side length CHECKs for testimony request/answer, journal
-- reflections, prayer text/answer, first_name/display_name, and report
-- reason (500 chars, as specified). All are added NOT VALID: they bind
-- every new/updated row immediately, but a legacy over-long row cannot
-- fail the deploy. Post-deploy, find violators and VALIDATE (checklist
-- in the lane report). Testimony caps match the prayer caps (5000) on
-- purpose: the journal share flow copies a prayer request/answer into a
-- testimony, so a tighter testimony cap would break sharing a prayer
-- that passed its own cap.
--
-- RLS-15: `error_reports.context` gets an 8 KB size CHECK (NOT VALID),
-- matching the client-side context allowlist added in the same lane.
--
-- This migration does NOT touch wall policies, the moderation stack, or
-- any other lane's tables. It applies cleanly after 00009 regardless of
-- whether 00010/00011 have deployed.
--
-- RE-ENABLE CHECKLIST (when Kai lifts Posture C): flip this flag AND
-- `FEATURES.circles` in the client in the same release — server-on /
-- client-off leaves circles unreachable, client-on / server-off makes
-- every circle action fail with "Circles aren't available yet."
--   UPDATE public.launch_flags SET enabled = true WHERE key = 'circles';
-- (Service role / SQL editor only; no client role can write this table.)

-- ── 1. Launch flag ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.launch_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.launch_flags ENABLE ROW LEVEL SECURITY;
-- No policies: deny for anon/authenticated. SECURITY DEFINER helpers
-- below read it as the table owner.
REVOKE ALL ON TABLE public.launch_flags FROM anon, authenticated;

INSERT INTO public.launch_flags (key, enabled)
VALUES ('circles', false)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.circles_enabled()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Missing row = disabled (fail closed).
  RETURN COALESCE(
    (SELECT enabled FROM public.launch_flags WHERE key = 'circles'),
    false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.circles_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.circles_enabled() TO authenticated;

-- ── 2. Per-account rate limiting for the preview/join oracle ─────────────

CREATE TABLE IF NOT EXISTS public.circle_rpc_attempts (
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('preview', 'join')),
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_circle_rpc_attempts_user_kind_time
  ON public.circle_rpc_attempts (user_id, kind, attempted_at DESC);

ALTER TABLE public.circle_rpc_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.circle_rpc_attempts FROM anon, authenticated;

-- ── 3. Join-code alphabet widened (6 hex -> 10 chars, 31 symbols) ───────

-- Drop whatever CHECK currently constrains join_code (the original is
-- the auto-named circles_join_code_check, but drop by definition so a
-- renamed constraint cannot silently keep the =6 rule live).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.circles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%join_code%'
  LOOP
    EXECUTE 'ALTER TABLE public.circles DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.circles
  ADD CONSTRAINT circles_join_code_check
  CHECK (char_length(join_code) BETWEEN 6 AND 10);

-- ── 4. Circle RPC rewrites ─────────────────────────────────────────────────

-- Shared preamble, inlined per RPC (kept inline rather than in a helper
-- function so no per-user oracle function exists: a `circle_limits(user)`
-- helper granted to callers would let anyone probe anyone else's Partner
-- status. These bodies run SECURITY DEFINER and read journey_stats as
-- the owner, so no caller grant is needed for the tier read itself.)

CREATE OR REPLACE FUNCTION public.create_prayer_circle(p_name text)
RETURNS TABLE (id uuid, name text, join_code text, owner_id uuid, created_at timestamptz, member_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_code text;
  v_circle_id uuid;
  v_max_circles integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Please sign in to use circles' USING ERRCODE = '42501';
  END IF;

  -- CIRC-1 launch gate: fails closed while Posture C holds.
  IF NOT public.circles_enabled() THEN
    RAISE EXCEPTION 'Circles are not available yet' USING ERRCODE = 'P0003';
  END IF;

  -- Ruled tier caps, from the webhook mirror (never from the client).
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.journey_stats
    WHERE user_id = v_user AND is_subscriber AND tier_level >= 1
  ) THEN 10 ELSE 1 END INTO v_max_circles;

  IF (SELECT count(*) FROM public.circle_members WHERE user_id = v_user) >= v_max_circles THEN
    RAISE EXCEPTION 'Circle limit reached' USING ERRCODE = 'P0003';
  END IF;

  -- 10 chars from a 31-symbol alphabet (no I/L/O/0/1): ~8.2e14 codes.
  LOOP
    SELECT string_agg(
      substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
             (get_byte(gen_random_bytes(10), gs - 1) % 31) + 1, 1), '')
    INTO v_code
    FROM generate_series(1, 10) AS gs;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.circles WHERE join_code = v_code);
  END LOOP;

  INSERT INTO public.circles (name, join_code, owner_id)
  VALUES (btrim(p_name), v_code, v_user)
  RETURNING circles.id INTO v_circle_id;

  INSERT INTO public.circle_members (circle_id, user_id, role)
  VALUES (v_circle_id, v_user, 'owner');

  RETURN QUERY
  SELECT c.id, c.name, c.join_code, c.owner_id, c.created_at, count(cm.*)
  FROM public.circles c
  LEFT JOIN public.circle_members cm ON cm.circle_id = c.id
  WHERE c.id = v_circle_id
  GROUP BY c.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_prayer_circle(p_code text)
RETURNS TABLE (id uuid, name text, join_code text, owner_id uuid, created_at timestamptz, member_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_circle public.circles;
  v_max_circles integer;
  v_max_members integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Please sign in to use circles' USING ERRCODE = '42501';
  END IF;

  IF NOT public.circles_enabled() THEN
    RAISE EXCEPTION 'Circles are not available yet' USING ERRCODE = 'P0003';
  END IF;

  -- Rate limit: 20 join attempts per account per hour (DB-backed).
  IF (SELECT count(*) FROM public.circle_rpc_attempts
      WHERE user_id = v_user AND kind = 'join'
        AND attempted_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Too many join attempts. Try again later.' USING ERRCODE = 'P0003';
  END IF;
  INSERT INTO public.circle_rpc_attempts (user_id, kind) VALUES (v_user, 'join');
  DELETE FROM public.circle_rpc_attempts WHERE attempted_at < now() - interval '1 day';

  SELECT * INTO v_circle
  FROM public.circles
  WHERE join_code = upper(btrim(p_code));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Circle not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM public.circle_members WHERE circle_id = v_circle.id AND user_id = v_user) THEN
    RETURN QUERY
    SELECT c.id, c.name, c.join_code, c.owner_id, c.created_at, count(cm.*)
    FROM public.circles c
    LEFT JOIN public.circle_members cm ON cm.circle_id = c.id
    WHERE c.id = v_circle.id
    GROUP BY c.id;
    RETURN;
  END IF;

  -- RLS-11: the joiner's own per-user cap (previously unenforced).
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.journey_stats
    WHERE user_id = v_user AND is_subscriber AND tier_level >= 1
  ) THEN 10 ELSE 1 END INTO v_max_circles;

  IF (SELECT count(*) FROM public.circle_members WHERE user_id = v_user) >= v_max_circles THEN
    RAISE EXCEPTION 'Circle limit reached' USING ERRCODE = 'P0003';
  END IF;

  -- Member cap governed by the OWNER's tier, not the joiner's.
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.journey_stats
    WHERE user_id = v_circle.owner_id AND is_subscriber AND tier_level >= 1
  ) THEN 20 ELSE 3 END INTO v_max_members;

  IF (SELECT count(*) FROM public.circle_members WHERE circle_id = v_circle.id) >= v_max_members THEN
    RAISE EXCEPTION 'This circle is full' USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO public.circle_members (circle_id, user_id)
  VALUES (v_circle.id, v_user);

  RETURN QUERY
  SELECT c.id, c.name, c.join_code, c.owner_id, c.created_at, count(cm.*)
  FROM public.circles c
  LEFT JOIN public.circle_members cm ON cm.circle_id = c.id
  WHERE c.id = v_circle.id
  GROUP BY c.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_prayer_circle(p_code text)
RETURNS TABLE (id uuid, name text, member_count bigint, is_member boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_circle public.circles;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Please sign in to use circles' USING ERRCODE = '42501';
  END IF;

  IF NOT public.circles_enabled() THEN
    RAISE EXCEPTION 'Circles are not available yet' USING ERRCODE = 'P0003';
  END IF;

  -- Rate limit: 60 previews per account per hour (DB-backed). The
  -- preview oracle returns name + member count, so it is the
  -- enumeration surface; the limit slows guessing, the 10-char codes
  -- are what make guessing infeasible for new circles.
  IF (SELECT count(*) FROM public.circle_rpc_attempts
      WHERE user_id = v_user AND kind = 'preview'
        AND attempted_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'Too many preview attempts. Try again later.' USING ERRCODE = 'P0003';
  END IF;
  INSERT INTO public.circle_rpc_attempts (user_id, kind) VALUES (v_user, 'preview');
  DELETE FROM public.circle_rpc_attempts WHERE attempted_at < now() - interval '1 day';

  SELECT * INTO v_circle
  FROM public.circles
  WHERE join_code = upper(btrim(p_code));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Circle not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT v_circle.id, v_circle.name, count(cm.*),
    EXISTS (
      SELECT 1 FROM public.circle_members m
      WHERE m.circle_id = v_circle.id AND m.user_id = v_user
    )
  FROM public.circle_members cm
  WHERE cm.circle_id = v_circle.id
  GROUP BY v_circle.id;
END;
$$;

-- Grants unchanged from 20260822 (authenticated only; anon revoked).
REVOKE ALL ON FUNCTION public.create_prayer_circle(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_prayer_circle(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_prayer_circle(text) TO authenticated;

REVOKE ALL ON FUNCTION public.join_prayer_circle(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_prayer_circle(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.join_prayer_circle(text) TO authenticated;

REVOKE ALL ON FUNCTION public.preview_prayer_circle(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_prayer_circle(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_prayer_circle(text) TO authenticated;

-- leave/delete intentionally NOT gated and NOT rewritten: an existing
-- member must always be able to leave, and an owner must always be able
-- to delete, even while circles are hidden for launch.

-- ── 5. Server-side length CHECKs (G-M1, RLS-15) ───────────────────────────
-- All NOT VALID (see header): new/updated rows are bound immediately,
-- legacy rows cannot fail the deploy. Validate post-deploy per the lane
-- report checklist. Constraint names are lane5-prefixed so they cannot
-- collide with another lane's caps on the same columns; if two caps
-- exist, the stricter one binds.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS lane5_profiles_first_name_len;
ALTER TABLE public.profiles
  ADD CONSTRAINT lane5_profiles_first_name_len
  CHECK (char_length(first_name) <= 40) NOT VALID;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS lane5_profiles_display_name_len;
ALTER TABLE public.profiles
  ADD CONSTRAINT lane5_profiles_display_name_len
  CHECK (display_name IS NULL OR char_length(display_name) <= 40) NOT VALID;

ALTER TABLE public.community_echoes DROP CONSTRAINT IF EXISTS lane5_echoes_text_len;
ALTER TABLE public.community_echoes
  ADD CONSTRAINT lane5_echoes_text_len
  CHECK (char_length(text) <= 1000) NOT VALID;

ALTER TABLE public.community_testimonies DROP CONSTRAINT IF EXISTS lane5_testimonies_request_len;
ALTER TABLE public.community_testimonies
  ADD CONSTRAINT lane5_testimonies_request_len
  CHECK (char_length(request) <= 5000) NOT VALID;

ALTER TABLE public.community_testimonies DROP CONSTRAINT IF EXISTS lane5_testimonies_answer_len;
ALTER TABLE public.community_testimonies
  ADD CONSTRAINT lane5_testimonies_answer_len
  CHECK (char_length(answer) <= 5000) NOT VALID;

ALTER TABLE public.prayer_requests DROP CONSTRAINT IF EXISTS lane5_prayer_requests_text_len;
ALTER TABLE public.prayer_requests
  ADD CONSTRAINT lane5_prayer_requests_text_len
  CHECK (char_length(text) <= 5000) NOT VALID;

ALTER TABLE public.prayer_requests DROP CONSTRAINT IF EXISTS lane5_prayer_requests_answer_len;
ALTER TABLE public.prayer_requests
  ADD CONSTRAINT lane5_prayer_requests_answer_len
  CHECK (answer IS NULL OR char_length(answer) <= 5000) NOT VALID;

ALTER TABLE public.answered_prayers DROP CONSTRAINT IF EXISTS lane5_answered_prayers_request_len;
ALTER TABLE public.answered_prayers
  ADD CONSTRAINT lane5_answered_prayers_request_len
  CHECK (char_length(request) <= 5000) NOT VALID;

ALTER TABLE public.answered_prayers DROP CONSTRAINT IF EXISTS lane5_answered_prayers_answer_len;
ALTER TABLE public.answered_prayers
  ADD CONSTRAINT lane5_answered_prayers_answer_len
  CHECK (char_length(answer) <= 5000) NOT VALID;

ALTER TABLE public.weekly_reflections DROP CONSTRAINT IF EXISTS lane5_reflections_q1_len;
ALTER TABLE public.weekly_reflections
  ADD CONSTRAINT lane5_reflections_q1_len
  CHECK (question_1 IS NULL OR char_length(question_1) <= 10000) NOT VALID;

ALTER TABLE public.weekly_reflections DROP CONSTRAINT IF EXISTS lane5_reflections_q2_len;
ALTER TABLE public.weekly_reflections
  ADD CONSTRAINT lane5_reflections_q2_len
  CHECK (question_2 IS NULL OR char_length(question_2) <= 10000) NOT VALID;

ALTER TABLE public.weekly_reflections DROP CONSTRAINT IF EXISTS lane5_reflections_q3_len;
ALTER TABLE public.weekly_reflections
  ADD CONSTRAINT lane5_reflections_q3_len
  CHECK (question_3 IS NULL OR char_length(question_3) <= 10000) NOT VALID;

ALTER TABLE public.echo_reports DROP CONSTRAINT IF EXISTS lane5_echo_reports_reason_len;
ALTER TABLE public.echo_reports
  ADD CONSTRAINT lane5_echo_reports_reason_len
  CHECK (reason IS NULL OR char_length(reason) <= 500) NOT VALID;

ALTER TABLE public.testimony_reports DROP CONSTRAINT IF EXISTS lane5_testimony_reports_reason_len;
ALTER TABLE public.testimony_reports
  ADD CONSTRAINT lane5_testimony_reports_reason_len
  CHECK (reason IS NULL OR char_length(reason) <= 500) NOT VALID;

ALTER TABLE public.error_reports DROP CONSTRAINT IF EXISTS lane5_error_reports_context_size;
ALTER TABLE public.error_reports
  ADD CONSTRAINT lane5_error_reports_context_size
  CHECK (context IS NULL OR pg_column_size(context) < 8192) NOT VALID;
