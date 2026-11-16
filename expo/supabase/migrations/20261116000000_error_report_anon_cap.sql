-- =====================================================================
-- error_reports: per-IP + per-user + global caps via quota tables
-- (P0-8 rework, 2026-11-16). STAGED ONLY — not applied anywhere.
-- This file REPLACES the earlier draft of 20261116000000 (shared
-- 1000/day anonymous COUNT(*) cap). Read the current staged file's
-- header before assuming the old design; it is superseded in full.
--
-- VERIFIED BEFORE WRITING (repo HEAD 9bdf33d):
--   * Table (20260820000000): id, user_id (NULL or = auth.uid() per
--     the 20261024000000 policy), platform, app_version, message,
--     stack, context jsonb, created_at. Base grants: REVOKE ALL then
--     GRANT INSERT to anon/authenticated (append-only, unreadable).
--   * 20261025000020 §H25 added: caller_uid column + BEFORE INSERT
--     trigger enforce_error_report_daily_cap() (100/day per
--     caller_uid when auth.uid() IS NOT NULL; anonymous callers were
--     UNCAPPED — the hole the first draft of this file closed with a
--     shared 1000/day COUNT(*) cap) + payload CHECKs
--     (message <= 1000, stack <= 6000 or NULL, context
--     pg_column_size < 8192, all validated in-file). The 100/day
--     number was explicitly "PROPOSED, NOT APPROVED" in 00020; it is
--     kept here unchanged (changing it is a Kai decision).
--   * Payload CHECKs: the brief's example (message <= 2000) is
--     SUPERSEDED by the existing stricter bound (message <= 1000,
--     mirroring the client cap in lib/crashReporter.ts). This file
--     restates the §H25 CHECKs unchanged — it does NOT loosen 1000
--     to 2000. Stack/context bounds likewise unchanged.
--   * Guests are real anonymous-auth users (signInAnonymously), so
--     the 100/day-per-user branch applies to them; the per-IP branch
--     below is ONLY for truly unauthenticated callers
--     (auth.uid() IS NULL). Service-role inserts skip all caps
--     (auth.role() = 'service_role', or NULL for direct SQL), as in
--     00020's comment.
--   * `cf-connecting-ip` has NO precedent in the repo (grep: zero
--     hits). The header read uses PostgREST's documented
--     per-transaction `request.headers` setting. x-forwarded-for is
--     deliberately NOT used (client-spoofable). If the header is
--     absent, the per-IP check is skipped for that insert — the
--     global 1,000/day ceiling below still bounds the flood.
--   * No expo code references caller_uid (grep over expo/: zero
--     hits); only 00020 + the superseded draft of this file do.
--
-- WHAT THIS DOES (replacing caller_uid counting entirely):
--   1. Quota tables, each holding ONLY aggregate counters — never
--      joined to a report row, no report id, no message/stack:
--        error_report_quotas       (uid, day, count)   — 100/day/user
--        error_report_ip_quotas    (ip_hash, hour, count) — 20/hour/IP
--        error_report_global_quota (day, count)        — 1,000/day all
--      All RLS-enabled, REVOKE ALL from anon/authenticated, no
--      policies: only the SECURITY DEFINER trigger (owner) reads and
--      writes them. ip_hash is a salted SHA-256 of cf-connecting-ip
--      (salt in owner-only error_report_ip_salt, generated at deploy;
--      same pattern as prayer_wall_amen_salt in 20261116000002).
--   2. Trigger rewrite: prune rows older than 30 days (reports +
--      quota rows), then per-user OR per-IP cap, then the global
--      ceiling — in that order, so a global-full rejection never
--      burns per-user/IP quota and a per-user rejection never burns
--      global quota. Each counter uses ensure-row + SELECT ... FOR
--      UPDATE + conditional increment, so the caps are EXACT (the
--      old count-then-insert could overshoot under concurrency) and
--      a rejected insert consumes NO quota (contrast the TTS limiter,
--      where rejects consume the minute bucket).
--   3. Drops the caller_uid column (its counting job moves to the
--      quota tables; attribution stays in user_id, constrained by
--      the 20261024000000 policy to NULL or the caller's own id).
--   4. Restates the §H25 payload CHECKs unchanged (message <= 1000,
--      stack <= 6000, context < 8192 bytes) + explicit
--      REVOKE SELECT / UPDATE / DELETE from anon/authenticated
--      (INSERT stays granted; the base REVOKE ALL already removed
--      the rest — restated here so the intent is explicit).
--
-- DEPLOY: staging first, then live. Re-runnable where marked.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Quota tables (aggregate counters only) ──────────────────────────

CREATE TABLE IF NOT EXISTS public.error_report_quotas (
  uid uuid NOT NULL,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (uid, day)
);
ALTER TABLE public.error_report_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.error_report_quotas FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.error_report_ip_quotas (
  ip_hash text NOT NULL,
  hour timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (ip_hash, hour)
);
ALTER TABLE public.error_report_ip_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.error_report_ip_quotas FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.error_report_global_quota (
  day date PRIMARY KEY,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0)
);
ALTER TABLE public.error_report_global_quota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.error_report_global_quota FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.error_report_ip_salt (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  salt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.error_report_ip_salt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.error_report_ip_salt FROM anon, authenticated;

INSERT INTO public.error_report_ip_salt (id, salt)
VALUES (1, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

-- ── 2. Cap trigger (replaces the 00020 / superseded-draft trigger) ────

CREATE OR REPLACE FUNCTION public.enforce_error_report_daily_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_hour timestamptz := date_trunc('hour', now());
  v_count integer;
  v_headers jsonb;
  v_ip text;
  v_salt text;
  v_ip_hash text;
BEGIN
  -- Service-role / direct-SQL sessions never consume quota and are
  -- never blocked (triage inserts). auth.role() is NULL outside a
  -- JWT session (psql as postgres) — treated as service here.
  IF COALESCE(auth.role(), 'service_role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Retention prune (30 days), reports + quota rows. Runs as the
  -- table owner inside the trigger; a prune failure fails the
  -- insert loudly rather than silently growing the table — the
  -- DELETEs are single-table range deletes and cannot reasonably
  -- fail on a healthy database.
  DELETE FROM public.error_reports WHERE created_at < now() - interval '30 days';
  DELETE FROM public.error_report_quotas WHERE day < CURRENT_DATE - interval '30 days';
  DELETE FROM public.error_report_ip_quotas WHERE hour < now() - interval '2 days';
  DELETE FROM public.error_report_global_quota WHERE day < CURRENT_DATE - interval '30 days';

  IF auth.uid() IS NOT NULL THEN
    -- Per-user 100/day (100 was "proposed, not approved" in 00020
    -- §H25; kept unchanged — changing it is a Kai decision).
    -- Guests are anonymous-auth users, so this branch covers them.
    INSERT INTO public.error_report_quotas (uid, day, count)
    VALUES (auth.uid(), v_day, 0)
    ON CONFLICT (uid, day) DO NOTHING;
    SELECT count INTO v_count FROM public.error_report_quotas
    WHERE uid = auth.uid() AND day = v_day FOR UPDATE;
    IF v_count >= 100 THEN
      RAISE EXCEPTION 'ERROR_REPORT_DAILY_LIMIT: daily error report limit reached';
    END IF;
    UPDATE public.error_report_quotas SET count = v_count + 1
    WHERE uid = auth.uid() AND day = v_day;
  ELSE
    -- Truly unauthenticated: per-IP 20/hour from cf-connecting-ip.
    -- x-forwarded-for is NEVER used (client-spoofable). No header ->
    -- no per-IP accounting for this insert; the global ceiling below
    -- still bounds it.
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
      SELECT salt INTO v_salt FROM public.error_report_ip_salt WHERE id = 1;
      IF v_salt IS NULL THEN
        RAISE EXCEPTION 'ERROR_REPORT_SALT_MISSING: error-report IP salt is not configured' USING ERRCODE = 'P0001';
      END IF;
      v_ip_hash := encode(digest(v_salt || ':' || v_ip, 'sha256'), 'hex');
      INSERT INTO public.error_report_ip_quotas (ip_hash, hour, count)
      VALUES (v_ip_hash, v_hour, 0)
      ON CONFLICT (ip_hash, hour) DO NOTHING;
      SELECT count INTO v_count FROM public.error_report_ip_quotas
      WHERE ip_hash = v_ip_hash AND hour = v_hour FOR UPDATE;
      IF v_count >= 20 THEN
        RAISE EXCEPTION 'ERROR_REPORT_IP_LIMIT: too many error reports from this network this hour';
      END IF;
      UPDATE public.error_report_ip_quotas SET count = v_count + 1
      WHERE ip_hash = v_ip_hash AND hour = v_hour;
    END IF;
  END IF;

  -- Global 1,000/day ceiling across ALL callers (last, so a
  -- per-user/IP rejection never burns global quota).
  INSERT INTO public.error_report_global_quota (day, count)
  VALUES (v_day, 0)
  ON CONFLICT (day) DO NOTHING;
  SELECT count INTO v_count FROM public.error_report_global_quota
  WHERE day = v_day FOR UPDATE;
  IF v_count >= 1000 THEN
    RAISE EXCEPTION 'ERROR_REPORT_GLOBAL_LIMIT: daily error report limit reached';
  END IF;
  UPDATE public.error_report_global_quota SET count = v_count + 1
  WHERE day = v_day;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_error_report_daily_cap ON public.error_reports;
CREATE TRIGGER enforce_error_report_daily_cap
  BEFORE INSERT ON public.error_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_error_report_daily_cap();

-- ── 3. Drop caller_uid (counting now lives in the quota tables) ───────
-- The function above no longer references the column, so the drop is
-- safe to run after the CREATE OR REPLACE. Attribution stays in
-- user_id (NULL or the caller's own id, per the 20261024000000
-- policy). Column revokes on caller_uid from 00020 vanish with it.

ALTER TABLE public.error_reports DROP COLUMN IF EXISTS caller_uid;

-- ── 4. Payload CHECKs (restated unchanged from 00020 §H25) ────────────
-- message <= 1000 (NOT 2000: the brief's example is superseded by the
-- existing stricter bound, mirroring the client cap), stack <= 6000,
-- context < 8192 bytes. Re-validated in-file as 00020 did.

ALTER TABLE public.error_reports DROP CONSTRAINT IF EXISTS error_reports_message_len;
ALTER TABLE public.error_reports
  ADD CONSTRAINT error_reports_message_len CHECK (char_length(message) <= 1000) NOT VALID;
ALTER TABLE public.error_reports DROP CONSTRAINT IF EXISTS error_reports_stack_len;
ALTER TABLE public.error_reports
  ADD CONSTRAINT error_reports_stack_len CHECK (stack IS NULL OR char_length(stack) <= 6000) NOT VALID;
ALTER TABLE public.error_reports VALIDATE CONSTRAINT error_reports_message_len;
ALTER TABLE public.error_reports VALIDATE CONSTRAINT error_reports_stack_len;
ALTER TABLE public.error_reports VALIDATE CONSTRAINT lane5_error_reports_context_size;

-- ── 5. Explicit client-role revokes (INSERT stays granted) ─────────────

REVOKE SELECT, UPDATE, DELETE ON public.error_reports FROM anon, authenticated;
GRANT INSERT ON public.error_reports TO anon, authenticated;

-- STAGING TESTS (anon key + authenticated JWTs; do NOT run the flood
-- parts on live):
--   1. One authenticated insert succeeds; error_report_quotas gains
--      (uid, today, 1); error_reports has NO caller_uid column.
--   2. Same user to 100 in a day -> 101st fails with
--      ERROR_REPORT_DAILY_LIMIT; quota row stays at 100 (rejected
--      inserts consume no quota).
--   3. Anonymous-auth guest (signInAnonymously) -> same 100/day
--      per-user branch (proves guests are not on the IP branch).
--   4. True anon (no JWT) with header cf-connecting-ip: 1.2.3.4 ->
--      20 inserts in an hour succeed, 21st fails with
--      ERROR_REPORT_IP_LIMIT; a different IP is unaffected.
--      (PostgREST forwards request headers into request.headers;
--      set the header with curl against the staging API.)
--   5. True anon with NO cf-connecting-ip header -> insert succeeds
--      (global ceiling still applies; no IP row is written).
--   6. Global ceiling: drive the global counter to 1000 (via a
--      staging-only service-role UPDATE on
--      error_report_global_quota, not by writing 1000 rows) -> next
--      insert from any caller fails with ERROR_REPORT_GLOBAL_LIMIT.
--      Reset the staging counter after.
--   7. Service-role insert -> succeeds with no quota rows written.
--   8. message 1001 chars or stack 6001 chars -> CHECK violation;
--      message 1000 / stack 6000 -> lands.
--   9. Retention: insert a row with created_at 31 days ago via
--      service role, then insert a fresh row -> the old row is gone.
--  10. SELECT / UPDATE / DELETE on error_reports as anon or
--      authenticated -> permission denied.
--  11. Re-run this migration file -> no error (idempotent), except
--      the DROP COLUMN (no-op the second time).
