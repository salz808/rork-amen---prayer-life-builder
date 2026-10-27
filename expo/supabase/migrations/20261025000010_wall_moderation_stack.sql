-- Wall moderation stack (build 7, Kai-approved 2026-10-25).
-- AMENDED 2026-10-25 (audit round 4, fix lane 1) BEFORE ANY DEPLOY.
-- This file was never deployed, so it is amended in place rather than
-- repaired by a follow-up migration. Deployed migrations 00000-00009 are
-- NOT edited here; functions/policies they created are redefined below
-- with CREATE OR REPLACE / DROP + CREATE, which is the normal way a new
-- migration supersedes a live definition.
--
-- Three server-enforced mechanisms. Client pre-checks are UX only; the
-- triggers + RLS below are the gate, so direct API writes cannot bypass
-- them (same lesson as the round-2 B1 wall INSERT policy hole).
--
-- 1. Blocklist: a short list of unambiguous profanity / slurs / explicit
--    sexual terms. Deliberately NOT theological vocabulary ("hell" shows up
--    in legitimate prayers) and NOT mild/ambiguous words. Matching is
--    normalized before matching (accent/homoglyph folding, leet mapping,
--    separator-tolerant matching, whole-word matching on a
--    separator-normalized copy), so underscore/digit joining, zero-width
--    characters, homoglyphs, leetspeak and spaced-out letters do not evade
--    it. The list will never be exhaustive: the report path is the real
--    backstop, not a longer list. A manual allowlist table
--    (moderation_allowlist, service-role only) exempts a term outright
--    for false positives (e.g. a name); moderator unhide covers the rest.
--    NOTE: the earlier claim that evasion is "handled by flagging" is
--    withdrawn — no flagging mechanism exists in this stack.
-- 2. Report auto-hide: 3 distinct NON-ANONYMOUS, NON-AUTHOR reporters hide
--    a post from everyone (author excepted, moderators excepted via RPC).
--    Hidden rows stay in the DB for review; they are NOT deleted.
--    Reports are capped at 10 per reporter per UTC day (both tables
--    combined) and a reporter must be able to read the post they report.
-- 3. One public wall contribution per user per UTC day, SHARED across
--    public echoes and testimonies (see section 4 for the exact rule).
--    Delete-and-repost does NOT reset it: contributions are recorded in
--    wall_daily_ledger, which survives deletes. Circle echoes are exempt
--    (private-group context; circles are hidden for launch anyway) but
--    circle posting itself is member-gated by the INSERT policy (00011).
--
-- Review: moderators only, via get_hidden_wall_posts / moderate_wall_post
-- RPCs (SECURITY DEFINER with an internal moderator check, so no RLS
-- policy surgery on the wall tables is needed for review actions).
-- moderate_wall_post acts on HIDDEN rows only; unhide archives the
-- post's reports (reviewed_at), so a cleared post needs a fresh
-- threshold of NEW reports to hide again; delete removes the post and
-- its reports cascade with it. Every successful moderate action is
-- written to moderation_actions. Moderator provisioning is a deploy
-- runbook item, NOT in this migration: grant is_moderator via
-- service-role SQL only (the column is revoked + trigger-guarded here),
-- grant at least two moderators, and verify get_hidden_wall_posts
-- succeeds for each before announcing the stack live.
--
-- VERIFY AFTER DEPLOY (pg_policies, never trust DROP IF EXISTS silence):
--   SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
--   WHERE tablename IN ('community_echoes','community_testimonies',
--     'community_amens','echo_reports','testimony_reports','profiles')
--   ORDER BY tablename, cmd, policyname;
-- Expected: exactly ONE INSERT policy on community_echoes (from 00011),
-- exactly two SELECT policies on community_echoes (auth + anon below),
-- exactly one SELECT policy on community_testimonies, NO direct INSERT
-- policy on community_amens, and NO UPDATE policy on
-- community_testimonies.

-- 1. Moderator flag (MOD-1, MOD-2, RLS-10 stopgap).
-- Column revokes are the real gate (RLS cannot restrict columns); the
-- trigger is belt-and-braces for any future grant. SELECT is revoked
-- too, mirroring the 00007 rc_alias_id precedent: a client SELECT *
-- on profiles simply omits this column, and the moderator check goes
-- through the is_moderator() RPC, never a direct column select.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_moderator boolean NOT NULL DEFAULT false;

REVOKE UPDATE (is_moderator) ON public.profiles FROM authenticated, anon;
REVOKE INSERT (is_moderator) ON public.profiles FROM authenticated, anon;
REVOKE SELECT (is_moderator) ON public.profiles FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_moderator
      AND NOT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_moderator() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_moderator() TO authenticated;

-- Belt-and-braces: a PostgREST role (authenticated/anon) may never change
-- the flag, even if a future grant re-opens the column. Legitimate flag
-- changes come only from service_role / postgres (deploy runbook) or
-- from SECURITY DEFINER code running as the table owner; moderators
-- themselves act through moderate_wall_post, never by direct UPDATE.
CREATE OR REPLACE FUNCTION public.guard_profiles_moderator_flag()
RETURNS trigger LANGUAGE plpgsql AS $$
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
DROP TRIGGER IF EXISTS profiles_moderator_flag_guard ON public.profiles;
CREATE TRIGGER profiles_moderator_flag_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_moderator_flag();

