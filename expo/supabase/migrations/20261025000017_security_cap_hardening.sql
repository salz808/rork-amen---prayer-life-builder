/*
  # Security cap hardening (pre-launch audit lane 1, 2026-10-25)
  #
  # NEW migration. Never edit 00010 or 00016 (or any deployed migration):
  # every change below supersedes an earlier definition via
  # CREATE OR REPLACE, or adds a constraint — the pattern 00010 itself
  # used to supersede live functions. Deploy order: 00010 -> 00017,
  # staging first, then the post-deploy JWT matrix plus the new
  # backdated-insert matrix steps (see prelaunch-00017-matrix-steps.md).
  #
  # Contents:
  #   1. PL-H1 — enforce_report_daily_cap(): force NEW.created_at := now()
  #      so a direct-PostgREST insert with a backdated created_at can no
  #      longer dodge the 10/day report cap. (00010:514 definition,
  #      already SECURITY DEFINER SET search_path = '' — that part was
  #      verified present and is NOT changed.)
  #   2. Lane-1 M-1 — enforce_bug_report_daily_limit(): the identical
  #      one-liner for the 5/day bug-report cap. (00016 definition,
  #      already SECURITY DEFINER SET search_path = '' — unchanged.)
  #      Both RPC paths already omit created_at, so no legitimate path
  #      sets it and nothing breaks.
  #   3. Lane-1 L-1 — length CHECKs (<= 200) on the four bug_reports
  #      diagnostics columns, which were bare nullable text.
  #   4. Lane-1 L-6 — SET search_path = '' on the three 00010 trigger
  #      functions that lacked it: guard_profiles_moderator_flag,
  #      guard_wall_hidden_fields, guard_prayer_notification_update.
  #      Bodies are verbatim copies of the 00010 definitions; only the
  #      SET clause is added. All three reference only NEW/OLD/
  #      current_user/TG_OP, so an empty search_path changes no
  #      behaviour. (The two cap functions above already had it, and
  #      normalize_wall_text has no table references, so they are
  #      untouched on this point.)
  #   5. Lane-1 M-2 — blocklist hardening, matching-view ONLY (stored
  #      text is never altered):
  #      (a) public.fold_fullwidth_ascii(): folds U+FF01..U+FF5E
  #          fullwidth ASCII to ASCII (offset 0xFEE0) and U+3000
  #          ideographic space to a space. Applied in
  #          check_wall_text_blocked BEFORE matching, on top of the
  #          unchanged 00010 normalize_wall_text() — the 00010
  #          function is deliberately NOT redefined here, so its
  #          11-map accent/Cyrillic/Greek chain cannot be damaged by
  #          transcription.
  #      (b) Adjacent-repeat collapse as an ADDITIONAL matching view:
  #          collapsed leet + collapsed spaced views, matched against
  #          the collapsed term. The original views still run first,
  #          so doubled terms themselves (asshole, piss, faggot)
  #          still match exactly.
  #      (c) Collapsed-view exclusions, with reasons: 'nigger' is
  #          skipped in the collapsed view because its collapsed form
  #          'niger' is Niger (country/river — plausible prayer
  #          vocabulary: "praying for Niger"); 'faggot' is skipped
  #          because its collapsed form 'fagot' is a real word
  #          (bassoon / bundle of sticks). Both exact forms remain
  #          blocked by the original views; only triple-letter
  #          evasions of those two (nigggger, fagggot) stay open.
  #          Legitimate prayer vocabulary was checked against every
  #          other collapsed term (fuk, bulshit, ashole, pusy, pis,
  #          trany, etc.): no other collision found. hell/damn and
  #          other theological words are not blocklist terms at all
  #          and are unaffected.
  #      Deferred, with reasons (see the lane-A fix report): non-leet
  #      letter substitutions (fvck, phuck — unbounded swap space, a
  #      fixed map would be ad-hoc); spaced repeats (f u u c k —
  #      closing it needs a letter-stripped view, which would newly
  #      block words like "peacock", whose letters contain "cock");
  #      mathematical-alphanumeric scripts (bold/italic/fraktur —
  #      many ranges, same fold pattern as fullwidth when needed).
  #      The real controls for those residuals are unchanged:
  #      3-reporter auto-hide, moderator review, reporting.
  #
  # Verification: SQL hand-checked offline only (no psql/pglast, no
  # live DB). The redefined bodies were diffed against their 00010 /
  # 00016 originals after writing: the only deltas are the ones
  # listed above. CREATE OR REPLACE preserves existing grants and
  # trigger attachments, so no REVOKE/GRANT or trigger re-creation
  # appears below — the 00010 revokes (incl. the check-function
  # oracle revoke) stay in force untouched.
  #
  # This migration intentionally does NOT touch: profiles.first_name
  # (lane-1 L-3, needs a product decision on identity vs moderation),
  # the TTS cache key (lane-1 L-2, edge-function file outside lane-A
  # ownership, correctness-only), delete-account (L-5, edge file),
  # sync_deletes DELETE policy (L-8, client file), circle cap races
  # (L-9, circles hidden for launch), error_reports anon flood (L-4,
  # deferred post-launch by the lane itself), or Realtime RLS (L-10,
  # live-dashboard setting, deploy-gate item).
*/

