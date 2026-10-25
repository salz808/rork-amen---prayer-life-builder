-- Audit round 4, fix lane 3 (webhook / TTS / edge functions / tokens),
-- 2026-10-25. Assigned NEW migration number for this lane only.
-- DEPLOY ORDER: this migration MUST be live before the rewritten
-- revenuecat-webhook / google-tts-proxy / delete-account functions deploy,
-- because the new function code calls the RPCs/tables below. The OLD
-- function code does not reference them, so deploying the migration first
-- is safe in either order for old code, and required for new code.
--
-- Contents:
--   1. tts_rate_limits + check_tts_rate_limit() — DB-backed TTS limiter
--      (TTS-1: replaces the per-isolate in-memory Map).
--   2. tts_cache — server-side TTS audio cache keyed by text+voice+rate.
--   3. webhook_events.status + event_payload_hash — claim lifecycle so a
--      failed event can be retried instead of silently lost (D-L-4), and
--      duplicate-id payload mismatches are detectable (D-L-2).
--   4. apply_webhook_mirror() — atomic ordering + mirror write (WEB-1,
--      WEB-2): one transaction, row-locked per user, so a stale event can
--      never overwrite a newer mirror row and a TRANSFER source revoke is
--      gated on the SOURCE's watermark.
--   5. deleted_users tombstone + insert guards (E-M1): a deleted user's
--      unexpired JWT can no longer re-create a profile or wall row via
--      PostgREST. The tombstone row has NO foreign key to auth.users, so
--      the hard auth delete in delete-account does NOT cascade-remove it.
--      Re-registration mints a NEW Supabase id, so the tombstone never
--      blocks a legitimate new account.
--
-- Nothing in this file amends migrations 00000-00009. All objects use
-- IF NOT EXISTS / OR REPLACE so the file is re-runnable.

-- ── 1. TTS rate limiting ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tts_rate_limits (
  user_id uuid NOT NULL,
  window_type text NOT NULL CHECK (window_type IN ('minute', 'day')),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, window_type, window_start)
);
ALTER TABLE public.tts_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tts_rate_limits FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_tts_rate_limits_window_start
  ON public.tts_rate_limits (window_start);

-- Atomically check-and-increment the per-minute and per-day buckets for
-- one user. The per-user advisory lock (held to end of transaction, which
-- for an RPC call is the whole call) serializes concurrent edge isolates,
-- so the cap is per user, not per isolate — plain SELECT ... FOR UPDATE
-- + INSERT/UPDATE below is therefore race-free with no ON CONFLICT
-- arithmetic. Returns true when the request is within BOTH caps; a
-- rejected attempt still consumes its minute bucket (counted attempts
-- cannot be used to probe the cap for free). Stale buckets older than
-- 2 days are pruned on each call.
CREATE OR REPLACE FUNCTION public.check_tts_rate_limit(
  p_user_id uuid,
  p_minute_cap integer,
  p_daily_cap integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_minute timestamptz := date_trunc('minute', now());
  v_day timestamptz := date_trunc('day', now());
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));
  DELETE FROM public.tts_rate_limits WHERE window_start < now() - interval '2 days';

  SELECT request_count INTO v_count FROM public.tts_rate_limits
  WHERE user_id = p_user_id AND window_type = 'minute' AND window_start = v_minute
  FOR UPDATE;
  IF FOUND THEN
    v_count := v_count + 1;
    UPDATE public.tts_rate_limits SET request_count = v_count
    WHERE user_id = p_user_id AND window_type = 'minute' AND window_start = v_minute;
  ELSE
    INSERT INTO public.tts_rate_limits (user_id, window_type, window_start, request_count)
    VALUES (p_user_id, 'minute', v_minute, 1);
    v_count := 1;
  END IF;
  IF v_count > p_minute_cap THEN
    RETURN false;
  END IF;

  SELECT request_count INTO v_count FROM public.tts_rate_limits
  WHERE user_id = p_user_id AND window_type = 'day' AND window_start = v_day
  FOR UPDATE;
  IF FOUND THEN
    v_count := v_count + 1;
    UPDATE public.tts_rate_limits SET request_count = v_count
    WHERE user_id = p_user_id AND window_type = 'day' AND window_start = v_day;
  ELSE
    INSERT INTO public.tts_rate_limits (user_id, window_type, window_start, request_count)
    VALUES (p_user_id, 'day', v_day, 1);
    v_count := 1;
  END IF;
  IF v_count > p_daily_cap THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.check_tts_rate_limit(uuid, integer, integer) FROM anon, authenticated;

-- ── 2. TTS server-side cache ────────────────────────────────────────────
-- Keyed by SHA-256(text + voice + speakingRate) in the function code.
-- Journey narration text is a finite corpus, so the table stays small;
-- no TTL is applied (a cached clip never goes stale — same input bytes
-- always produce the same audio). Audio is base64 text, tens of KB per
-- row at the 2,000-char input cap.