-- Co-member roster RPC (RLS-10): circle members get ONLY id + first_name
-- for co-members — never is_moderator, never rc_alias_id, never the full
-- profile row. Client wiring of the roster to this RPC is a circles-lane
-- item (circles are hidden for launch); the SELECT revoke above already
-- closes the is_moderator leak regardless of which path the roster uses.
CREATE OR REPLACE FUNCTION public.get_circle_member_profiles(p_circle_id uuid)
RETURNS TABLE (id uuid, first_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = p_circle_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this circle' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.id, p.first_name
    FROM public.circle_members cm
    JOIN public.profiles p ON p.id = cm.user_id
    WHERE cm.circle_id = p_circle_id
    ORDER BY p.first_name;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_circle_member_profiles(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_circle_member_profiles(uuid) TO authenticated;

-- 2. Blocklist table + seed + allowlist. No client access: RLS enabled
-- with no policies, so only SECURITY DEFINER functions read these tables.
CREATE TABLE IF NOT EXISTS public.moderation_blocklist (
  term text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moderation_blocklist ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.moderation_allowlist (
  term text PRIMARY KEY,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moderation_allowlist ENABLE ROW LEVEL SECURITY;

INSERT INTO public.moderation_blocklist (term) VALUES
  ('fuck'), ('fucker'), ('fucking'), ('motherfucker'),
  ('shit'), ('shitty'), ('bullshit'),
  ('bitch'), ('bitches'), ('bastard'), ('asshole'), ('dick'), ('dickhead'),
  ('cock'), ('cunt'), ('pussy'), ('whore'), ('slut'), ('piss'), ('prick'),
  ('douchebag'), ('tits'),
  ('nigger'), ('nigga'), ('faggot'), ('fag'), ('dyke'),
  ('chink'), ('spic'), ('kike'), ('retard'), ('retarded'), ('tranny')
ON CONFLICT (term) DO NOTHING;

-- Normalization for matching ONLY (stored text is never altered):
-- lowercase, strip zero-width/format characters, fold accented Latin
-- letters and Cyrillic/Greek homoglyphs to plain Latin. Leet mapping and
-- separator handling happen in check_wall_text_blocked, which needs two
-- different views of the same folded text (see below).
CREATE OR REPLACE FUNCTION public.normalize_wall_text(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate( translate(
    translate(
      translate(
        translate(
          translate(
            translate(
              translate(
                translate(
                  translate(
                    translate(
                      replace(
                        replace(
                          replace(
                            replace(
                              replace(
                                lower(COALESCE(p_text, '')),
                                chr(8203), ''),
                              chr(8204), ''),
                            chr(8205), ''),
                          chr(65279), ''),
                        chr(173), ''),
                      'àáâãäå', 'aaaaaa'),
                    'èéêë', 'eeee'),
                  'ìíîï', 'iiii'),
                'òóôõöø', 'oooooo'),
              'ùúûü', 'uuuu'),
            'ýÿ', 'yy'),
          'ñ', 'n'),
        'ç', 'c'),
      'ß', 's'),
    'аеорсхуіјѕһктвнм', 'aeopcxyijshktbhm'),
  'αεορχι', 'aeopxi');
$$;

-- Matching: for each non-allowlisted term, two checks run on the folded
-- text. (a) A separator-tolerant pattern on the leet-mapped text: each
-- term letter may be preceded by any run of non-letters, and any single
-- term letter may itself be replaced by one non-letter (catches f*ck,
-- f.u.c.k, f u c k, mother fucker). (b) Whole-word matching on a copy
-- where every non-letter run became a space (catches fuck1, fuck_you,
-- where a digit/underscore joins the term to a suffix — the leet map
-- would otherwise turn fuck1 into fucki and miss it). Terms must be
-- plain lowercase letters; the allowlist exempts a term outright.
CREATE OR REPLACE FUNCTION public.check_wall_text_blocked(p_text text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t text;
  folded text;
  leet text;
  spaced text;
  pat text;
  pat2 text;
  ch text;
  i int;
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN false;
  END IF;
  folded := public.normalize_wall_text(p_text);
  leet := translate(folded, '013457@$', 'oieastas');
  spaced := regexp_replace(folded, '[^a-z]+', ' ', 'g');
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
  END LOOP;
  RETURN false;
END;
$$;
-- The direct grant is REMOVED (blocklist oracle, RLS-13): the client
-- pre-check calls this RPC and now fails open on the permission error,
-- exactly as it already does on any lookup failure — the trigger below
-- remains the gate, and both share paths surface its MODERATION_BLOCKED
-- error with a friendly alert. The trigger functions are SECURITY
-- DEFINER, so the nested call runs as the table owner and needs no
-- caller grant.
REVOKE EXECUTE ON FUNCTION public.check_wall_text_blocked(text) FROM anon, public, authenticated;

-- Blocklist gate, one trigger function per table. SECURITY DEFINER so the
-- nested check_wall_text_blocked call needs no caller grant (see above).
-- Skip-if-unchanged (M-W10): a legacy post whose text contains a listed
-- term must still be amenable and hideable — the trigger gates EDITS,
-- not unrelated counter/hide updates to the same row.
CREATE OR REPLACE FUNCTION public.enforce_echo_text_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.text IS NOT DISTINCT FROM OLD.text THEN
    RETURN NEW;
  END IF;
  IF public.check_wall_text_blocked(NEW.text) THEN
    RAISE EXCEPTION 'MODERATION_BLOCKED: wall text rejected by moderation filter';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.enforce_testimony_text_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.request IS NOT DISTINCT FROM OLD.request
    AND NEW.answer IS NOT DISTINCT FROM OLD.answer
    AND NEW.first_name IS NOT DISTINCT FROM OLD.first_name THEN
    RETURN NEW;
  END IF;
  -- first_name renders on every testimony card, so it is checked too
  -- (MOD-7). The length cap is trigger-enforced, not a CHECK constraint,
  -- so a legacy long name can never fail this migration at deploy time.
  IF char_length(COALESCE(NEW.first_name, '')) > 60 THEN
    RAISE EXCEPTION 'MODERATION_FIRST_NAME_TOO_LONG: first_name exceeds 60 characters';
  END IF;
  IF public.check_wall_text_blocked(
    COALESCE(NEW.request, '') || ' ' || COALESCE(NEW.answer, '') || ' ' || COALESCE(NEW.first_name, '')
  ) THEN
    RAISE EXCEPTION 'MODERATION_BLOCKED: wall text rejected by moderation filter';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS wall_text_policy_echoes ON public.community_echoes;
CREATE TRIGGER wall_text_policy_echoes
  BEFORE INSERT OR UPDATE ON public.community_echoes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_echo_text_policy();
DROP TRIGGER IF EXISTS wall_text_policy_testimonies ON public.community_testimonies;
CREATE TRIGGER wall_text_policy_testimonies
  BEFORE INSERT OR UPDATE ON public.community_testimonies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_testimony_text_policy();

-- 3. Hidden-field guard (MOD-4, H-W1 defense in depth). A PostgREST role
-- may never change hidden_at/hidden_reason directly — hidden changes
-- come only from SECURITY DEFINER code (auto-hide, moderate_wall_post)
-- running as the table owner, or from service_role/postgres backfill.
-- The testimony own-row UPDATE policy is dropped outright below
-- (delete-own already exists, and no client path updates testimonies),
-- so this trigger is the second lock on the same door; echoes have no
-- UPDATE policy at all, so the trigger future-proofs them too.
CREATE OR REPLACE FUNCTION public.guard_wall_hidden_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
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
DROP TRIGGER IF EXISTS wall_hidden_guard_echoes ON public.community_echoes;
CREATE TRIGGER wall_hidden_guard_echoes
  BEFORE UPDATE ON public.community_echoes
  FOR EACH ROW EXECUTE FUNCTION public.guard_wall_hidden_fields();
DROP TRIGGER IF EXISTS wall_hidden_guard_testimonies ON public.community_testimonies;
CREATE TRIGGER wall_hidden_guard_testimonies
  BEFORE UPDATE ON public.community_testimonies
  FOR EACH ROW EXECUTE FUNCTION public.guard_wall_hidden_fields();

-- (Column revokes on hidden_at/hidden_reason/created_at live in section 5,
-- AFTER the hidden columns are added — revoking a column that does not
-- exist yet would fail the migration.)

-- 4. One public wall contribution per user per UTC day, SHARED across
-- public echoes and testimonies (MOD-6). DECISIONS, documented for Kai
-- to overrule: (a) delete-and-repost does NOT reset the limit — the
-- ledger below survives deletes; (b) the cap is one per UTC day across
-- BOTH tables, not one per table; (c) circle echoes are exempt (private
-- group context, circles hidden for launch); (d) the UTC day boundary is
-- explicit: (now() AT TIME ZONE 'UTC')::date, never the session zone.
-- Race-proofing is the per-user advisory lock PLUS the ledger primary
-- key (a unique backstop): two concurrent transactions serialize on the
-- lock, and any path that somehow skips the lock still hits the PK.
-- NOTE on the audit's "partial unique index" suggestion: a UTC-day
-- expression over timestamptz is STABLE (timezone-database dependent),
-- not IMMUTABLE, so Postgres refuses it in an index expression; the
-- ledger PK is the unique backstop instead. Legacy pre-00010 posts do
-- not seed the ledger, so a user who posted before deploy gets one
-- fresh contribution on deploy day — accepted, documented here.
CREATE TABLE IF NOT EXISTS public.wall_daily_ledger (
  user_id uuid NOT NULL,
  day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.wall_daily_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wall_daily_ledger FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_daily_wall_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- created_at is caller-settable on wall inserts and pins feed order,
  -- so it is forced server-side on EVERY echo insert (public or circle).
  NEW.created_at := now();
  IF NEW.circle_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('wall-daily:' || NEW.user_id::text)::bigint);
  BEGIN
    INSERT INTO public.wall_daily_ledger (user_id, day)
    VALUES (NEW.user_id, (now() AT TIME ZONE 'UTC')::date);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'MODERATION_DAILY_LIMIT: one public wall post per day';
  END;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.enforce_testimony_daily_wall_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Testimonies share the same one-per-UTC-day ledger as public echoes
  -- (a testimony insert after an echo insert the same day fails here,
  -- and vice versa), and their created_at is forced for the same reason.
  NEW.created_at := now();
  PERFORM pg_advisory_xact_lock(hashtext('wall-daily:' || NEW.user_id::text)::bigint);
  BEGIN
    INSERT INTO public.wall_daily_ledger (user_id, day)
    VALUES (NEW.user_id, (now() AT TIME ZONE 'UTC')::date);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'MODERATION_DAILY_LIMIT: one public wall post per day';
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS wall_daily_limit ON public.community_echoes;
CREATE TRIGGER wall_daily_limit
  BEFORE INSERT ON public.community_echoes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_wall_limit();
DROP TRIGGER IF EXISTS wall_daily_limit_testimony ON public.community_testimonies;
CREATE TRIGGER wall_daily_limit_testimony
  BEFORE INSERT ON public.community_testimonies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_testimony_daily_wall_limit();

-- 5. Hidden columns + auto-hide at 3 distinct reporters (MOD-5, MOD-9).
-- Auto-hide functions are SECURITY DEFINER (the 3rd report used to fail
-- RLS: echoes have no UPDATE policy, testimonies only own-row). The
-- count is unreviewed, non-author reports only (MOD-3/MOD-10): self
-- reports are rejected at insert time, and moderator-unhide archives
-- reports, so a cleared post needs 3 FRESH reports to hide again.
-- Round-5 lane-5 H5: hiding an echo NO LONGER deletes its bell rows.
-- The old DELETE destroyed milestone history on every brigade false
-- positive (unhide could never restore it). Bell rows are now preserved
-- and suppressed at the bell READ path instead (database.ts filters
-- bells whose echo is hidden), so MOD-9 still holds — hidden text never
-- surfaces via bells — while unhide automatically restores the history
-- (hidden_at clears, the read filter passes again).
ALTER TABLE public.community_echoes ADD COLUMN IF NOT EXISTS hidden_at timestamptz;
ALTER TABLE public.community_echoes ADD COLUMN IF NOT EXISTS hidden_reason text;
ALTER TABLE public.community_testimonies ADD COLUMN IF NOT EXISTS hidden_at timestamptz;
ALTER TABLE public.community_testimonies ADD COLUMN IF NOT EXISTS hidden_reason text;
-- Column revokes, defense in depth alongside the guard trigger (section 3)
-- and the dropped testimony UPDATE policy (section 6): no PostgREST role
-- writes hidden fields or forges created_at on either wall table. The
-- amen RPC and moderator RPCs run SECURITY DEFINER as the owner and are
-- unaffected.
REVOKE UPDATE (hidden_at, hidden_reason, created_at) ON public.community_echoes FROM authenticated, anon;
REVOKE UPDATE (hidden_at, hidden_reason, created_at) ON public.community_testimonies FROM authenticated, anon;
CREATE INDEX IF NOT EXISTS idx_echoes_hidden ON public.community_echoes(hidden_at) WHERE hidden_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_testimonies_hidden ON public.community_testimonies(hidden_at) WHERE hidden_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.auto_hide_reported_echo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(DISTINCT r.reporter_id) INTO v_count
  FROM public.echo_reports r
  JOIN public.community_echoes e ON e.id = r.echo_id
  WHERE r.echo_id = NEW.echo_id
    AND r.reviewed_at IS NULL
    AND r.reporter_id <> e.user_id;
  IF v_count >= 3 THEN
    UPDATE public.community_echoes
    SET hidden_at = now(), hidden_reason = 'reports'
    WHERE id = NEW.echo_id AND hidden_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.auto_hide_reported_testimony()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(DISTINCT r.reporter_id) INTO v_count
  FROM public.testimony_reports r
  JOIN public.community_testimonies t ON t.id = r.testimony_id
  WHERE r.testimony_id = NEW.testimony_id
    AND r.reviewed_at IS NULL
    AND r.reporter_id <> t.user_id;
  IF v_count >= 3 THEN
    UPDATE public.community_testimonies
    SET hidden_at = now(), hidden_reason = 'reports'
    WHERE id = NEW.testimony_id AND hidden_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS auto_hide_echo ON public.echo_reports;
CREATE TRIGGER auto_hide_echo
  AFTER INSERT ON public.echo_reports
  FOR EACH ROW EXECUTE FUNCTION public.auto_hide_reported_echo();
DROP TRIGGER IF EXISTS auto_hide_testimony ON public.testimony_reports;
CREATE TRIGGER auto_hide_testimony
  AFTER INSERT ON public.testimony_reports
  FOR EACH ROW EXECUTE FUNCTION public.auto_hide_reported_testimony();

-- 6. Report tables: review archive column, reason cap, and the
-- per-reporter daily cap (MOD-3, MOD-10, L-W6).
ALTER TABLE public.echo_reports ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.testimony_reports ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
-- Conditional adds (idempotent for staging retries), NOT VALID so a
-- legacy long reason can never fail the migration — new rows are still
-- capped, and lane 5's 00012 adds the same 500-char caps the same way.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'echo_reports_reason_length') THEN
    ALTER TABLE public.echo_reports ADD CONSTRAINT echo_reports_reason_length
      CHECK (reason IS NULL OR char_length(reason) <= 500) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'testimony_reports_reason_length') THEN
    ALTER TABLE public.testimony_reports ADD CONSTRAINT testimony_reports_reason_length
      CHECK (reason IS NULL OR char_length(reason) <= 500) NOT VALID;
  END IF;
END $$;

-- Per-reporter daily report cap: 10 reports per reporter per UTC day,
-- both tables combined. Enforced by trigger so the direct-INSERT path
-- is capped exactly like the RPC path. A re-report of an already
-- reported post is a no-op (ON CONFLICT DO NOTHING) and must not trip
-- the cap, so duplicates short-circuit before counting.
CREATE OR REPLACE FUNCTION public.enforce_report_daily_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count bigint;
  v_day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
BEGIN
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
DROP TRIGGER IF EXISTS report_daily_cap_echo ON public.echo_reports;
CREATE TRIGGER report_daily_cap_echo
  BEFORE INSERT ON public.echo_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_report_daily_cap();
DROP TRIGGER IF EXISTS report_daily_cap_testimony ON public.testimony_reports;
CREATE TRIGGER report_daily_cap_testimony
  BEFORE INSERT ON public.testimony_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_report_daily_cap();

-- Report INSERT policies (direct path): non-anonymous reporters only,
-- never the author, and only posts the reporter can actually read
-- (public-or-member for echoes, unhidden-or-moderator for hidden posts).
-- The RPCs below enforce the same rules; both paths must agree, because
-- either one alone is bypassable.
DROP POLICY IF EXISTS "Users can file reports" ON public.echo_reports;
CREATE POLICY "Users can file reports"
  ON public.echo_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reporter_id
    AND NOT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    AND EXISTS (
      SELECT 1 FROM public.community_echoes e
      WHERE e.id = echo_reports.echo_id
        AND e.user_id <> auth.uid()
        AND (e.hidden_at IS NULL OR public.is_moderator())
        AND (e.circle_id IS NULL OR EXISTS (
          SELECT 1 FROM public.circle_members cm
          WHERE cm.circle_id = e.circle_id AND cm.user_id = auth.uid()
        ))
    )
  );
DROP POLICY IF EXISTS "Users can file testimony reports" ON public.testimony_reports;
CREATE POLICY "Users can file testimony reports"
  ON public.testimony_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reporter_id
    AND NOT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    AND EXISTS (
      SELECT 1 FROM public.community_testimonies t
      WHERE t.id = testimony_reports.testimony_id
        AND t.user_id <> auth.uid()
        AND (t.hidden_at IS NULL OR public.is_moderator())
    )
  );

-- Testimony mute self-exclusion, mirroring echo_mutes (M-W9): reporting
-- your own testimony must not mute yourself off your own wall.
DROP POLICY IF EXISTS "Users can manage own testimony mutes" ON public.testimony_mutes;
CREATE POLICY "Users can manage own testimony mutes"
  ON public.testimony_mutes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND muted_user_id <> auth.uid());

-- Testimony own-row UPDATE policy dropped (MOD-4): delete-own already
-- exists, no client path updates testimonies, and the policy was the
-- author-un-hide hole. The hidden-field guard trigger (section 3) is
-- the second lock if any UPDATE policy is ever re-added.
DROP POLICY IF EXISTS "Users can update own testimony" ON public.community_testimonies;

-- 7. Report RPCs, redefined (MOD-3 + visibility + self-report + cap).
-- These replace the 20260823 / 20260825 definitions; CREATE OR REPLACE
-- in a new migration is the correct way to supersede a live function.
CREATE OR REPLACE FUNCTION public.report_community_echo(p_echo_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_author uuid;
  v_circle_id uuid;
  v_hidden_at timestamptz;
  v_report_count bigint;
  v_day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Anonymous accounts cannot report' USING ERRCODE = '42501';
  END IF;
  SELECT user_id, circle_id, hidden_at INTO v_author, v_circle_id, v_hidden_at
  FROM public.community_echoes WHERE id = p_echo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF v_author = auth.uid() THEN
    RAISE EXCEPTION 'Cannot report your own post' USING ERRCODE = '42501';
  END IF;
  -- Visibility: a reporter must be able to read the post. Hidden posts
  -- are reportable only by their author (rejected above) or a moderator;
  -- circle posts only by members. "Not found" hides hidden existence.
  IF v_hidden_at IS NOT NULL AND NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF v_circle_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = v_circle_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF p_reason IS NOT NULL AND char_length(p_reason) > 500 THEN
    RAISE EXCEPTION 'Report reason too long';
  END IF;
  SELECT COUNT(*) INTO v_report_count FROM (
    SELECT created_at FROM public.echo_reports
    WHERE reporter_id = auth.uid() AND created_at >= v_day_start
    UNION ALL
    SELECT created_at FROM public.testimony_reports
    WHERE reporter_id = auth.uid() AND created_at >= v_day_start
  ) s;
  IF v_report_count >= 10 THEN
    RAISE EXCEPTION 'MODERATION_REPORT_LIMIT: daily report limit reached';
  END IF;
  INSERT INTO public.echo_reports (echo_id, reporter_id, reason)
  VALUES (p_echo_id, auth.uid(), NULLIF(p_reason, ''))
  ON CONFLICT (echo_id, reporter_id) DO NOTHING;
  IF v_author IS NOT NULL AND v_author <> auth.uid() THEN
    INSERT INTO public.echo_mutes (user_id, muted_user_id)
    VALUES (auth.uid(), v_author)
    ON CONFLICT (user_id, muted_user_id) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_testimony(p_testimony_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  caller_id uuid := auth.uid();
  author_id uuid;
  v_hidden_at timestamptz;
  v_report_count bigint;
  v_day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Anonymous accounts cannot report' USING ERRCODE = '42501';
  END IF;
  SELECT user_id, hidden_at INTO author_id, v_hidden_at
  FROM public.community_testimonies WHERE id = p_testimony_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testimony not found' USING ERRCODE = 'P0002';
  END IF;
  IF author_id = caller_id THEN
    RAISE EXCEPTION 'Cannot report your own post' USING ERRCODE = '42501';
  END IF;
  IF v_hidden_at IS NOT NULL AND NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Testimony not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_reason IS NOT NULL AND char_length(p_reason) > 500 THEN
    RAISE EXCEPTION 'Report reason too long';
  END IF;
  SELECT COUNT(*) INTO v_report_count FROM (
    SELECT created_at FROM public.echo_reports
    WHERE reporter_id = caller_id AND created_at >= v_day_start
    UNION ALL
    SELECT created_at FROM public.testimony_reports
    WHERE reporter_id = caller_id AND created_at >= v_day_start
  ) s;
  IF v_report_count >= 10 THEN
    RAISE EXCEPTION 'MODERATION_REPORT_LIMIT: daily report limit reached';
  END IF;
  INSERT INTO public.testimony_reports (testimony_id, reporter_id, reason)
  VALUES (p_testimony_id, caller_id, p_reason)
  ON CONFLICT (testimony_id, reporter_id) DO NOTHING;
  -- Mute only for non-authors (M-W9): the old code muted unconditionally,
  -- so a self-report hid the author's own testimonies from themself.
  IF author_id IS NOT NULL AND author_id <> caller_id THEN
    INSERT INTO public.testimony_mutes (user_id, muted_user_id)
    VALUES (caller_id, author_id)
    ON CONFLICT (user_id, muted_user_id) DO NOTHING;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.report_community_echo(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.report_community_echo(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.report_testimony(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_testimony(uuid, text) TO authenticated;

-- 8. RLS: hidden posts are invisible via PostgREST to everyone except
-- their own author and moderators (MOD-2). The drop list below names
-- BOTH the pre-circles names AND the live "…public…" names, because
-- DROP IF EXISTS silently no-ops on a renamed name — the exact trap
-- that broke 00008 and the original 00010 (verify in pg_policies).
-- Circle privacy is restored in the same policies (the original 00010
-- policies were circle-blind), and mute is now enforced server-side
-- for wall reads: a muted author's rows are simply not returned to the
-- muter (bell rows carry no pray-er identity by design, so bell mute
-- filtering is impossible there — documented gap, not a leak).
DROP POLICY IF EXISTS "Anyone can view community echoes" ON public.community_echoes;
DROP POLICY IF EXISTS "Signed-out users can view community echoes" ON public.community_echoes;
DROP POLICY IF EXISTS "Anyone can view public community echoes" ON public.community_echoes;
DROP POLICY IF EXISTS "Signed-out users can view public community echoes" ON public.community_echoes;
CREATE POLICY "Anyone can view public community echoes"
  ON public.community_echoes FOR SELECT TO authenticated
  USING (
    (hidden_at IS NULL OR auth.uid() = user_id OR public.is_moderator())
    AND (circle_id IS NULL OR EXISTS (
      SELECT 1 FROM public.circle_members cm
      WHERE cm.circle_id = community_echoes.circle_id AND cm.user_id = auth.uid()
    ))
    AND NOT EXISTS (
      SELECT 1 FROM public.echo_mutes m
      WHERE m.user_id = auth.uid() AND m.muted_user_id = community_echoes.user_id
    )
  );
CREATE POLICY "Signed-out users can view public community echoes"
  ON public.community_echoes FOR SELECT TO anon
  USING (
    hidden_at IS NULL
    AND circle_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.echo_mutes m
      WHERE m.user_id = auth.uid() AND m.muted_user_id = community_echoes.user_id
    )
  );
DROP POLICY IF EXISTS "Anyone can view testimonies" ON public.community_testimonies;
CREATE POLICY "Anyone can view testimonies"
  ON public.community_testimonies FOR SELECT
  USING (
    (hidden_at IS NULL OR auth.uid() = user_id OR public.is_moderator())
    AND NOT EXISTS (
      SELECT 1 FROM public.testimony_mutes m
      WHERE m.user_id = auth.uid() AND m.muted_user_id = community_testimonies.user_id
    )
  );

-- 9. Amen RPC: reject amens on hidden posts (MOD-8). This redefines the
-- 00005 RPC, preserving its auth / self-amen / circle checks verbatim.
CREATE OR REPLACE FUNCTION public.amen_community_echo(p_echo_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  caller_id uuid := auth.uid();
  v_circle_id uuid;
  v_author_id uuid;
  v_hidden_at timestamptz;
  v_new_count integer;
  v_notify boolean;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT user_id, circle_id, hidden_at INTO v_author_id, v_circle_id, v_hidden_at
  FROM public.community_echoes WHERE id = p_echo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prayer request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_hidden_at IS NOT NULL THEN
    RAISE EXCEPTION 'Post under review' USING ERRCODE = '42501';
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
  INSERT INTO public.community_amens (echo_id, user_id)
  VALUES (p_echo_id, caller_id);
  UPDATE public.community_echoes
  SET amens = public.community_echoes.amens + 1
  WHERE public.community_echoes.id = p_echo_id
  RETURNING public.community_echoes.amens
  INTO v_new_count;
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
      VALUES (v_author_id, p_echo_id, v_new_count)
      ON CONFLICT (recipient_id, echo_id, milestone) DO NOTHING;
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.amen_community_echo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.amen_community_echo(uuid) TO authenticated;

-- Direct amen inserts bypassed every amen rule (self, circle, hidden,
-- anon) and diverged rows from the RPC-only counter. The client amens
-- exclusively via the RPC (verified by grep: no client INSERT into
-- community_amens), so the direct policy is dropped, not narrowed.
DROP POLICY IF EXISTS "Users can create amens" ON public.community_amens;

-- 10. Bell rows: a recipient may change seen_at only (M-W8). Any other
-- column change on their own rows raises; cross-user rows are already
-- blocked by the own-only UPDATE policy.
CREATE OR REPLACE FUNCTION public.guard_prayer_notification_update()
RETURNS trigger LANGUAGE plpgsql AS $$
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
DROP TRIGGER IF EXISTS prayer_notification_seen_guard ON public.prayer_notifications;
CREATE TRIGGER prayer_notification_seen_guard
  BEFORE UPDATE ON public.prayer_notifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_prayer_notification_update();

-- 11. Moderator review RPCs + audit log (MOD-10).
CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('echo', 'testimony')),
  post_id uuid NOT NULL,
  -- Round-5 lane-5 H2: 'queue_read' rows are the moderator queue READ
  -- audit (one row per returned post, written by
  -- get_hidden_wall_posts) — previously queue reads were unlogged, so
  -- a compromised moderator could bulk-exfiltrate the hidden queue
  -- undetectably. Read rows carry no content, only the post id.
  action text NOT NULL CHECK (action IN ('unhide', 'delete', 'queue_read')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.moderation_actions FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_moderation_actions_post ON public.moderation_actions(post_id, created_at DESC);

-- The original 00010 created a zero-argument get_hidden_wall_posts();
-- CREATE OR REPLACE cannot change a signature, so the old overload must
-- be dropped first or both overloads would survive. Round-5 lane-5 H1
-- adds a circle_id output column, which changes the return type, so the
-- (int, int) overload is dropped first for the same reason.
DROP FUNCTION IF EXISTS public.get_hidden_wall_posts();
DROP FUNCTION IF EXISTS public.get_hidden_wall_posts(int, int);
CREATE OR REPLACE FUNCTION public.get_hidden_wall_posts(p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE (
  kind text,
  id uuid,
  preview text,
  author_id uuid,
  first_name text,
  created_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text,
  report_count bigint,
  circle_id uuid
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row record;
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Not a moderator';
  END IF;
  p_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  p_offset := GREATEST(COALESCE(p_offset, 0), 0);
  -- Round-5 lane-5 H1: the queue is scoped to the moderator's mandate —
  -- PUBLIC posts only (echoes with circle_id IS NULL; testimonies have
  -- no circle column and are public by construction). The old queue
  -- returned full text + author UUIDs of hidden posts in PRIVATE
  -- circles to any moderator, while the PostgREST path correctly denied
  -- them — the two read paths disagreed, and the RPC was the leakier
  -- one. circle_id is still returned (always NULL under this filter)
  -- so a future circle-aware UI can distinguish scope without another
  -- shape change. NOTE the ORDER BY ordinal: the OUT parameter names
  -- shadow output column names in plpgsql, so ORDER BY hidden_at would
  -- bind to the (NULL) variable, not the column — hidden_at is the 7th
  -- output column.
  -- Round-5 lane-5 H2: queue READS are logged into moderation_actions
  -- (action 'queue_read', one row per returned post) in the same
  -- single FOR loop that returns the rows, so the union runs once, not
  -- twice. The function is VOLATILE now because it writes.
  FOR v_row IN
    SELECT 'echo'::text AS kind, e.id, e.text AS preview, e.user_id AS author_id, NULL::text AS first_name,
           e.created_at, e.hidden_at, e.hidden_reason,
           (SELECT COUNT(DISTINCT reporter_id) FROM public.echo_reports
            WHERE echo_id = e.id AND reviewed_at IS NULL) AS report_count,
           e.circle_id
    FROM public.community_echoes e WHERE e.hidden_at IS NOT NULL AND e.circle_id IS NULL
    UNION ALL
    SELECT 'testimony'::text, t.id,
           t.request || E'\n\nGod answered: ' || t.answer,
           t.user_id, t.first_name, t.created_at, t.hidden_at, t.hidden_reason,
           (SELECT COUNT(DISTINCT reporter_id) FROM public.testimony_reports
            WHERE testimony_id = t.id AND reviewed_at IS NULL),
           NULL::uuid
    FROM public.community_testimonies t WHERE t.hidden_at IS NOT NULL
    ORDER BY 7 DESC
    LIMIT p_limit OFFSET p_offset
  LOOP
    INSERT INTO public.moderation_actions (moderator_id, kind, post_id, action)
    VALUES (auth.uid(), v_row.kind, v_row.id, 'queue_read');
    kind := v_row.kind;
    id := v_row.id;
    preview := v_row.preview;
    author_id := v_row.author_id;
    first_name := v_row.first_name;
    created_at := v_row.created_at;
    hidden_at := v_row.hidden_at;
    hidden_reason := v_row.hidden_reason;
    report_count := v_row.report_count;
    circle_id := v_row.circle_id;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;
CREATE OR REPLACE FUNCTION public.moderate_wall_post(p_kind text, p_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_found boolean := false;
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Not a moderator';
  END IF;
  -- Scoped to HIDDEN rows only: the review-queue RPC is not a general
  -- delete primitive for never-hidden posts. Round-5 lane-5 H1: echo
  -- branches are additionally scoped to PUBLIC posts (circle_id IS
  -- NULL) — a hidden circle post is a circle-owner/member matter, and
  -- the queue no longer surfaces circle posts at all, so a direct-id
  -- attempt must fail closed here too. Testimonies have no circle
  -- column and are public by construction.
  IF p_action = 'unhide' THEN
    IF p_kind = 'echo' THEN
      UPDATE public.community_echoes SET hidden_at = NULL, hidden_reason = NULL
      WHERE id = p_id AND hidden_at IS NOT NULL AND circle_id IS NULL;
      v_found := FOUND;
      IF v_found THEN
        -- Archive, do not delete: archived reports no longer count
        -- toward auto-hide, so one new report cannot instantly re-hide
        -- a moderator-cleared post — a fresh threshold is required.
        UPDATE public.echo_reports SET reviewed_at = now()
        WHERE echo_id = p_id AND reviewed_at IS NULL;
      END IF;
    ELSIF p_kind = 'testimony' THEN
      UPDATE public.community_testimonies SET hidden_at = NULL, hidden_reason = NULL
      WHERE id = p_id AND hidden_at IS NOT NULL;
      v_found := FOUND;
      IF v_found THEN
        UPDATE public.testimony_reports SET reviewed_at = now()
        WHERE testimony_id = p_id AND reviewed_at IS NULL;
      END IF;
    ELSE
      RAISE EXCEPTION 'Unknown kind';
    END IF;
  ELSIF p_action = 'delete' THEN
    IF p_kind = 'echo' THEN
      DELETE FROM public.community_echoes WHERE id = p_id AND hidden_at IS NOT NULL AND circle_id IS NULL;
      v_found := FOUND;
    ELSIF p_kind = 'testimony' THEN
      DELETE FROM public.community_testimonies WHERE id = p_id AND hidden_at IS NOT NULL;
      v_found := FOUND;
    ELSE
      RAISE EXCEPTION 'Unknown kind';
    END IF;
    -- NOTE: report rows cascade with a deleted post (FK ON DELETE
    -- CASCADE in 20260823/20260825) — delete removes the post AND its
    -- reports. Only unhide archives reports on record. The moderation
    -- screen copy says exactly this; do not reintroduce the old
    -- "Reports stay on record either way" wording.
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;
  IF NOT v_found THEN
    RAISE EXCEPTION 'Post is not hidden or not found';
  END IF;
  INSERT INTO public.moderation_actions (moderator_id, kind, post_id, action)
  VALUES (auth.uid(), p_kind, p_id, p_action);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_hidden_wall_posts(int, int) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.moderate_wall_post(text, uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_hidden_wall_posts(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_wall_post(text, uuid, text) TO authenticated;