-- =====================================================================
-- 1. PL-H1: force report created_at (supersedes 00010:514).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enforce_report_daily_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count bigint;
  v_day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
BEGIN
  -- PL-H1 fix: created_at is caller-settable on direct inserts, and
  -- the cap below counts created_at >= day start. Force it first so
  -- a backdated created_at can never dodge the cap.
  NEW.created_at := now();
  IF TG_TABLE_NAME = 'echo_reports' AND EXISTS (
    SELECT 1 FROM public.echo_reports
    WHERE echo_id = NEW.echo_id AND reporter_id = NEW.reporter_id
  ) THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'testimony_reports' AND EXISTS (
    SELECT 1 FROM public.testimony_reports
    WHERE testimony_id = NEW.testimony_id AND reporter_id = NEW.reporter_id
  ) THEN
    RETURN NEW;
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

-- =====================================================================
-- 2. Lane-1 M-1: force bug-report created_at (supersedes 00016).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enforce_bug_report_daily_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  day_start timestamptz := (date_trunc('day', (now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC');
  report_count integer;
BEGIN
  -- M-1 fix: same backdating hole as PL-H1 (spam-only impact here).
  NEW.created_at := now();
  SELECT count(*) INTO report_count
  FROM public.bug_reports
  WHERE user_id = NEW.user_id
    AND created_at >= day_start;
  IF report_count >= 5 THEN
    RAISE EXCEPTION 'BUG_REPORT_DAILY_LIMIT: one user may submit at most 5 bug reports per day';
  END IF;
  RETURN NEW;
END;
$$;

-- =====================================================================
-- 3. Lane-1 L-1: bound the bug_reports diagnostics columns.
--    (description already had its <= 2000 CHECK in 00016.)
-- =====================================================================
ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_app_version_len CHECK (char_length(app_version) <= 200);
ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_build_number_len CHECK (char_length(build_number) <= 200);
ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_platform_len CHECK (char_length(platform) <= 200);
ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_os_version_len CHECK (char_length(os_version) <= 200);

-- =====================================================================
-- 4. Lane-1 L-6: search_path hygiene on the three 00010 guards.
--    Bodies verbatim from 00010; only "SET search_path = ''" added.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.guard_profiles_moderator_flag()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND NEW.is_moderator THEN
      RAISE EXCEPTION 'MODERATION_FLAG_GUARD: is_moderator is set by service role only';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.is_moderator IS DISTINCT FROM OLD.is_moderator THEN
      RAISE EXCEPTION 'MODERATION_FLAG_GUARD: is_moderator is set by service role only';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_wall_hidden_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.hidden_at IS DISTINCT FROM OLD.hidden_at
      OR NEW.hidden_reason IS DISTINCT FROM OLD.hidden_reason THEN
      RAISE EXCEPTION 'MODERATION_HIDDEN_GUARD: hidden fields change only via moderator review';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_prayer_notification_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.recipient_id IS DISTINCT FROM NEW.recipient_id
    OR OLD.echo_id IS DISTINCT FROM NEW.echo_id
    OR OLD.milestone IS DISTINCT FROM NEW.milestone
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'MODERATION_BELL_GUARD: only seen_at may change on prayer notifications';
  END IF;
  RETURN NEW;
END;
$$;

-- =====================================================================
-- 5. Lane-1 M-2: fullwidth fold + adjacent-repeat collapse.
-- =====================================================================

-- New helper: fold fullwidth ASCII (U+FF01..U+FF5E, offset 0xFEE0)
-- to plain ASCII, and U+3000 ideographic space to a space. Pure
-- function (pg_catalog built-ins only), so SET search_path = '' is
-- safe. Matching-view only — stored text is never passed through it.
CREATE OR REPLACE FUNCTION public.fold_fullwidth_ascii(p_text text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  out_text text := '';
  i int;
  cp int;
  ch text;
BEGIN
  IF p_text IS NULL THEN
    RETURN '';
  END IF;
  FOR i IN 1 .. char_length(p_text) LOOP
    ch := substr(p_text, i, 1);
    cp := ascii(ch);
    IF cp BETWEEN 65281 AND 65374 THEN
      -- U+FF01 ('!') .. U+FF5E ('~') -> ASCII 33..126.
      out_text := out_text || chr(cp - 65248);
    ELSIF cp = 12288 THEN
      -- U+3000 ideographic space -> ASCII space.
      out_text := out_text || ' ';
    ELSE
      out_text := out_text || ch;
    END IF;
  END LOOP;
  RETURN out_text;
END;
$$;

-- Redefined check (supersedes 00010:212). Everything from the 00010
-- body is preserved verbatim except: folded now passes through the
-- fullwidth fold, and a collapsed-view match runs as an additional
-- signal after the original two checks.
CREATE OR REPLACE FUNCTION public.check_wall_text_blocked(p_text text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t text;
  folded text;
  leet text;
  spaced text;
  collapsed_leet text;
  collapsed_spaced text;
  collapsed_t text;
  pat text;
  pat2 text;
  pat3 text;
  pat4 text;
  ch text;
  i int;
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN false;
  END IF;
  -- Normalization BEFORE matching: 00010 folds (lowercase,
  -- zero-width strip, accent/Cyrillic/Greek) plus the new fullwidth
  -- fold. Stored text is never altered; only this view is matched.
  folded := public.fold_fullwidth_ascii(public.normalize_wall_text(p_text));
  leet := translate(folded, '013457@$', 'oieastas');
  spaced := regexp_replace(folded, '[^a-z]+', ' ', 'g');
  -- Adjacent-repeat collapse (fuuuck -> fuck, shiiit -> shit).
  -- Applied to both matching views, never to stored text. Separator
  -- runs collapse harmlessly (the separator pattern tolerates any
  -- run length); word boundaries are preserved, so collapsing can
  -- never join two words into a term.
  collapsed_leet := regexp_replace(leet, '(.)\1+', '\1', 'g');
  collapsed_spaced := regexp_replace(spaced, '(.)\1+', '\1', 'g');
  FOR t IN
    SELECT b.term FROM public.moderation_blocklist b
    WHERE NOT EXISTS (
      SELECT 1 FROM public.moderation_allowlist a
      WHERE lower(a.term) = lower(b.term)
    )
  LOOP
    t := lower(t);
    pat := '(^|[^a-z])';
    FOR i IN 1 .. char_length(t) LOOP
      ch := substr(t, i, 1);
      IF i = 1 THEN
        pat := pat || ch;
      ELSE
        pat := pat || '[^a-z]*(' || ch || '|[^a-z])';
      END IF;
    END LOOP;
    pat := pat || '([^a-z]|$)';
    pat2 := '\m' || regexp_replace(t, '([.*+?^${}()|[\]\\])', '\\\1', 'g') || '\M';
    IF leet ~ pat OR spaced ~ pat2 THEN
      RETURN true;
    END IF;
    -- Collapsed-view match, as an additional signal only. Skipped
    -- for 'nigger' (collapsed 'niger' = Niger, the country/river)
    -- and 'faggot' (collapsed 'fagot' = bassoon / bundle of
    -- sticks): both exact forms are still blocked by the checks
    -- above, so only triple-letter evasions of those two stay open.
    IF t NOT IN ('nigger', 'faggot') THEN
      collapsed_t := regexp_replace(t, '(.)\1+', '\1', 'g');
      pat3 := '(^|[^a-z])';
      FOR i IN 1 .. char_length(collapsed_t) LOOP
        ch := substr(collapsed_t, i, 1);
        IF i = 1 THEN
          pat3 := pat3 || ch;
        ELSE
          pat3 := pat3 || '[^a-z]*(' || ch || '|[^a-z])';
        END IF;
      END LOOP;
      pat3 := pat3 || '([^a-z]|$)';
      pat4 := '\m' || regexp_replace(collapsed_t, '([.*+?^${}()|[\]\\])', '\\\1', 'g') || '\M';
      IF collapsed_leet ~ pat3 OR collapsed_spaced ~ pat4 THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;
-- NOTE: no GRANT/REVOKE here on purpose. CREATE OR REPLACE preserves
-- the 00010 oracle revoke (check_wall_text_blocked revoked from
-- anon, public, authenticated); the trigger functions above are
-- SECURITY DEFINER, so the nested call needs no caller grant.