CREATE TABLE IF NOT EXISTS public.tts_cache (
  cache_key text PRIMARY KEY,
  audio_content text NOT NULL,
  encoding text NOT NULL DEFAULT 'MP3',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tts_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tts_cache FROM anon, authenticated;

-- ── 3. Webhook claim lifecycle ──────────────────────────────────────────
-- Legacy rows (written by the old claim-before-processing code) predate
-- this column; they are all completed events (failed claims were deleted
-- by the old catch path), so the 'done' default preserves their meaning.
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done'
    CHECK (status IN ('processing', 'done', 'failed'));
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS event_payload_hash text;

-- ── 4. Atomic webhook ordering + mirror write ───────────────────────────
-- One transaction per call: serialize on the user's watermark row, then
-- decide stale-vs-apply, then (unless p_touch_mirror is false) write the
-- mirror row. Returns 'applied' or 'stale'.
--
-- Stale rule preserves the prior strict-< semantics: an event is stale
-- ONLY when its timestamp is strictly older than the watermark. An event
-- with a timestamp EQUAL to the watermark proceeds (dedupe by event id
-- already covers true redeliveries; equal timestamps must not drop a
-- distinct second event created in the same millisecond).
--
-- p_touch_mirror = false advances ONLY the watermark. The webhook uses it
-- for empty-entitlement grants (D-M-2: write nothing to the mirror) and
-- for partial-entitlement revokes that do not affect the stored tier
-- (D-L-1 cheap scoping), so ordering still moves forward without
-- inventing or wiping tier state.
CREATE OR REPLACE FUNCTION public.apply_webhook_mirror(
  p_user_id uuid,
  p_is_subscriber boolean,
  p_tier_level integer,
  p_event_ms bigint,
  p_touch_mirror boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_last bigint;
  v_rows integer;
BEGIN
  -- Serialize concurrent events for this user: the first transaction to
  -- reach the SELECT ... FOR UPDATE blocks the rest until it commits,
  -- so the losers always read the winner's watermark. The placeholder
  -- insert covers the first-ever event for a user (a lock on a missing
  -- row would lock nothing).
  INSERT INTO public.webhook_user_state (user_id, last_event_ms)
  VALUES (p_user_id, p_event_ms)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT last_event_ms INTO v_last
  FROM public.webhook_user_state
  WHERE user_id = p_user_id
  FOR UPDATE;
  IF v_last IS NULL THEN
    RETURN 'stale';
  END IF;
  IF v_last > p_event_ms THEN
    RETURN 'stale';
  END IF;

  UPDATE public.webhook_user_state
  SET last_event_ms = p_event_ms, updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT p_touch_mirror THEN
    RETURN 'applied';
  END IF;

  IF p_is_subscriber THEN
    -- Bare profile row for profile-less legacy users (first_name
    -- DEFAULT '' covers the NOT NULL column, same shape as the old
    -- webhook code). journey_stats.user_id references profiles(id).
    INSERT INTO public.profiles (id)
    VALUES (p_user_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  UPDATE public.journey_stats
  SET is_subscriber = p_is_subscriber, tier_level = p_tier_level
  WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Grants with no journey_stats row yet insert a pass-1 row (old code
  -- behaviour); revokes with no row need no row.
  IF v_rows = 0 AND p_is_subscriber THEN
    INSERT INTO public.journey_stats (user_id, journey_pass, is_subscriber, tier_level)
    VALUES (p_user_id, 1, true, p_tier_level);
  END IF;

  RETURN 'applied';
END;
$$;
REVOKE ALL ON FUNCTION public.apply_webhook_mirror(uuid, boolean, integer, bigint, boolean) FROM anon, authenticated;

-- ── 5. Delete-account tombstone + insert guards (E-M1) ──────────────────

CREATE TABLE IF NOT EXISTS public.deleted_users (
  user_id uuid PRIMARY KEY,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.deleted_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deleted_users FROM anon, authenticated;

-- Profiles: block re-creation of a deleted account by id.
CREATE OR REPLACE FUNCTION public.reject_deleted_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.deleted_users WHERE user_id = NEW.id) THEN
    RAISE EXCEPTION 'account deleted: profile re-creation is blocked';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_reject_deleted_profile_insert ON public.profiles;
CREATE TRIGGER trg_reject_deleted_profile_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.reject_deleted_profile_insert();

-- Wall tables: block wall posts from a deleted account's unexpired JWT
-- (anonymous posts carry user_id NULL and are unaffected by the guard).
CREATE OR REPLACE FUNCTION public.reject_deleted_wall_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.deleted_users WHERE user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'account deleted: wall post is blocked';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_reject_deleted_echo_insert ON public.community_echoes;
CREATE TRIGGER trg_reject_deleted_echo_insert
  BEFORE INSERT ON public.community_echoes
  FOR EACH ROW EXECUTE FUNCTION public.reject_deleted_wall_insert();
DROP TRIGGER IF EXISTS trg_reject_deleted_testimony_insert ON public.community_testimonies;
CREATE TRIGGER trg_reject_deleted_testimony_insert
  BEFORE INSERT ON public.community_testimonies
  FOR EACH ROW EXECUTE FUNCTION public.reject_deleted_wall_insert();
