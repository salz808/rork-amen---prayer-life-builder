-- =====================================================================
-- 20261025000020 — Wall safety forward fix — NOT YET APPLIED.
-- =====================================================================
-- STATUS: NOT YET APPLIED — staging test required before any deploy.
-- This file has NOT been applied to any database and has NOT been
-- executed against staging or live. KAI-APPROVED 2026-10-26 for
-- STAGING TEST ONLY, as a whole, including §S1 hold seeds,
-- §BLOCK-CARD-SIGNAL (narrowed oracle), §S6 force-unhide semantics,
-- and the 100/day error-report cap. It is NOT approved for live
-- deploy: do NOT run `supabase db push` against live (or any live
-- deploy) with this file until every staging test in this file
-- passes and Kai gives a separate live-deploy approval.
-- The former draft suffix was removed so the file carries its
-- final migration name; that rename plus Kai's 2026-10-26 approval
-- covers staging test only, and is NOT a verification — until
-- passing staging tests, treat this file as NOT YET APPLIED.
--
-- VERIFICATION LEGEND (every section below carries one of these):
--   * VERIFIED-SYNTAX-ONLY — the SQL below was checked by READING it
--     against the working-tree migration files named in the section
--     (no database was available, nothing was executed, parsed by a
--     database, or verified against staging/live). Parenthesis and
--     dollar-quote balance was checked by reading only.
--   * NEEDS-STAGING-TEST — the behaviour cannot be verified without a
--     live database. The section lists the exact staging test that
--     would resolve it. Do not describe such a section as verified.
-- Most sections are BOTH: syntax-read-only AND needs-staging-test.
-- Nothing in this file is claimed to have been executed, tested, or
-- verified against staging/live.
--
-- SOURCES READ (working tree, repo
-- /home/hatch/workspace/triad-build/source/rork-amen-v2/, HEAD 6a40e2b
-- plus uncommitted changes; existing migration files 00010, 00013,
-- and 00017 ARE edited in this tree, and those edits are
-- Kai-approved 2026-10-26, overriding the usual new-migration-only
-- rule for this case):
--   * Audit source of truth: goals/triad-prayer-app-app-store-launch-
--     readiness/hidden_files/audit-rounds-6-14/
--     final-consolidated-fixes-list.md, items S1-S8, H10, H11, H14,
--     H16, H24, H25 and related M items, plus M24 (§T1) and M25 (§T2).
--   * 00010 (working tree, NOT committed HEAD), 00012, 00013 (working
--     tree), 00014, 00016, 00017 (working tree), 00018, 00019.
-- No Kai-approved wording, doctrinal wording, or safety-policy
-- tradeoff is changed as fact in this file. Where a seed list, a
-- limit, or a moderation semantic is a Kai call, the section says
-- KAI-GATED and drafts the option without presenting it as approved.
-- No new ministry-voice copy is introduced in comments beyond
-- terminology already used in the existing migrations.
--
-- OUT-OF-SCOPE / KAI DECISIONS — NO SQL WRITTEN FOR THESE (do not
-- add SQL for them to this draft without a new Kai ruling):
--   * S10 (realtime / bell gating unverified): staging verification
--     step only. Realtime publication / RLS configuration is a live-
--     dashboard setting, not verifiable from the repo, and no SQL
--     here can prove held/circle payloads do not stream. Staging
--     must prove it before build 7; see §M9-style outcome tests.
--   * H9 (account-deletion retention): needs Kai's delete-vs-
--     anonymize ruling AND the delete-account edge-function sources,
--     which are not in the repo (supabase/functions/ does not exist
--     here). No tombstone / anonymization SQL is drafted here.
--   * H23 (amen age / anonymous ruling): Kai call — either add
--     anonymous + age checks to amen_community_echo, or record the
--     current posture (10/echo cap, bell suppression, self-amen
--     rejection) as accepted. No amen age check is drafted here.
--   * H26 (Customer Support label): an App Store Connect privacy
--     declaration, not SQL. bug_reports are linked, user-written,
--     dashboard-readable; the label decision belongs in ASC, not
--     in a migration. No SQL here declares it.
--
-- ITEMS REQUIRING KAI APPROVAL BEFORE DEPLOY (options, NOT approved):
--   * S1 exact new hold-seed list (§S1).
--   * BLOCK-CARD-SIGNAL (§BLOCK-CARD-SIGNAL, appended 2026-10-26):
--     surfacing the hold category on a Tier 1 block error so the
--     client can show a self-harm/threat prayer card for a blocked
--     post. This creates a NARROWED hold oracle (see that section);
--     it must NOT ship without Kai's explicit acceptance of it.
--   * S3 optional ph->f map for highest-risk seeds only (§S3,
--     commented out, inactive).
--   * S6 re-report semantics choice + force-unhide semantics (§S6).
--   * H24 delete-evidence archiving choice + second-moderator
--     question for self_harm/threat unhide (§H24, note only).
--   * H25 per-caller daily cap number (§H25, proposed number only).
--   * M12 retention period N for each growth table (§M12, undecided).
--   * S4 deploy branch: 00010-never-ran vs 00010-already-ran (§S4).
--   * §T1 threat-seed narrowing (M24) and §T2 guard widening (M25):
--     incorporated per task instruction, with trade-offs documented
--     in those sections. File-level approval + staging tests are
--     still required before any deploy; Kai may still reverse or
--     adjust either section.
--   * §BLOCK-CARD-SIGNAL block-wins card signal (KAI-GATED,
--     appended 2026-10-26 by a separate card task, preserved
--     intact here): a narrowed hold oracle — Kai must accept it
--     or the section is deleted, per its own instruction.
--
-- CORRECTION TO A STALE CLAIM (comment only — 00019 is NOT edited):
-- 00019's header (§2, and its §2 comment at line ~173) claims
-- "k i l l myself", "kill-myself", and "kill  myself" all hold.
-- That claim is FALSE under 00019's exact-LIKE matcher: the spaced
-- copy collapses separators, so "kill-myself" and "kill  myself"
-- hold, but "k i l l myself" does NOT (its spaced copy is
-- "k i l l myself", which contains no "kill myself" word sequence).
-- §S1 below rebuilds the matcher so the claim becomes true; until
-- §S1 is applied and staging-tested, do not repeat the 00019 claim.
--
-- APPLY ORDER NOTE: this file assumes 00010-00019 have applied in
-- order (including the working-tree 00010/00013/00017 fixes and
-- untracked 00018). It does not re-apply or edit any of them.
-- §T1 and §T2 run after §H14; §T2 supersedes §H14's 6-token guard
-- re-assertion with the widened 10-token guard (same constraint
-- name on the hold table).
-- =====================================================================

-- =====================================================================
-- §S1 — Hold-matcher rebuild (audit S1, R10-H1).
-- VERIFIED-SYNTAX-ONLY (read against 00019 + 00017) AND
-- NEEDS-STAGING-TEST (matching behaviour, see test list at the end
-- of this section). NOT executed against any database.
--
-- What changes, and why: 00019's moderation_hold_category() matches
-- phrase seeds with exact LIKE on a padded, letters-only spaced
-- copy. It has no leet map, no repeat-collapse, no fullwidth fold,
-- and no separator-tolerant pattern — all of which the Tier 1 block
-- check (00010, extended by 00017) already has. So self-harm/threat
-- text that the block check would catch in Tier 1 form publishes
-- when written in hold-seed form. This section rebuilds the hold
-- classifier on the block pipeline:
--   (a) normalize_wall_text() (00010, working-tree form);
--   (b) fold_fullwidth_ascii() (00017) — fullwidth ASCII to ASCII;
--   (c) word-joiner strip (U+2060, chr(8288)) — 00010 strips
--       U+200B/U+200C/U+200D/U+FEFF/U+00AD but NOT U+2060;
--   (d) extra homoglyph fold (§S3 helper, defined here so §S1 can
--       use it; the map itself is documented in §S3);
--   (e) leet map (00010: '013457@$' -> 'oieastas');
--   (f) adjacent-repeat collapse on both text and seed
--       (regexp_replace '(.)\1+' -> '\1', as in 00017);
--   (g) separator-tolerant seed patterns with word-boundary
--       anchors, built the way 00010 builds block patterns:
--       '(^|[^a-z])' + first letter + for each later letter
--       '[^a-z]*(' || letter || '|[^a-z])' + '([^a-z]|$)'. A
--       non-letter may therefore sit between any two seed letters
--       (spaces, punctuation, separators) and a single seed letter
--       may itself be replaced by one non-letter, while the leading
--       and trailing anchors keep "skill myself" from matching a
--       "kill myself" seed (the 'k' in "skill" is preceded by a
--       letter, not a boundary). The original padded-LIKE check is
--       kept as a third signal, so exact spaced phrases still hold
--       even if a pattern edge case is missed.
-- Priority order (00020 adds possession between threat and the
-- rest): self_harm > threat > possession > hate > contact >
-- link > money. Contact / link / money / address
-- detection runs on the folded text (digits preserved), as in
-- 00019, except the phone pattern now carries word boundaries
-- (\m / \M) — see the note in §S1 below about M23; the phone
-- pattern change here is boundary-only, not the full M23 rework,
-- which needs its own Kai-gated trade-off decision (see §S1 note).
-- No client pre-scan is added (a hold oracle would let anyone
-- probe which phrases hold, exactly why 00010 revoked the block
-- check grant). The classifier keeps its 00019 oracle revoke.
-- =====================================================================

-- Extra homoglyph fold (see §S3 for the full rationale and the
-- staging glyph check). Greek kappa / nu / tau and lunate sigma,
-- plus Cyrillic pe (looks like Latin n) and ze (looks like digit 3,
-- folded here directly to 'e', the leet value of '3'). This map is
-- deliberately SMALL: it covers only confusables that were NOT
-- already mapped by 00010 ('аеорсхуіјѕһктвнм' and 'αεορχι').
-- It is NOT claimed to be an exhaustive confusable set; staging
-- must confirm each glyph visually before relying on it.
CREATE OR REPLACE FUNCTION public.fold_extra_homoglyphs(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT translate(p_text, 'κντϲпз', 'kvtcne');
$$;
REVOKE EXECUTE ON FUNCTION public.fold_extra_homoglyphs(text) FROM anon, public, authenticated;

-- Hold-fold helper: one pipeline for hold matching only. Stored
-- text is never altered; only this view is matched.
CREATE OR REPLACE FUNCTION public.fold_hold_text(p_text text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  folded text;
BEGIN
  folded := public.fold_fullwidth_ascii(public.normalize_wall_text(p_text));
  folded := replace(folded, chr(8288), '');
  folded := public.fold_extra_homoglyphs(folded);
  RETURN folded;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fold_hold_text(text) FROM anon, public, authenticated;

-- New hold seeds — KAI-GATED LIST, NOT APPROVED.
-- Listed exactly as the audit's §S1 fix describes; Kai must approve
-- the exact list before this file ships. Deliberately NOT in this
-- list: bare "suicide" (settled ruling — bereavement prayers such
-- as "my brother died by suicide, please pray" must NOT hold).
-- Seeds already present in 00019 are not re-listed here except
-- where the new phrase is genuinely distinct (e.g. 'cutting
-- myself' vs 00019 'cut myself'; 'end myself' vs 'end my life';
-- 'take my life' vs 'take my own life'; 'thinking of suicide'
-- vs 'thinking about suicide').
INSERT INTO public.moderation_hold_patterns (pattern, category) VALUES
  ('killing myself', 'self_harm'),
  ('cutting myself', 'self_harm'),
  ('thinking of suicide', 'self_harm'),
  ('take my life', 'self_harm'),
  ('hang myself', 'self_harm'),
  ('overdose', 'self_harm'),
  ('shoot myself', 'self_harm'),
  ('end myself', 'self_harm')
ON CONFLICT (pattern) DO NOTHING;
-- NOTE: every seed above must pass the theology-guard CHECK
-- (00019's 6-token guard, widened to 10 tokens by §T2 below: no
-- demon / demons / hell / deliverance / spirit / spirits /
-- demonic / spiritual / devil / satan token) and its nonempty
-- CHECK at insert time. None of the eight contains a guarded
-- token, by reading. If any future seed trips the guard, the
-- insert fails loudly — that is the guard working, not a bug
-- to work around by editing 00019.

-- =====================================================================
-- §POSSESSION — Possession hold category (Kai-approved 2026-10-26:
-- a post about demon possession gets a targeted deliverance
-- prayer card, distinct from the self-harm and threat cards).
--
-- WHY A SEPARATE TABLE: the possession seeds necessarily contain
-- the token 'demon', so they CANNOT live in
-- moderation_hold_patterns — that table's theology-guard CHECK
-- (00019, widened by §T2 below) rejects any pattern containing
-- demon / demons / hell / deliverance / spirit / spirits /
-- demonic / spiritual / devil / satan, and the guard is
-- deliberately NOT weakened here. This table carries NO theology
-- guard, by design, and the guard's purpose is preserved a
-- different way: the classifier only matches these three FULL
-- explicit phrases, never the bare token. Ordinary deliverance
-- language ("demon", "deliverance", "spirit", "I need
-- deliverance") therefore still NEVER holds — only an explicit
-- possession claim does. Seeds are exactly Kai's approved list;
-- do not widen it (e.g. no bare "possessed", no "demonic")
-- without Kai's go.
-- Priority: possession sits between threat and the rest
-- (self_harm > threat > possession > hate > contact > link >
-- money), implemented by the UNION ALL in the classifier loop
-- below — one loop, unchanged body, so possession matching gets
-- the same separator-tolerant §S1 machinery as every other seed.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.moderation_possession_patterns (
  pattern text PRIMARY KEY
);
INSERT INTO public.moderation_possession_patterns (pattern) VALUES
  ('demon possession'),
  ('demon possessed'),
  ('possessed by a demon')
ON CONFLICT (pattern) DO NOTHING;

CREATE OR REPLACE FUNCTION public.moderation_hold_category(p_text text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r record;
  folded text;
  leet text;
  collapsed_leet text;
  spaced text;
  padded text;
  phrase_letters text;
  phrase_spaced text;
  phrase_collapsed text;
  pat text;
  pat_collapsed text;
  ch text;
  i int;
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN NULL;
  END IF;
  folded := public.fold_hold_text(p_text);
  leet := translate(folded, '013457@$', 'oieastas');
  collapsed_leet := regexp_replace(leet, '(.)\1+', '\1', 'g');
  spaced := regexp_replace(folded, '[^a-z]+', ' ', 'g');
  padded := ' ' || btrim(spaced) || ' ';
  -- Phrase seeds, priority-ordered by category. The possession
  -- table is UNIONed in (see §POSSESSION above): same loop body,
  -- same separator-tolerant matching, priority self_harm >
  -- threat > possession > everything else.
  FOR r IN
    SELECT p.pattern, p.category FROM public.moderation_hold_patterns p
    UNION ALL
    SELECT pp.pattern, 'possession' FROM public.moderation_possession_patterns pp
    ORDER BY CASE category WHEN 'self_harm' THEN 0 WHEN 'threat' THEN 1 WHEN 'possession' THEN 2 ELSE 3 END, pattern
  LOOP
    phrase_spaced := btrim(regexp_replace(public.fold_hold_text(r.pattern), '[^a-z]+', ' ', 'g'));
    phrase_letters := regexp_replace(phrase_spaced, ' ', '', 'g');
    phrase_collapsed := regexp_replace(phrase_letters, '(.)\1+', '\1', 'g');
    IF phrase_letters <> '' THEN
      -- Separator-tolerant pattern on the leet view (block style).
      pat := '(^|[^a-z])';
      FOR i IN 1 .. char_length(phrase_letters) LOOP
        ch := substr(phrase_letters, i, 1);
        IF i = 1 THEN
          pat := pat || ch;
        ELSE
          pat := pat || '[^a-z]*(' || ch || '|[^a-z])';
        END IF;
      END LOOP;
      pat := pat || '([^a-z]|$)';
      -- Same pattern on the repeat-collapsed seed / collapsed view.
      pat_collapsed := '(^|[^a-z])';
      FOR i IN 1 .. char_length(phrase_collapsed) LOOP
        ch := substr(phrase_collapsed, i, 1);
        IF i = 1 THEN
          pat_collapsed := pat_collapsed || ch;
        ELSE
          pat_collapsed := pat_collapsed || '[^a-z]*(' || ch || '|[^a-z])';
        END IF;
      END LOOP;
      pat_collapsed := pat_collapsed || '([^a-z]|$)';
      IF leet ~ pat OR collapsed_leet ~ pat_collapsed
        OR padded LIKE '% ' || phrase_spaced || ' %' THEN
        RETURN r.category;
      END IF;
    END IF;
  END LOOP;
  -- Contact: email, phone, street address. Phone pattern here is
  -- 00019's pattern with word boundaries added (\m / \M), so a
  -- 10-digit run embedded inside a longer digit run no longer
  -- matches on its own. This is a BOUNDARY-ONLY change. The fuller
  -- M23 rework (separator-aware single-digit spacing, at/dot
  -- obfuscation, wider TLDs, donat* stemming, amount variants) is
  -- NOT drafted here: it changes hold sensitivity in both
  -- directions and needs its own Kai-gated trade-off decision.
  IF folded ~ '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}' THEN
    RETURN 'contact';
  END IF;
  IF folded ~ '\m(\+?1[\s.\-]?)?(\(?[0-9]{3}\)?[\s.\-]?){2}[0-9]{4}\M' THEN
    RETURN 'contact';
  END IF;
  IF folded ~ '\m[0-9]{1,6}\s+[a-z]+(\s+[a-z]+)?\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|place|pl)\M' THEN
    RETURN 'contact';
  END IF;
  -- Link: URL scheme, www., or a bare domain in a common TLD
  -- (00019 list kept verbatim; the M23 TLD widening is not in this
  -- draft for the same reason as the phone rework above).
  IF folded ~ 'https?://' OR folded ~ 'www\.' OR folded ~ '\m[a-z0-9\-]+\.(com|org|net|io|app|church|co|me)\M' THEN
    RETURN 'link';
  END IF;
  -- Money: payment handles, donation asks, dollar amounts
  -- (00019 list kept verbatim; M23 donat* / dollars / £ / € variants
  -- are not in this draft — same Kai-gated reason as above).
  IF padded LIKE '% cash app %' OR padded LIKE '% cashapp %'
    OR padded LIKE '% venmo %' OR padded LIKE '% paypal %'
    OR padded LIKE '% gofundme %' OR padded LIKE '% go fund me %'
    OR padded LIKE '% zelle %' OR padded LIKE '% send money %'
    OR padded LIKE '% donate %' OR padded LIKE '% donation %'
    OR padded LIKE '% give me money %' OR padded LIKE '% wire money %'
    OR padded LIKE '% support me financially %' THEN
    RETURN 'money';
  END IF;
  IF folded ~ '\$[0-9]+' THEN
    RETURN 'money';
  END IF;
  RETURN NULL;
END;
$$;
-- Oracle revoke kept (00019): callers learn hold-vs-publish only
-- from the row the trigger returns to the author, never by probing.
REVOKE EXECUTE ON FUNCTION public.moderation_hold_category(text) FROM anon, public, authenticated;
-- STAGING TESTS for §S1 (all as the post author; verify the returned
-- row's hidden_at / hidden_reason, and that no other user can see
-- the held row — RLS is the real gate, the trigger is the classifier):
--   MUST HOLD (hidden_reason 'hold:self_harm'): "k i l l myself",
--   "k1ll myself", "k!ll myself", "killing myself", "cutting
--   myself", "kiiiill myself", fullwidth "ｋｉｌｌ myself", word-
--   joiner (U+2060 between "kill" and "myself"), "thinking of suicide", "take my
--   life", "hang myself", "overdose", "shoot myself", "end myself".
--   MUST NOT HOLD: "my brother died by suicide, please pray" (bare
--   suicide, settled ruling), "skill myself" (boundary anchor),
--   "kill sin" / deliverance phrasing (no person-directed intent).
--   MUST STILL HOLD as before: "kill myself", "kill-myself",
--   "thinking about suicide", "kill you" (threat).
--   POSSESSION (§POSSESSION, Kai-approved 2026-10-26):
--   MUST HOLD (hidden_reason 'hold:possession'): "I am demon
--   possessed, please pray", "demon possession is tormenting
--   me", "I feel possessed by a demon", hyphenated
--   "demon-possessed". MUST NOT HOLD: "I need deliverance",
--   "a demon attacked me in a dream" (bare token, no possession
--   claim), "deliverance from fear" — the guard's purpose
--   survives: only the three explicit phrases hold.

-- =====================================================================
-- §S2 — INSERT can no longer preset hidden fields (audit S2, R10-H3).
-- VERIFIED-SYNTAX-ONLY (read against 00019 hold triggers + 00010
-- column revokes) AND NEEDS-STAGING-TEST (see test list below).
--
-- Defect: 00010 revoked only UPDATE on hidden_at / hidden_reason,
-- the guard trigger is BEFORE UPDATE only, and the 00019 hold
-- triggers set fields only IF NEW.hidden_at IS NULL. So a direct
-- API INSERT could preset hidden_at/hidden_reason and the hold
-- trigger would skip classification entirely (self-harm text +
-- preset 'hold:money' triaged as money with no card; clean text +
-- preset 'hold:self_harm' fabricating a queue category; preset
-- reason with NULL hidden_at leaving a public row carrying a fake
-- hold reason).
-- Fix (two locks, both in this section):
--   (1) Both hold triggers now FORCE NEW.hidden_at := NULL and
--       NEW.hidden_reason := NULL on INSERT, before classifying.
--       UPDATE behaviour is unchanged: skip-if-unchanged still
--       applies, and an already-hidden row is still not re-held
--       by an unrelated update (see §S6 for the moderator-unhide
--       revalidation, which is deliberately NOT done in the
--       trigger, because unhide clears fields via a SECURITY
--       DEFINER RPC that must check first and then clear).
--   (2) Column-level REVOKE INSERT on hidden_at / hidden_reason
--       for authenticated and anon on both wall tables. The
--       SECURITY DEFINER triggers run as the table owner and are
--       unaffected by the revoke; the client never sets these
--       columns (it reads the server-set values back), so staging
--       must confirm ordinary client inserts still return
--       server-set hidden values (see test list).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enforce_echo_hold_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_category text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.text IS NOT DISTINCT FROM OLD.text THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.hidden_at := NULL;
    NEW.hidden_reason := NULL;
  END IF;
  IF NEW.hidden_at IS NULL THEN
    v_category := public.moderation_hold_category(NEW.text);
    IF v_category IS NOT NULL THEN
      NEW.hidden_at := now();
      NEW.hidden_reason := 'hold:' || v_category;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.enforce_testimony_hold_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_category text;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.request IS NOT DISTINCT FROM OLD.request
    AND NEW.answer IS NOT DISTINCT FROM OLD.answer
    AND NEW.first_name IS NOT DISTINCT FROM OLD.first_name THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.hidden_at := NULL;
    NEW.hidden_reason := NULL;
  END IF;
  IF NEW.hidden_at IS NULL THEN
    v_category := public.moderation_hold_category(
      COALESCE(NEW.request, '') || ' ' || COALESCE(NEW.answer, '') || ' ' || COALESCE(NEW.first_name, '')
    );
    IF v_category IS NOT NULL THEN
      NEW.hidden_at := now();
      NEW.hidden_reason := 'hold:' || v_category;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- Triggers stay attached (CREATE OR REPLACE preserves them); no
-- DROP / CREATE TRIGGER is needed here, mirroring 00018 §2.
REVOKE INSERT (hidden_at, hidden_reason) ON public.community_echoes FROM authenticated, anon;
REVOKE INSERT (hidden_at, hidden_reason) ON public.community_testimonies FROM authenticated, anon;
-- STAGING TESTS for §S2 (direct API as an authenticated user):
--   (a) INSERT echo with self-harm text + preset hidden_reason
--       'hold:money' -> row returns hidden_reason 'hold:self_harm'
--       (server classification wins), and the support-card path
--       fires for the author as for any self-harm hold.
--   (b) INSERT echo with clean text + preset hidden_at/hidden_reason
--       -> row publishes with hidden_at NULL, hidden_reason NULL.
--   (c) Ordinary client-style INSERT (no hidden columns) for a
--       clean post and for a hold post -> unchanged behaviour,
--       server-set values returned to the author.
--   (d) INSERT that explicitly names hidden_at/hidden_reason in the
--       column list -> must fail on the column revoke (defence in
--       depth; the trigger force in (a)/(b) is the primary lock
--       for inserts that omit the columns but carry values via
--       defaults — note (d) and (a) test different paths).

-- =====================================================================
-- §S3 — Tier 1 blocklist suffix / homoglyph evasion (audit S3, R10-H2).
-- VERIFIED-SYNTAX-ONLY (read against the 00017 redefinition of
-- check_wall_text_blocked, which this section mirrors) AND
-- NEEDS-STAGING-TEST (suffix collisions + glyph rendering, below).
-- NOT executed against any database. Before applying, diff this
-- redefinition against the working-tree 00017 body line by line:
-- the only intended deltas are (1) the extra-homoglyph fold in the
-- `folded` assignment, and (2) the suffix views. Any other delta
-- is a transcription error — stop and fix it, do not ship it.
--
-- What changes:
--   (1) Homoglyph fold extended: `folded` now passes through
--       fold_extra_homoglyphs() (§S1) after fold_fullwidth_ascii().
--       That adds Greek kappa / nu / tau, lunate sigma, Cyrillic
--       pe, and Cyrillic ze to 00010's accent / Cyrillic / Greek
--       chain. It does NOT claim to cover every confusable script
--       (mathematical alphanumeric / fraktur forms, noted as
--       deferred in 00017, remain uncovered — see the staging test).
--   (2) Bounded optional suffix after a block seed, on the spaced
--       view (and, for the collapsed view, on the collapsed spaced
--       view, respecting collapsed_exempt). Suffix set, kept
--       deliberately small: s | es | ed | in | ing | y. This closes
--       the audit's suffix examples that are pure suffixes
--       (fucks, fucked, fuckin, shits, dicks, sluts, whores,
--       cunts, assholes, niggers, faggots, retards, bitchy) without
--       opening the compound / substring problem: "shithead" and
--       "fuckyou" are NOT closed by this view (they are compounds,
--       not suffixes), and loosening the trailing boundary to catch
--       them would newly block ordinary words containing a seed
--       ("peacock" contains "cock" — the exact reason 00017
--       deferred a letter-stripped view). Compounds stay with the
--       report path + moderator review unless Kai rules otherwise.
--   (3) COLLISION CHECK (run on staging BEFORE shipping any widened
--       seed/suffix, and on any future term insert — same discipline
--       as 00017's collapsed-view check). The query is a comment,
--       not executed SQL, because it needs a staging vocabulary
--       judgement, not a deploy-time assertion:
--         -- SELECT term,
--         --        term || sfx AS suffixed
--         --   FROM public.moderation_blocklist,
--         --        unnest(ARRAY['s','es','ed','in','ing','y']) AS sfx
--         --  WHERE term || sfx IN
--         --        ('as','amen','god','sin','son','man','day','way',
--         --         'life','love','hope','pray','lord','king','hand',
--         --         'heart','light','peace','grace','faith','word',
--         --         'name','good','niger','fagot','bob');
--         -- Any row returned must be exempted or the suffix dropped
--         -- for that term before shipping; the word list is a floor,
--         -- not exhaustive — extend it with ordinary prayer
--         -- vocabulary as needed.
--   (4) KAI-GATED, INACTIVE: a ph->f substitution map for the
--       highest-risk seeds only (e.g. "phuck"). It is NOT active
--       SQL in this draft — the sketch below is a comment only.
--       Rationale for gating: ph->f is safe only per-seed (a global
--       ph->f fold would rewrite "phone"/"photo" text before
--       matching, and any future seed could then collide with
--       ordinary ph-words). If Kai approves it, activate it ONLY
--       for the named seeds, and re-run the collision check with
--       the ph-folded vocabulary first.
--         -- KAI-GATED SKETCH (do not uncomment without Kai's tap):
--         --   ph_leet := replace(leet, 'ph', 'f');
--         --   FOR t IN ('fuck','fucker','fucking') LOOP
--         --     IF ph_leet ~ <separator-tolerant pattern for t>
--         --       THEN RETURN true; END IF;
--         --   END LOOP;
-- Grants: CREATE OR REPLACE preserves 00010's oracle revoke on
-- check_wall_text_blocked (revoked from anon, public,
-- authenticated), exactly as 00017 notes. No GRANT/REVOKE appears
-- here on purpose.
-- =====================================================================
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
  pat5 text;
  ch text;
  i int;
  rec record;
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN false;
  END IF;
  -- 00017 pipeline (normalize + fullwidth fold) plus the §S1/§S3
  -- extra-homoglyph fold. Stored text is never altered.
  folded := public.fold_extra_homoglyphs(public.fold_fullwidth_ascii(public.normalize_wall_text(p_text)));
  leet := translate(folded, '013457@$', 'oieastas');
  spaced := regexp_replace(folded, '[^a-z]+', ' ', 'g');
  collapsed_leet := regexp_replace(leet, '(.)\1+', '\1', 'g');
  collapsed_spaced := regexp_replace(spaced, '(.)\1+', '\1', 'g');
  FOR rec IN
    SELECT b.term, COALESCE(b.collapsed_exempt, false) AS collapsed_exempt
    FROM public.moderation_blocklist b
    WHERE NOT EXISTS (
      SELECT 1 FROM public.moderation_allowlist a
      WHERE lower(a.term) = lower(b.term)
    )
  LOOP
    t := lower(rec.term);
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
    -- Bounded optional suffix on the original spaced view.
    pat5 := '\m' || regexp_replace(t, '([.*+?^${}()|[\]\\])', '\\\1', 'g') || '(s|es|ed|in|ing|y)\M';
    IF spaced ~ pat5 THEN
      RETURN true;
    END IF;
    -- Collapsed view (00017, unchanged except the suffix line
    -- below, which respects collapsed_exempt like the rest of
    -- this block). Skipped for 'nigger' / 'faggot' for the
    -- Niger / fagot reasons documented in 00017.
    IF t NOT IN ('nigger', 'faggot') AND NOT rec.collapsed_exempt THEN
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
      IF collapsed_spaced ~ '\m' || regexp_replace(collapsed_t, '([.*+?^${}()|[\]\\])', '\\\1', 'g') || '(s|es|ed|in|ing|y)\M' THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;
-- STAGING TESTS for §S3 (Tier 1 must raise MODERATION_BLOCKED and
-- abort the whole insert, including any ledger row — see §M9):
--   MUST BLOCK: fucks, fucked, fuckin, shits, bitchy, dicks,
--   sluts, whores, cunts, assholes, niggers, faggots, retards,
--   Greek-kappa "dicκ", Cyrillic-pe forms, "fuuucks" (collapse +
--   suffix together).
--   MUST NOT BLOCK (collision / ordinary vocabulary): "peacock"
--   (contains "cock"), "praying for Niger" (collapsed 'niger'
--   exemption), "shithead" / "fuckyou" are EXPECTED TO STILL PASS
--   this view (compounds, documented gap — report path only).
--   MUST STILL BLOCK as before: f*ck, f.u.c.k, f u c k, fuuuck,
--   fullwidth forms, zero-width-split forms.

-- =====================================================================
-- §S4 — 00010 deploy-blocker reconciliation (audit S4, R8-H1).
-- VERIFIED-SYNTAX-ONLY for the counts below (read against committed
-- HEAD vs working tree) AND NEEDS-STAGING-TEST / DEPLOY-RECORD
-- CHECK (the branch question cannot be answered from the repo).
-- DO NOT PICK A BRANCH AS FACT FROM THE REPO ALONE.
--
-- Measured facts (by reading the files, not by running them):
--   * Committed HEAD 00010, normalize_wall_text(): 23 '(' opens,
--     24 ')' closes, 10 translate() calls — it does NOT parse. A
--     failed CREATE FUNCTION aborts the migration, and every
--     downstream gate calling normalize_wall_text() cannot be
--     created from a clean HEAD checkout.
--   * Working-tree 00010 (uncommitted diff): 24 '(' opens,
--     24 ')' closes, 11 translate() calls. The diff is one added
--     "translate(" wrapper (plus a comment-only "//" -> "--" fix
--     in the moderation_actions comment, which is not functional).
--   * Staging MUST use the working-tree files, not a clean HEAD
--     checkout, until 00010 is either corrected in place or
--     forward-fixed (see branches below).
--
-- BRANCH A — 00010 never ran anywhere (no staging run, no live
-- run, no migration-history row for 20261025000010):
--   Correct 00010 IN PLACE, per its own header's pre-deploy
--   amendment rule. Under Branch A, DELETE the §S4 function
--   section below from this draft before applying it — shipping
--   both an in-place correction and a forward-fix duplicate would
--   muddy the migration record for no benefit. Do not edit 00010
--   in this draft file; the in-place correction belongs in 00010
--   itself, as a separate, Kai-approved step.
-- BRANCH B — any staging or live run of 00010 exists (including a
--   failed run that left a migration-history row, or a run from
--   the working-tree files):
--   Do NOT edit 00010. Ship the corrected function below as the
--   forward fix in this draft (this section, as written), then
--   re-run the post-deploy JWT / policy matrix. Editing 00010
--   after it has run would leave the deployed state inconsistent
--   with the migration record (the 00018 header makes the same
--   point for 00014/00017).
-- DEPLOY-RECORD CHECK (run against the deploy record / migration
-- history, NOT against the repo — this draft cannot answer it):
--   Look for a migration-history row for 20261025000010 on staging
--   AND on live, and check the deploy-run record for whether the
--   working-tree 00010 or the HEAD 00010 was the file that ran.
--   Record the answer in the deploy runbook before choosing A/B.
-- The function below is the working-tree body VERBATIM (copied by
-- reading the working-tree file). If Branch A is chosen, it is
-- deleted from this draft; if Branch B is chosen, it ships as-is.
-- =====================================================================
-- DEPLOY GATE: confirm Branch A vs Branch B (above) BEFORE applying
-- this section. If Branch A, remove this CREATE OR REPLACE block.
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
-- STAGING TESTS for §S4: after the chosen branch is applied, a
-- clean migration run from the deploy record must complete
-- (00010 parses), and a hold/block smoke test (one Tier 1 term,
-- one §S1 hold phrase) must pass, proving downstream gates that
-- call normalize_wall_text() were created.

-- =====================================================================
-- §S5 — reject_deleted_profile_insert gains SECURITY DEFINER
-- (audit S5, R8-H2).
-- VERIFIED-SYNTAX-ONLY (read against 00014:230-245 + 00018 §2)
-- AND NEEDS-STAGING-TEST (see test list below).
--
-- Defect: 00014's reject_deleted_profile_insert() is plain plpgsql
-- (SECURITY INVOKER) with SET search_path = '', but it reads
-- public.deleted_users, on which anon/authenticated have REVOKE
-- ALL by design. A direct PostgREST profile INSERT (the client's
-- upsertProfile path) therefore hits a revoked table and fails
-- with 403 instead of the intended guard; only SECURITY DEFINER
-- RPC paths survive. 00018 §2 fixed the wall twin
-- (reject_deleted_wall_insert) but left the profile twin.
-- Fix, mirroring 00018 §2 exactly: redefine with SECURITY DEFINER
-- SET search_path = '', body UNCHANGED from 00014. The trigger
-- stays attached (CREATE OR REPLACE preserves it).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reject_deleted_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.deleted_users WHERE user_id = NEW.id) THEN
    RAISE EXCEPTION 'account deleted: profile re-creation is blocked';
  END IF;
  RETURN NEW;
END;
$$;
-- STAGING TESTS for §S5 (JWT matrix, as in 00018's defect record):
--   (a) A new user's profile upsert succeeds (no 403).
--   (b) A profile insert for a tombstoned id is rejected with the
--       guard message ('account deleted: profile re-creation is
--       blocked'), not with a 403 permission error.

-- =====================================================================
-- §S6 — Moderator unhide revalidation, moderator hide, re-report
-- reactivation (audit S6, R10-H4 + M1).
-- VERIFIED-SYNTAX-ONLY (read against 00010 moderate_wall_post +
-- report RPCs) AND NEEDS-STAGING-TEST (see test list below).
-- KAI-GATED SEMANTICS (drafted, NOT approved): the force-unhide
-- choice and the re-report choice below are the audit's drafted
-- options. Kai must approve the semantics before this ships.
--
-- Defects: (1) Unhide SETs hidden_at/hidden_reason NULL directly,
-- and the hold/block triggers early-return on UPDATE when the text
-- is unchanged, so a held "kill myself" / blocked-term post that a
-- moderator unhides in error becomes permanently public.
-- (2) moderate_wall_post acts on hidden rows only, so no RPC can
-- re-hide or delete a post once it is visible again. (3) Unhide
-- archives reports (reviewed_at = now()), and UNIQUE
-- (echo_id, reporter_id) / (testimony_id, reporter_id) then makes
-- the report RPCs silently DO NOTHING on re-report, while the
-- client still shows "Thank you".
-- Fix in this section:
--   (a) The unhide branch RE-RUNS check_wall_text_blocked() and
--       moderation_hold_category() on the CURRENT text before
--       clearing anything. A Tier 1 hit REFUSES the unhide
--       (raise, no change, no audit row for the refused unhide —
--       the refusal itself is the moderator's signal to delete
--       instead). A Tier 2 self_harm / threat hit KEEPS the post
--       held unless the caller passes p_force = true explicitly;
--       a forced unhide is deliberate AND logged in
--       moderation_actions as 'force_unhide' (not silently as a
--       plain 'unhide'). Contact / link / money / hate holds
--       unhide as today (no force needed), matching the audit's
--       "allow contact/link/money/hate unhide as today".
--       Report-hidden posts ('reports' reason) are revalidated the
--       same way: a report-hidden post whose current text is a
--       Tier 1 / self_harm / threat hit is not silently cleared
--       by an unhide either.
--   (b) A new moderator 'hide' action for VISIBLE posts: SETs
--       hidden_at = now(), hidden_reason = 'moderator_hide', and
--       logs 'hide' in moderation_actions. Scope mirrors the
--       existing RPC: public echoes only (circle_id IS NULL),
--       any testimony. Client note (staging/client check owed,
--       NOT claimed here): the client hold parser only understands
--       'hold:<category>' (lib/moderation.ts), so an author of a
--       moderator-hidden post sees a generic hidden state, not a
--       hold category — the client copy for 'moderator_hide' must
--       be confirmed before relying on it. Hide does NOT archive
--       reports (unlike unhide): a moderator hide is not a review
--       clearance, so unreviewed reports stay unreviewed.
--   (c) Re-report REACTIVATION (the ONE drafted option): both
--       report RPCs change ON CONFLICT DO NOTHING to
--       ON CONFLICT (…, reporter_id) DO UPDATE SET
--       reviewed_at = NULL, reason = EXCLUDED.reason,
--       created_at = now(). Effect: after a moderator unhide
--       archives a report, the same reporter reporting again
--       reactivates that row (it counts again toward a future
--       3-reporter auto-hide evaluation, because auto-hide counts
--       reviewed_at IS NULL rows; the reactivation itself is an
--       UPDATE, not an INSERT, so it does not itself fire the
--       AFTER INSERT auto-hide trigger — a fresh threshold still
--       needs fresh reports, as 00010 intended). The alternative
--       NOT drafted here — deleting archived reports on unhide —
--       is recorded as the Kai-gated alternative; do not implement
--       both. Client note (not SQL): with reactivation, the RPC
--       no longer silently no-ops on duplicate reports, so the
--       client's "Thank you" is truthful for re-reports; the
--       client toast path still needs a staging check (it is not
--       changed by this migration).
--   (d) moderation_actions CHECK expansion: the 00010 CHECK allows
--       only ('unhide', 'delete', 'queue_read'). This section
--       drops and re-adds it with ('hide', 'force_unhide') added.
--       NEEDS-STAGING-TEST pre-check: confirm the constraint name
--       first (Postgres auto-names an inline column CHECK as
--       moderation_actions_action_check; verify with
--       SELECT conname FROM pg_constraint WHERE
--       conrelid = 'public.moderation_actions'::regclass AND
--       contype = 'c'). If the name differs, substitute it here:
--       a DROP CONSTRAINT IF EXISTS with the wrong name is a
--       silent no-op, and the OLD check would then still reject
--       'hide' / 'force_unhide' at insert time — the §S6 staging
--       hide test below is what catches that.
-- Signature change: moderate_wall_post gains p_force boolean
-- DEFAULT false. CREATE OR REPLACE cannot change a signature, so
-- the old overload is DROPPED first and grants are re-applied
-- below (mirroring 00010's get_hidden_wall_posts drop pattern).
-- The client call site (lib/database.ts moderateWallPost) passes
-- only (kind, id, action) today; the DEFAULT false keeps it
-- working unchanged, and a force call must pass p_force explicitly
-- (a future client change, not in this migration).
-- =====================================================================
ALTER TABLE public.moderation_actions DROP CONSTRAINT IF EXISTS moderation_actions_action_check;
ALTER TABLE public.moderation_actions
  ADD CONSTRAINT moderation_actions_action_check
  CHECK (action IN ('unhide', 'delete', 'queue_read', 'hide', 'force_unhide'));

DROP FUNCTION IF EXISTS public.moderate_wall_post(text, uuid, text);
CREATE OR REPLACE FUNCTION public.moderate_wall_post(p_kind text, p_id uuid, p_action text, p_force boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_found boolean := false;
  v_text text;
  v_hold text;
  v_log_action text;
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Not a moderator';
  END IF;
  IF p_action = 'unhide' THEN
    -- Revalidate the CURRENT text before clearing anything.
    IF p_kind = 'echo' THEN
      SELECT e.text INTO v_text FROM public.community_echoes e WHERE e.id = p_id;
    ELSIF p_kind = 'testimony' THEN
      SELECT COALESCE(t.request, '') || ' ' || COALESCE(t.answer, '') || ' ' || COALESCE(t.first_name, '')
        INTO v_text FROM public.community_testimonies t WHERE t.id = p_id;
    ELSE
      RAISE EXCEPTION 'Unknown kind';
    END IF;
    IF v_text IS NULL THEN
      RAISE EXCEPTION 'Post is not hidden or not found';
    END IF;
    IF public.check_wall_text_blocked(v_text) THEN
      RAISE EXCEPTION 'Cannot unhide: text is blocked by Tier 1 filter';
    END IF;
    v_hold := public.moderation_hold_category(v_text);
    IF v_hold IN ('self_harm', 'threat') AND NOT COALESCE(p_force, false) THEN
      RAISE EXCEPTION 'Cannot unhide: self-harm/threat hold requires explicit force';
    END IF;
    v_log_action := CASE WHEN v_hold IN ('self_harm', 'threat') AND COALESCE(p_force, false) THEN 'force_unhide' ELSE 'unhide' END;
    IF p_kind = 'echo' THEN
      UPDATE public.community_echoes SET hidden_at = NULL, hidden_reason = NULL
      WHERE id = p_id AND hidden_at IS NOT NULL AND circle_id IS NULL;
      v_found := FOUND;
      IF v_found THEN
        UPDATE public.echo_reports SET reviewed_at = now()
        WHERE echo_id = p_id AND reviewed_at IS NULL;
      END IF;
    ELSE
      UPDATE public.community_testimonies SET hidden_at = NULL, hidden_reason = NULL
      WHERE id = p_id AND hidden_at IS NOT NULL;
      v_found := FOUND;
      IF v_found THEN
        UPDATE public.testimony_reports SET reviewed_at = now()
        WHERE testimony_id = p_id AND reviewed_at IS NULL;
      END IF;
    END IF;
  ELSIF p_action = 'hide' THEN
    -- New: hide a VISIBLE post. Scope mirrors the existing RPC
    -- (public echoes only; testimonies are public by construction).
    IF p_kind = 'echo' THEN
      UPDATE public.community_echoes SET hidden_at = now(), hidden_reason = 'moderator_hide'
      WHERE id = p_id AND hidden_at IS NULL AND circle_id IS NULL;
      v_found := FOUND;
    ELSIF p_kind = 'testimony' THEN
      UPDATE public.community_testimonies SET hidden_at = now(), hidden_reason = 'moderator_hide'
      WHERE id = p_id AND hidden_at IS NULL;
      v_found := FOUND;
    ELSE
      RAISE EXCEPTION 'Unknown kind';
    END IF;
    v_log_action := 'hide';
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
    v_log_action := 'delete';
    -- NOTE (00010, unchanged): report rows cascade with a deleted
    -- post (FK ON DELETE CASCADE), so delete removes the post AND
    -- its reports. See §H24 for the Kai/process archiving decision;
    -- no archiving is implemented in this draft.
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;
  IF NOT v_found THEN
    RAISE EXCEPTION 'Post is not hidden or not found';
  END IF;
  INSERT INTO public.moderation_actions (moderator_id, kind, post_id, action)
  VALUES (auth.uid(), p_kind, p_id, v_log_action);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.moderate_wall_post(text, uuid, text, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.moderate_wall_post(text, uuid, text, boolean) TO authenticated;
-- Re-report reactivation: 00010 report RPC bodies, with ONLY the
-- ON CONFLICT clause changed (DO NOTHING -> DO UPDATE reactivating
-- the archived row). All other checks (auth, anonymous, self,
-- hidden-visibility, circle membership, reason length, 10/day cap,
-- mute-on-report) are copied unchanged.
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
  ON CONFLICT (echo_id, reporter_id) DO UPDATE SET
    reviewed_at = NULL,
    reason = EXCLUDED.reason,
    created_at = now();
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
  VALUES (p_testimony_id, caller_id, NULLIF(p_reason, ''))
  ON CONFLICT (testimony_id, reporter_id) DO UPDATE SET
    reviewed_at = NULL,
    reason = EXCLUDED.reason,
    created_at = now();
  IF author_id IS NOT NULL AND author_id <> caller_id THEN
    INSERT INTO public.testimony_mutes (user_id, muted_user_id)
    VALUES (caller_id, author_id)
    ON CONFLICT (user_id, muted_user_id) DO NOTHING;
  END IF;
END;
$$;
-- Grants on the report RPCs are preserved by CREATE OR REPLACE
-- (00010: granted to authenticated, revoked from anon/public);
-- no GRANT/REVOKE is repeated here on purpose, mirroring 00017.
-- STAGING TESTS for §S6 (moderator JWT + author + reporter JWTs):
--   (a) Held "kill myself" post: moderator unhide without force ->
--       refused, post stays held, no 'unhide' audit row.
--   (b) Same post with p_force = true -> unhidden, audit row
--       action = 'force_unhide'.
--   (c) Post whose current text contains a Tier 1 term: unhide
--       (even with force) -> refused (Tier 1 refusal is absolute
--       in this draft; force does not override a block).
--   (d) Contact/link/money/hate hold: unhide without force ->
--       succeeds as today, audit row action = 'unhide'.
--   (e) Visible public post: moderator 'hide' -> hidden with
--       reason 'moderator_hide', visible to author + moderators
--       only, and then unhideable again (revalidation applies).
--   (f) Re-report after unhide: reporter reports the same post
--       again -> report row's reviewed_at returns to NULL with
--       the new reason (not a silent no-op), and the queue's
--       report_count reflects it; two further fresh reporters
--       then re-hide it at the 3-reporter threshold.

-- =====================================================================
-- §S7 — Testimony SELECT policy split (audit S7, R8-H4).
-- VERIFIED-SYNTAX-ONLY (read against 00010:739-777 echo split)
-- AND NEEDS-STAGING-TEST (see test list below).
--
-- Defect: 00010's single "Anyone can view testimonies" policy has
-- NO TO clause, so it applies to anon, but its USING clause calls
-- is_moderator(), which is REVOKE EXECUTE FROM anon. A hidden row
-- therefore forces a revoked-function call for an anonymous caller
-- and returns a permission error instead of an empty result — an
-- existence oracle (content does not leak, but hidden existence
-- is distinguishable from not-found). Echoes were correctly split
-- into authenticated + anon policies in 00010; testimonies were
-- not. Fix, mirroring the echo split exactly:
--   * Authenticated policy: hidden OR author OR is_moderator(),
--     AND not muted (testimony_mutes).
--   * Anon policy: hidden_at IS NULL AND not muted. The mute
--     subquery is copied from the echo anon policy; for anon,
--     auth.uid() is NULL, so the mute predicate never matches and
--     the policy reduces to hidden_at IS NULL — which is the
--     intended anon behaviour, stated here so a reviewer does not
--     "fix" it by removing the mute clause.
-- =====================================================================
DROP POLICY IF EXISTS "Anyone can view testimonies" ON public.community_testimonies;
CREATE POLICY "Anyone can view testimonies"
  ON public.community_testimonies FOR SELECT TO authenticated
  USING (
    (hidden_at IS NULL OR auth.uid() = user_id OR public.is_moderator())
    AND NOT EXISTS (
      SELECT 1 FROM public.testimony_mutes m
      WHERE m.user_id = auth.uid() AND m.muted_user_id = community_testimonies.user_id
    )
  );
CREATE POLICY "Signed-out users can view testimonies"
  ON public.community_testimonies FOR SELECT TO anon
  USING (
    hidden_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.testimony_mutes m
      WHERE m.user_id = auth.uid() AND m.muted_user_id = community_testimonies.user_id
    )
  );
-- STAGING TESTS for §S7 (anon JWT + authenticated non-author JWT):
--   (a) Anon SELECT of a hidden testimony id -> empty result, NO
--       permission error (this is the fix: before, it errored).
--   (b) Anon SELECT of a visible testimony -> row returned.
--   (c) Authenticated non-author SELECT of a hidden testimony ->
--       empty result; author and moderator SELECTs -> row returned.

-- =====================================================================
-- §S8 — Amen RPC hidden-existence masking (audit S8, R10-M4).
-- VERIFIED-SYNTAX-ONLY (read against 00010:777-835 amen RPC)
-- AND NEEDS-STAGING-TEST (see test list below).
--
-- Defect: amen_community_echo() raises 'Prayer request not found'
-- for a missing post but 'Post under review' (42501) for a hidden
-- post, checked BEFORE self / circle checks — so a non-author /
-- non-member guessing a UUID learns the post exists AND is hidden.
-- The report RPCs deliberately mask this, and getCommunityEchoById
-- returns null for hidden rows to non-authors. Fix (00010 body
-- copied, ONLY the hidden branch changed): if hidden and caller
-- is NOT the author, raise 'Prayer request not found' (the same
-- message as not-found); keep 'Post under review' ONLY for the
-- author. Order is otherwise unchanged: not-found first, then
-- hidden-masking, then self-amen, then circle membership.
-- =====================================================================
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
-- Grants preserved by CREATE OR REPLACE (00010: authenticated only,
-- revoked from PUBLIC/anon); no GRANT/REVOKE repeated here.
-- STAGING TESTS for §S8 (authenticated non-author JWT):
--   (a) Amen a hidden echo as a non-author -> 'Prayer request not
--       found' (indistinguishable from a missing id).
--   (b) Amen a hidden echo as its author -> 'Post under review'.
--   (c) Amen a visible echo as a non-author -> succeeds as today.

-- =====================================================================
-- §H10 — Circle co-member full-profile read (audit H10, R8-M6).
-- VERIFIED-SYNTAX-ONLY (read against the profiles columns in the
-- base + 00002/00004/00010/00022 migrations and the 00007
-- rc_alias_id precedent) AND NEEDS-STAGING-TEST — see the
-- verification warning below. This is the REVOKE version drafted
-- per the task; the alternative (drop the co-member policy +
-- RPC-only roster) is NOT drafted here.
--
-- Defect: the "Circle members can view co-member profiles" policy
-- (shares_circle_with(id)) admits the full profile row to any
-- circle co-member. Only is_moderator and rc_alias_id were
-- column-revoked. A direct query therefore returns prayer_life,
-- reminder_time, blocker, soundscape / theme / voiceover /
-- adaptive flags, wall_prayer_notifications, age_attested_at —
-- far beyond roster need (get_circle_member_profiles returns only
-- id + first_name, but the policy still exposes the full row).
-- Fix (revoke version): REVOKE SELECT on the sensitive columns
-- for authenticated and anon (anon included to mirror the
-- rc_alias_id precedent, which revoked both roles), leaving
-- id, first_name, and display_name readable — the roster fields.
-- Columns already column-revoked (is_moderator, rc_alias_id) are
-- not re-listed; re-revoking them would be harmless but noisy.
-- VERIFICATION WARNING — READ BEFORE SHIPPING THIS SECTION:
-- Column grants are NOT row-aware. This revoke hits OWN-row reads
-- too, not just co-member reads: any client path that directly
-- SELECTs one of the revoked columns for the signed-in user's own
-- profile (settings / sync reads) will lose that column until it
-- is routed through a SECURITY DEFINER RPC (the rc_alias_id /
-- is_moderator pattern) or the grant is restored. Circles are
-- hidden for launch (FEATURES.circles = false), so this is
-- pre-launch hardening, not a live leak — but staging MUST verify
-- EVERY client profile call site (own-profile sync + settings +
-- get_circle_member_profiles roster) before this section ships,
-- or this section must not ship alone. If own-profile reads break,
-- the correct fix is an RPC for own-profile reads, not silently
-- dropping this revoke and re-opening co-member reads.
-- =====================================================================
REVOKE SELECT (prayer_life, reminder_time, blocker, soundscape, theme_preference, voiceover_enabled, adaptive_reminder_enabled, playback_rate, dark_mode, font_size, ambient_muted, onboarding_complete, wall_prayer_notifications, age_attested_at) ON public.profiles FROM authenticated, anon;
-- STAGING TESTS for §H10:
--   (a) Co-member direct SELECT of a co-member profile -> only
--       id / first_name / display_name return; a query naming a
--       revoked column fails (or omits it — record whichever
--       behaviour staging shows; do not assume the 00010 comment's
--       "omits" wording without seeing it).
--   (b) Own-profile reads used by sync + settings -> verified
--       working (via RPC if needed) before this section is called
--       shippable. If (b) fails, this section is NOT shippable
--       as written, even if (a) passes.

-- =====================================================================
-- §H11 — rc_alias_id owner-writable (audit H11, R8-M7).
-- VERIFIED-SYNTAX-ONLY (read against 00007 + 00013 column-revoke
-- patterns) AND NEEDS-STAGING-TEST (see test list below).
--
-- Defect: only REVOKE SELECT (rc_alias_id) exists (00007). The
-- base profiles UPDATE policy is own-row with no column carve-
-- outs, so a user can rotate/replace their OWN alias, orphaning
-- webhook alias->user resolution (apply_webhook_mirror, 00014)
-- and self-inflicting subscription loss. The client never writes
-- the column (it reads via get_my_rc_alias); stealing another
-- user's alias is already blocked (SELECT revoked + unique index).
-- Fix: REVOKE INSERT (rc_alias_id) + REVOKE UPDATE (rc_alias_id)
-- from authenticated and anon (same pattern as is_moderator /
-- age_attested_at in 00010/00013), plus a guard trigger for
-- defence in depth. Guard-trigger note (honest limit): an INSERT
-- guard cannot distinguish a caller-supplied alias from the
-- DEFAULT gen_random_uuid() value (both arrive as a non-null
-- uuid), so the INSERT lock is the column revoke alone, and the
-- trigger guards UPDATE rotation only — where OLD vs NEW is
-- observable. Service-role / SECURITY DEFINER writes are
-- unaffected (the trigger checks current_user).
-- =====================================================================
REVOKE INSERT (rc_alias_id) ON public.profiles FROM authenticated, anon;
REVOKE UPDATE (rc_alias_id) ON public.profiles FROM authenticated, anon;
CREATE OR REPLACE FUNCTION public.guard_rc_alias_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'UPDATE' AND NEW.rc_alias_id IS DISTINCT FROM OLD.rc_alias_id THEN
      RAISE EXCEPTION 'RC_ALIAS_GUARD: rc_alias_id is set by service role only';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_rc_alias_id ON public.profiles;
CREATE TRIGGER guard_rc_alias_id
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_rc_alias_id();
-- STAGING TESTS for §H11:
--   (a) Authenticated UPDATE of own rc_alias_id -> rejected.
--   (b) Authenticated INSERT naming rc_alias_id -> rejected.
--   (c) Ordinary profile upsert omitting rc_alias_id -> succeeds
--       with a server-generated alias (default fires).
--   (d) get_my_rc_alias() for the caller -> still returns the
--       caller's alias (read path unchanged).

-- =====================================================================
-- §H14 — Migration re-apply idempotency, forward-fix only
-- (audit H14, R13-H5). NO existing migration file is edited here.
-- VERIFIED-SYNTAX-ONLY (read against 00016, 00017, 00019) AND
-- NEEDS-STAGING-TEST (re-apply simulation, see below).
--
-- Defects: (1) 00016 CREATE POLICY "Users can submit own bug
-- reports" has no preceding DROP, so a re-apply fails.
-- (2) 00017 bug_reports_*_len ADD CONSTRAINTs have no IF NOT
-- EXISTS / drop-first, so a whole-file re-apply breaks (00018's
-- header already admits this). (3) 00019 CREATE TABLE IF NOT
-- EXISTS moderation_hold_patterns means a partial first apply
-- that created the table without its theology-guard / nonempty
-- CHECKs would silently skip those CHECKs on re-apply.
-- Fix (forward-fix only, in this draft):
--   (1) Drop-and-recreate the 00016 bug_reports policy, body
--       copied verbatim from 00016.
--   (2) DROP CONSTRAINT IF EXISTS + re-add the four 00017 length
--       constraints (validating, as 00017 did). STAGING PRE-CHECK
--       (from 00017's own header): run
--         SELECT max(char_length(app_version)),
--                max(char_length(build_number)),
--                max(char_length(platform)),
--                max(char_length(os_version)) FROM public.bug_reports;
--       All four must be <= 200 (NULLs aside) or the re-add fails
--       on legacy rows — trim or delete such rows before deploying
--       rather than converting to NOT VALID here (that would change
--       00017's validating intent without a ruling).
--   (3) DO blocks that ADD the 00019 CHECKs NOT VALID only if
--       missing (pg_constraint check — Postgres has no ADD
--       CONSTRAINT IF NOT EXISTS), then VALIDATE them. The CHECK
--       bodies are copied verbatim from 00019. VALIDATE fails
--       loudly if an existing pattern violates a guard — that is
--       the correct outcome (investigate the row; do not force it).
--       This section assumes 00019 has applied before 00020 in
--       migration order, so the table exists; if it does not, this
--       section fails loudly rather than silently skipping.
-- =====================================================================
DROP POLICY IF EXISTS "Users can submit own bug reports" ON public.bug_reports;
CREATE POLICY "Users can submit own bug reports"
  ON public.bug_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND NOT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false));

ALTER TABLE public.bug_reports DROP CONSTRAINT IF EXISTS bug_reports_app_version_len;
ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_app_version_len CHECK (char_length(app_version) <= 200);
ALTER TABLE public.bug_reports DROP CONSTRAINT IF EXISTS bug_reports_build_number_len;
ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_build_number_len CHECK (char_length(build_number) <= 200);
ALTER TABLE public.bug_reports DROP CONSTRAINT IF EXISTS bug_reports_platform_len;
ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_platform_len CHECK (char_length(platform) <= 200);
ALTER TABLE public.bug_reports DROP CONSTRAINT IF EXISTS bug_reports_os_version_len;
ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_os_version_len CHECK (char_length(os_version) <= 200);

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'moderation_hold_patterns_theology_guard'
  ) THEN
    ALTER TABLE public.moderation_hold_patterns
      ADD CONSTRAINT moderation_hold_patterns_theology_guard CHECK (
        NOT ((' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% demon %'
          OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% demons %'
          OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% hell %'
          OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% deliverance %'
          OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% spirit %'
          OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% spirits %')
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'moderation_hold_patterns_nonempty'
  ) THEN
    ALTER TABLE public.moderation_hold_patterns
      ADD CONSTRAINT moderation_hold_patterns_nonempty CHECK (
        btrim(regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g')) <> ''
      ) NOT VALID;
  END IF;
END
$do$;
ALTER TABLE public.moderation_hold_patterns VALIDATE CONSTRAINT moderation_hold_patterns_theology_guard;
ALTER TABLE public.moderation_hold_patterns VALIDATE CONSTRAINT moderation_hold_patterns_nonempty;
-- STAGING TESTS for §H14: apply this draft twice in a staging
-- clone (second apply must not fail on the policy, the four
-- length constraints, or the two hold-pattern CHECKs), and
-- confirm a partial-00019 simulation (table without CHECKs, then
-- this section) ends with both CHECKs present and validated.

-- =====================================================================
-- §H16 — Grace days persistence (audit H16, R13-H8).
-- NEEDS-STAGING-TEST AND PENDING CLIENT SYNC WORK. No client sync
-- is claimed to exist in this draft.
--
-- Defect: graceDaysUsed lives only in provider state (AppProvider)
-- and syncAppState has no grace upload step; loadAppState never
-- reads it (syncService notes "grace is local-only today"). Device
-- B therefore derives a different streak and can grant a second
-- grace day in the same month.
-- Draft (SQL only): a server table for grace days, one row per
-- user per grace day. The table form is chosen over a profiles
-- column because graceDaysUsed is a LIST (date strings), not a
-- scalar — but if the client team prefers a profiles text[] column,
-- replace this section with that column and drop this table; do
-- not ship both. RLS: own-row only for authenticated (SELECT /
-- INSERT / DELETE); service role bypasses RLS for triage as usual.
-- LOAD / MERGE NOTE (client work, NOT in this migration, NOT
-- claimed as done): syncService loadAppState must add a grace
-- read step and merge local + cloud grace days as a UNION (the
-- same union pattern syncService already uses for grace derivation
-- locally), and syncAppState must add a grace upload step, before
-- any device can be said to share grace state. Until that client
-- work ships, this table is INERT: creating it alone does not
-- make grace days persist across devices, and no streak display
-- should be described as cross-device until the client merge is
-- staging-tested on two devices.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_grace_days (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grace_day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, grace_day)
);
ALTER TABLE public.user_grace_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own grace days" ON public.user_grace_days;
CREATE POLICY "Users can view own grace days"
  ON public.user_grace_days FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can record own grace days" ON public.user_grace_days;
CREATE POLICY "Users can record own grace days"
  ON public.user_grace_days FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own grace days" ON public.user_grace_days;
CREATE POLICY "Users can delete own grace days"
  ON public.user_grace_days FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
-- STAGING TESTS for §H16 (after the client sync work lands — not
-- before): two devices, one user, one grace day used on device A
-- -> device B's streak reflects the same grace day and does NOT
-- grant a second grace day in the same month; offline-then-sync
-- merge unions (never overwrites) the two devices' grace lists.

-- =====================================================================
-- §H24 — Moderator queue report reasons (audit H24, R8-M4).
-- VERIFIED-SYNTAX-ONLY (read against 00010 get_hidden_wall_posts)
-- AND NEEDS-STAGING-TEST (moderator-only output + client render).
--
-- Defect (queue-blindness part only — see the decision note below
-- for the rest): the queue output carries report_count but no
-- reason text, so a moderator cannot triage why a post was
-- reported. Fix: get_hidden_wall_posts gains a moderator-only
-- output column, recent_reasons text[], holding up to the 3 most
-- recent UNREVIEWED report reasons per post (newest first, NULL
-- reasons excluded). The function is moderator-gated at the top
-- (is_moderator() check, unchanged), so reasons never leak to
-- non-moderators through this RPC; the RLS on the report tables
-- themselves is unchanged. Because the return type changes, the
-- old (int, int) overload is DROPPED first (00010's own pattern)
-- and grants are re-applied. The queue_read audit logging loop is
-- preserved, with the new column assigned in the loop.
-- CLIENT NOTE (not SQL, not claimed): the moderation screen must
-- render recent_reasons before this is useful to a moderator;
-- until then the column exists but is unread in the UI.
-- DELETE-EVIDENCE ARCHIVING NOTE — KAI / PROCESS DECISION, NOT
-- IMPLEMENTED HERE: moderator delete currently cascades report
-- rows with the post (FK ON DELETE CASCADE), leaving only the
-- moderation_actions row (kind / post_id / action, no content or
-- reason). The moderation screen copy already discloses this
-- ("post and its reports are gone for good"), so it is a known
-- trade-off, not a hidden bug — but it is a weak point for an
-- Apple 1.2 review trail. Options (Kai / process to choose, do
-- not implement silently): (a) archive report copies (and, if
-- required, a post-content snapshot) to a new archive table
-- BEFORE the delete branch runs; (b) soft-delete the post instead
-- of DELETE, so reports survive; (c) accept the current cascade
-- and record that acceptance. No archive table is created in this
-- draft, because its schema (what content, how long retained,
-- who may read it) is itself the decision.
-- SECOND-MODERATOR QUESTION — KAI / PROCESS DECISION, NOT
-- IMPLEMENTED HERE: whether a hold:self_harm / hold:threat unhide
-- needs a second moderator or Kai confirmation. §S6's force
-- parameter is a single-moderator deliberate + logged mechanism;
-- it is NOT second approval. If Kai wants second approval, it
-- needs a separate approval table / workflow, not a flag on this
-- RPC — do not describe §S6 force as second approval.
-- =====================================================================
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
  circle_id uuid,
  recent_reasons text[]
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
  FOR v_row IN
    SELECT 'echo'::text AS kind, e.id, e.text AS preview, e.user_id AS author_id, NULL::text AS first_name,
           e.created_at, e.hidden_at, e.hidden_reason,
           (SELECT COUNT(DISTINCT reporter_id) FROM public.echo_reports
            WHERE echo_id = e.id AND reviewed_at IS NULL) AS report_count,
           e.circle_id,
           (SELECT array_agg(s.reason ORDER BY s.created_at DESC)
            FROM (SELECT reason, created_at FROM public.echo_reports
                  WHERE echo_id = e.id AND reviewed_at IS NULL AND reason IS NOT NULL
                  ORDER BY created_at DESC LIMIT 3) s) AS recent_reasons
    FROM public.community_echoes e WHERE e.hidden_at IS NOT NULL AND e.circle_id IS NULL
    UNION ALL
    SELECT 'testimony'::text, t.id,
           t.request || E'\n\nGod answered: ' || t.answer,
           t.user_id, t.first_name, t.created_at, t.hidden_at, t.hidden_reason,
           (SELECT COUNT(DISTINCT reporter_id) FROM public.testimony_reports
            WHERE testimony_id = t.id AND reviewed_at IS NULL),
           NULL::uuid,
           (SELECT array_agg(s.reason ORDER BY s.created_at DESC)
            FROM (SELECT reason, created_at FROM public.testimony_reports
                  WHERE testimony_id = t.id AND reviewed_at IS NULL AND reason IS NOT NULL
                  ORDER BY created_at DESC LIMIT 3) s) AS recent_reasons
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
    recent_reasons := v_row.recent_reasons;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_hidden_wall_posts(int, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_hidden_wall_posts(int, int) TO authenticated;
-- STAGING TESTS for §H24 (moderator JWT + non-moderator JWT):
--   (a) Moderator queue call returns recent_reasons with at most 3
--       entries, newest first, unreviewed reasons only.
--   (b) Non-moderator queue call -> 'Not a moderator' (reasons do
--       not leak through a failed moderator check).
--   (c) A post with no reasons (pure hold, report_count 0) returns
--       recent_reasons NULL (array_agg over no rows), not an error.

-- =====================================================================
-- §H25 — error_reports per-caller daily cap + length CHECKs
-- (audit H25, R8-M5).
-- VERIFIED-SYNTAX-ONLY (read against the error_reports table +
-- 00012 context CHECK + lib/crashReporter.ts caps) AND
-- NEEDS-STAGING-TEST (see test list below).
--
-- Defect: GRANT INSERT TO anon, authenticated with only a
-- user-attribution policy; no daily cap, no message/stack CHECK.
-- Client caps (crashReporter: 10/session, message 1000 chars,
-- stack 6000 chars) are bypassable via direct API. Context already
-- has an 8 KB CHECK in 00012, but NOT VALID (never validated).
-- Fix:
--   (1) A caller_uid column (uuid, nullable) + a BEFORE INSERT
--       trigger that OVERWRITES it with auth.uid() on every insert
--       (so a client cannot forge another caller's attribution to
--       dodge the cap) and counts that caller's rows today (UTC
--       day, matching the other daily caps in this codebase).
--       CAP NUMBER — PROPOSED CHOICE, NOT APPROVED: 100/day per
--       caller. Rationale for drafting 100 (not 10): the client
--       session cap is 10, so 100/day is deliberately looser than
--       any legitimate single-device crash loop, while still
--       bounding a single caller. Kai / process must confirm the
--       number before shipping; do not present 100 as an approved
--       limit. Service-role inserts (auth.uid() NULL) skip the cap
--       so triage inserts are never blocked by it.
--       HONEST LIMIT (audit wording, kept): this bounds a single
--       caller/device/session, NOT aggregate anonymous abuse —
--       each fresh anonymous account is a distinct auth.uid(), so
--       a Sybil flood is still possible in aggregate. Monitor
--       table growth from the dashboard until a stronger control
--       (if any) is decided; do not describe this trigger as
--       stopping anonymous flooding.
--       The cap is count-then-insert without a lock, like the other
--       caps in this codebase (bug-report cap, report cap): a
--       concurrent burst can overshoot slightly. That softness is
--       stated, not hidden.
--   (2) CHECK lengths mirroring the client caps: message <= 1000,
--       stack <= 6000 (NULL stack allowed). Added NOT VALID, then
--       VALIDATED below, with a staging pre-check (max lengths)
--       — if legacy rows exceed them, trim or delete before
--       deploying rather than shipping NOT VALID silently.
--   (3) The existing 00012 context CHECK (pg_column_size < 8192,
--       NOT VALID) is VALIDATED here. Staging pre-check: max
--       pg_column_size(context) over non-null rows must be < 8192
--       or validation fails loudly (correct outcome — investigate
--       the rows, do not force it).
--   (4) Column revokes on caller_uid (INSERT / UPDATE) for anon /
--       authenticated, so the trigger's overwrite is the only path
--       (the trigger runs SECURITY DEFINER as the owner).
-- =====================================================================
ALTER TABLE public.error_reports ADD COLUMN IF NOT EXISTS caller_uid uuid;
CREATE OR REPLACE FUNCTION public.enforce_error_report_daily_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count bigint;
  v_day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
BEGIN
  NEW.caller_uid := auth.uid();
  IF auth.uid() IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count FROM public.error_reports
    WHERE caller_uid = auth.uid() AND created_at >= v_day_start;
    IF v_count >= 100 THEN
      RAISE EXCEPTION 'ERROR_REPORT_DAILY_LIMIT: daily error report limit reached';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_error_report_daily_cap ON public.error_reports;
CREATE TRIGGER enforce_error_report_daily_cap
  BEFORE INSERT ON public.error_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_error_report_daily_cap();
REVOKE INSERT (caller_uid) ON public.error_reports FROM authenticated, anon;
REVOKE UPDATE (caller_uid) ON public.error_reports FROM authenticated, anon;
ALTER TABLE public.error_reports DROP CONSTRAINT IF EXISTS error_reports_message_len;
ALTER TABLE public.error_reports
  ADD CONSTRAINT error_reports_message_len CHECK (char_length(message) <= 1000) NOT VALID;
ALTER TABLE public.error_reports DROP CONSTRAINT IF EXISTS error_reports_stack_len;
ALTER TABLE public.error_reports
  ADD CONSTRAINT error_reports_stack_len CHECK (stack IS NULL OR char_length(stack) <= 6000) NOT VALID;
ALTER TABLE public.error_reports VALIDATE CONSTRAINT error_reports_message_len;
ALTER TABLE public.error_reports VALIDATE CONSTRAINT error_reports_stack_len;
ALTER TABLE public.error_reports VALIDATE CONSTRAINT lane5_error_reports_context_size;
-- STAGING TESTS for §H25 (anon JWT + authenticated JWT):
--   (a) 101st error report from one caller in one UTC day ->
--       rejected with the daily-limit message; the first 100 land.
--   (b) Direct insert with message 1001 chars or stack 6001 chars
--       -> CHECK violation (client caps are now server-enforced).
--   (c) Direct insert naming caller_uid of another user -> the
--       stored caller_uid is the caller's own auth.uid(), not the
--       supplied value (trigger overwrite wins).
--   (d) Client-style insert (user_id NULL, message/stack within
--       caps, context within 8 KB) -> lands as today, preserving
--       the "Crash Data: Not Linked" shape (user_id stays NULL).

-- =====================================================================
-- §M3 — Checklist sync atomicity (audit M3, R13-M3).
-- FLAG ONLY — NO SQL WRITTEN. NEEDS DESIGN + CLIENT WORK.
-- The sync checklist replace (delete all rows, then insert, in
-- lib/database.ts) is non-atomic: a kill between delete and insert
-- wipes the cloud checklist until the next tick (mitigated only
-- by the allowDeletes / complete-snapshot gate). The audit fix is
-- a single RPC / transaction for the checklist replace. A full RPC
-- is DELIBERATELY NOT invented here: writing it safely requires
-- the exact checklist table + column list, the client's row shape,
-- and the call-site change, none of which this DB-only draft can
-- verify by reading alone. Follow-up (not in this file): draft the
-- RPC from the actual checklist schema + client call site, with a
-- staging kill-mid-sync test, before claiming the gap closed.
-- =====================================================================

-- =====================================================================
-- §M9 — Trigger-order staging assertion (audit M9, R13-M9).
-- COMMENT / TEST ONLY — NO SQL THAT RELIES ON TRIGGER NAMES.
-- 00019's header relies on Postgres firing same-timing triggers in
-- trigger-name order (wall_daily_limit -> wall_hold_policy_* ->
-- wall_text_policy_*) so block always wins over hold and held posts
-- still consume a ledger slot. Any future trigger rename silently
-- reorders enforcement. This draft does NOT add SQL asserting on
-- trigger names (that would bake the fragility in). Instead, run
-- these OUTCOME assertions on staging after every migration that
-- touches wall triggers (service-role queries for ledger rows;
-- author JWT for the post rows):
--   (1) Insert text that is BOTH Tier 1-blocked AND hold-intent
--       (e.g. a Tier 1 term + "kill myself") -> expect
--       MODERATION_BLOCKED, NO row, and NO new wall_daily_ledger
--       row for that user/day (block aborts the whole transaction,
--       including the ledger insert).
--   (2) Insert hold-only text (e.g. "kill myself" with no Tier 1
--       term) -> expect a held row (hidden_reason 'hold:self_harm')
--       AND a ledger row for that user/day (held posts consume
--       the slot, by design).
--   (3) Insert clean text -> expect a published row AND a ledger
--       row. If (1) ever yields a held row, or (2) ever yields no
--       ledger row, trigger ordering has broken — stop and fix the
--       ordering, do not ship on the assumption that names still
--       sort correctly.
-- =====================================================================

-- =====================================================================
-- §M12 — Retention policy note (audit M12, R13-M12).
-- NOTE ONLY — NO PURGE / DELETE SQL WRITTEN. N IS UNDECIDED.
-- Unbounded growth tables with no retention: wall_daily_ledger
-- (one row / user / UTC day, never pruned), webhook_events (one
-- row / processed event), sync_deletes (tombstones, never GC'd).
-- Sizing queries (run on staging/live dashboards — real row counts
-- are NOT measurable from the repo, and no size is claimed here):
--   SELECT count(*), min(created_at), max(created_at)
--     FROM public.wall_daily_ledger;
--   SELECT count(*), min(created_at), max(created_at)
--     FROM public.webhook_events;
--   SELECT count(*), min(created_at), max(created_at)
--     FROM public.sync_deletes;
-- Decision owed (Kai / process, N undecided): a retention /
-- archival period N per table, and for sync_deletes a client
-- version-gate so a device offline longer than N days RE-BASELINES
-- instead of resurrecting deletes it missed. Do NOT write a purge
-- (DELETE ... WHERE created_at < now() - interval 'N days') until
-- N is chosen AND the tombstone re-baseline client work is
-- specified — purging tombstones without the gate would resurrect
-- deleted content on long-offline devices. This note is the
-- deliverable for M12 in this draft; the purge itself is follow-up.
-- =====================================================================

-- =====================================================================
-- §BLOCK-CARD-SIGNAL — Block-wins support-card signal (KAI-GATED).
-- VERIFIED-SYNTAX-ONLY (read against 00010 + 00019 in this repo;
-- NOT executed against any database) AND NEEDS-STAGING-TEST (see
-- the test list at the end of this section). NOT APPLIED.
-- Appended 2026-10-26 for the TRIAD card task; 00019 is NOT
-- edited in place, and no other migration file is changed by
-- this section. Client counterpart (already wired, dormant until
-- this section ships): expo/lib/moderation.ts
-- supportCardVariantForBlock, which accepts ONLY the three exact
-- codes below and returns null for today's generic block error.
-- Possession joined the signal 2026-10-26 when its card was
-- approved, by the same mechanism as the other two card
-- categories; the narrowed-oracle trade-off below applies to
-- all three equally.
--
-- PROBLEM: Tier 1 block always wins over a Tier 2 hold. Trigger
-- name order on BEFORE INSERT is wall_daily_limit (00010) ->
-- wall_hold_policy_* (00019, sets hidden_at/hidden_reason) ->
-- wall_text_policy_* (00010, raises MODERATION_BLOCKED and
-- aborts the whole transaction). A post that is BOTH blocked
-- (profanity/slur/sexual term) AND hold-matched (self-harm or
-- threat intent) therefore returns NO row, so the client has
-- nothing for supportCardVariantForHold to read — and it must
-- NOT re-scan the user's text to fill the gap (a client scan
-- would be a hold oracle, exactly why 00010 revoked the
-- block-check grant and 00019 grants no hold-classifier RPC).
--
-- WHAT THIS SECTION DOES (forward-fix only, CREATE OR REPLACE
-- on the two 00010 trigger functions — the existing triggers
-- already point at these function names, so no trigger is
-- recreated, and the blocklist matching itself is NOT changed):
-- before raising, each function reads NEW.hidden_reason, which
-- the 00019 hold trigger has already set on THIS statement for
-- a fresh insert (hidden_at was NULL). If it is
-- 'hold:self_harm' the error becomes
--   'MODERATION_BLOCKED:SELF_HARM: wall text rejected by moderation filter'
-- if it is 'hold:threat' it becomes
--   'MODERATION_BLOCKED:THREAT: wall text rejected by moderation filter'
-- and if it is 'hold:possession' it becomes
--   'MODERATION_BLOCKED:POSSESSION: wall text rejected by moderation filter'.
-- Every other case — profanity-only blocks, hate/contact/link/
-- money overlaps, report-hidden rows ('reports'), and any
-- already-held row whose reason is not a card category —
-- raises today's generic MODERATION_BLOCKED unchanged, so the
-- client keeps its generic "Not shared" alert and shows NO card.
-- Tier 1 enforcement is unchanged: the same texts block, the
-- transaction still aborts, no row is inserted, and no ledger
-- slot is consumed (see §M9 outcome test (1)). Requesting the
-- card on the client publishes nothing.
-- For already-held rows re-edited with a new blocked term, the
-- hold trigger does not re-run (hidden_at is already set), so
-- NEW.hidden_reason there is the row's EXISTING hold category,
-- not a fresh classification of the edited text. The card paths
-- are all fresh inserts, so this edge does not affect them; it
-- is recorded here so a reviewer does not mistake the suffix
-- for a re-classification on updates.
--
-- ORACLE TRADE-OFF — READ BEFORE APPROVING (this is the Kai
-- call, not a detail): surfacing the category on a block error
-- creates a NARROWED hold oracle. An attacker can append a known
-- Tier 1 term to any candidate phrase, force a block, and read
-- the suffix to learn whether that phrase is a self_harm/threat
-- hold phrase, without ever publishing. That is the same class
-- of leak 00010/00019 deliberately closed, narrowed in three
-- ways: (1) only the two card categories are ever surfaced —
-- hate/contact/link/money overlaps stay generic, and no
-- blocklist term is ever revealed (the block was already known
-- to the attacker, since they supplied the Tier 1 term);
-- (2) it fires only on attempts that were already blocked;
-- (3) it reveals classification, never any other user's text.
-- If Kai does NOT accept even this narrowed oracle, DO NOT
-- APPLY this section: delete it, and the client hook stays
-- dormant (generic block error -> null -> generic alert) with
-- no leak and no card. There is no third option that shows a
-- block-wins card without either a server signal or a client
-- scan, and the client scan is the worse oracle (it would let
-- anyone probe phrases without even a blocked attempt).
-- =====================================================================

-- Echoes: 00010 body, plus the hidden_reason read before RAISE.
-- Skip-if-unchanged (M-W10) and the block check are untouched.
CREATE OR REPLACE FUNCTION public.enforce_echo_text_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.text IS NOT DISTINCT FROM OLD.text THEN
    RETURN NEW;
  END IF;
  IF public.check_wall_text_blocked(NEW.text) THEN
    IF NEW.hidden_reason = 'hold:self_harm' THEN
      RAISE EXCEPTION 'MODERATION_BLOCKED:SELF_HARM: wall text rejected by moderation filter';
    ELSIF NEW.hidden_reason = 'hold:threat' THEN
      RAISE EXCEPTION 'MODERATION_BLOCKED:THREAT: wall text rejected by moderation filter';
    ELSIF NEW.hidden_reason = 'hold:possession' THEN
      RAISE EXCEPTION 'MODERATION_BLOCKED:POSSESSION: wall text rejected by moderation filter';
    ELSE
      RAISE EXCEPTION 'MODERATION_BLOCKED: wall text rejected by moderation filter';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Testimonies: 00010 body, plus the hidden_reason read before
-- RAISE. The first_name length check is untouched and carries
-- no category (MODERATION_FIRST_NAME_TOO_LONG never shows a
-- card); the checked text is the same combined
-- request/answer/first_name string the 00019 testimony hold
-- trigger classifies, so the suffix and the hold category agree.
CREATE OR REPLACE FUNCTION public.enforce_testimony_text_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.request IS NOT DISTINCT FROM OLD.request
    AND NEW.answer IS NOT DISTINCT FROM OLD.answer
    AND NEW.first_name IS NOT DISTINCT FROM OLD.first_name THEN
    RETURN NEW;
  END IF;
  IF char_length(COALESCE(NEW.first_name, '')) > 60 THEN
    RAISE EXCEPTION 'MODERATION_FIRST_NAME_TOO_LONG: first_name exceeds 60 characters';
  END IF;
  IF public.check_wall_text_blocked(
    COALESCE(NEW.request, '') || ' ' || COALESCE(NEW.answer, '') || ' ' || COALESCE(NEW.first_name, '')
  ) THEN
    IF NEW.hidden_reason = 'hold:self_harm' THEN
      RAISE EXCEPTION 'MODERATION_BLOCKED:SELF_HARM: wall text rejected by moderation filter';
    ELSIF NEW.hidden_reason = 'hold:threat' THEN
      RAISE EXCEPTION 'MODERATION_BLOCKED:THREAT: wall text rejected by moderation filter';
    ELSIF NEW.hidden_reason = 'hold:possession' THEN
      RAISE EXCEPTION 'MODERATION_BLOCKED:POSSESSION: wall text rejected by moderation filter';
    ELSE
      RAISE EXCEPTION 'MODERATION_BLOCKED: wall text rejected by moderation filter';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- STAGING TESTS for §BLOCK-CARD-SIGNAL (all with an author JWT
-- through the normal insert path, exactly as the app calls it;
-- confirm the FULL error string reaches the client, since
-- PostgREST/Supabase may wrap trigger exceptions — a suffix
-- that never reaches the client leaves the card dormant):
--   (1) Tier 1 term + self-harm intent (e.g. a blocklist term +
--       "kill myself") -> MODERATION_BLOCKED:SELF_HARM, NO row,
--       NO ledger row; app shows the self-harm card with the
--       "not shared" line, never the held line.
--   (2) Tier 1 term + person-directed threat intent -> the
--       :THREAT suffix; app shows the threat card, not the
--       self-harm prayer.
--   (3) Tier 1 term only (profanity, no hold intent) -> generic
--       MODERATION_BLOCKED with NO suffix; app shows only the
--       generic "Not shared" alert, NO card.
--   (4) Tier 1 term + hate/contact/link/money-only intent ->
--       generic MODERATION_BLOCKED, NO card (proves the
--       whitelist, not a pass-through of hidden_reason).
--   (5) Tier 1 term + possession intent (e.g. a blocklist term +
--       "I am demon possessed") -> MODERATION_BLOCKED:POSSESSION,
--       NO row; app shows the possession card with the "not
--       shared" line, never the held line.
--   (6) Hold-only text (no Tier 1 term) -> unchanged held row
--       with 'hold:<category>' and the existing held card path;
--       this section must not change hold behaviour at all.
--   (7) Clean text -> published row, no error, no card.
-- If (3) or (4) ever yields a card, or (1)/(2)/(5) yield a
-- generic error on staging, stop: either the trigger order broke
-- (hold no longer runs before block) or the error string is
-- being truncated in transit. Do not ship on a partial signal.
-- =====================================================================

-- =====================================================================
-- §T1 — Threat-seed narrowing (audit M24, R10-M7).
-- VERIFIED-SYNTAX-ONLY (read against 00019 seed list + §S1
-- classifier) AND NEEDS-STAGING-TEST (see test list below).
-- NOT executed against any database. No existing migration file
-- is edited here: 00019's bare seeds are removed by DELETE below,
-- as a forward data change in this file only.
--
-- Defect: 00019 seeds 'kill all', 'death to', and 'i want to
-- kill' are bare prefixes with no person/group object, so the
-- separator-tolerant matcher holds ordinary deliverance prayer
-- language as a threat: "kill all fear", "death to sin", "I want
-- to kill sin" (and "kill all demons") all hold, routing a
-- deliverance prayer to the threat support card instead of
-- publishing. "Kill" alone never holds, but these three bare
-- prefixes do — that is the FP this section removes.
-- Fix (data change only — block-wins order, trigger order, and
-- classifier code are UNCHANGED):
--   (1) DELETE the three bare seeds. After this section, a bare
--       "kill all", "death to", or "I want to kill" (no object)
--       holds NOTHING on its own.
--   (2) INSERT person-directed completions: the same three stems
--       with a person/group object attached (pronouns, generic
--       person nouns, and the group nouns already used by 00019's
--       hate seeds, plus intent-equivalents 'kill everyone' /
--       'kill everybody'). A completion holds only as an exact
--       phrase (modulo the §S1 separator/leet/repeat folding);
--       "kill all fear" matches no completion, so it publishes.
-- Deliberately NOT added: possessive completions ('i want to
-- kill my ...', 'kill all my ...'). The 'my' slot serves both
-- real targets ("my brother") and deliverance objects ("my
-- fear", "my sin"), so adding it would re-create the FP for a
-- large class. Consequence, stated plainly: "I want to kill my
-- brother" EVADES after this section (report path only).
-- Also deliberately NOT added: nation/political slogans (e.g.
-- "death to America") and novel group nouns — the completion
-- list is finite, so "kill all teachers" / "death to my family"
-- / "kill all the christians" (intervening article breaks
-- exact-phrase matching) all EVADE. That is the coverage
-- trade-off of narrowing: fewer deliverance FPs, at the cost of
-- some real threats now evading the automatic hold. Moderator
-- review via the report path is the remaining backstop for
-- evasions; nothing here widens the report path.
-- Scope note: other pre-existing bare/possessive threat seeds
-- are NOT narrowed here because they were not in this task:
-- 'i will kill', 'going to kill', and 'kill your' remain as
-- 00019 wrote them. So "I will kill sin" and "kill your fear"
-- can STILL hold as threat after this section — a known
-- residual FP, flagged here, not silently fixed.
-- Bare "suicide" stays NON-HOLDING (settled ruling): no bare
-- "suicide" seed is added here or anywhere in this file.
-- "My brother died by suicide, please pray" must NOT hold;
-- §S1's 'thinking of suicide' / 00019's 'thinking about
-- suicide' are intent phrases, distinct from a bereavement
-- mention, and are untouched by this section.
-- Structural limit: the narrowing is a DATA change, not a
-- constraint. Nothing in this file prevents a future
-- service-role insert from re-adding a bare seed; treat any
-- re-appearance of 'kill all' / 'death to' / 'i want to kill'
-- as a regression, not as a new approved seed.
-- Idempotency: DELETE of absent rows is a no-op, and the
-- INSERTs use ON CONFLICT DO NOTHING, so applying this file
-- twice is safe for this section.
-- =====================================================================
DELETE FROM public.moderation_hold_patterns
WHERE pattern IN ('kill all', 'death to', 'i want to kill');
INSERT INTO public.moderation_hold_patterns (pattern, category) VALUES
  ('kill all of you', 'threat'),
  ('kill all of them', 'threat'),
  ('kill all of us', 'threat'),
  ('kill all you', 'threat'),
  ('kill all people', 'threat'),
  ('kill all christians', 'threat'),
  ('kill all jews', 'threat'),
  ('kill all muslims', 'threat'),
  ('kill all gay people', 'threat'),
  ('kill everyone', 'threat'),
  ('kill everybody', 'threat'),
  ('death to you', 'threat'),
  ('death to him', 'threat'),
  ('death to her', 'threat'),
  ('death to them', 'threat'),
  ('death to us', 'threat'),
  ('death to all of you', 'threat'),
  ('death to all of them', 'threat'),
  ('death to christians', 'threat'),
  ('death to jews', 'threat'),
  ('death to muslims', 'threat'),
  ('death to gay people', 'threat'),
  ('i want to kill you', 'threat'),
  ('i want to kill him', 'threat'),
  ('i want to kill her', 'threat'),
  ('i want to kill them', 'threat'),
  ('i want to kill someone', 'threat'),
  ('i want to kill everyone', 'threat'),
  ('i want to kill everybody', 'threat'),
  ('i want to kill people', 'threat'),
  ('i want to kill all of you', 'threat'),
  ('i want to kill all of them', 'threat'),
  ('i want to kill christians', 'threat'),
  ('i want to kill jews', 'threat'),
  ('i want to kill muslims', 'threat'),
  ('i want to kill gay people', 'threat')
ON CONFLICT (pattern) DO NOTHING;
-- NOTE: every completion above must pass the theology-guard
-- CHECK in force at insert time (00019's 6-token guard, widened
-- to 10 tokens by §T2 below). None contains a guarded token, by
-- reading. 'i want to kill myself' is deliberately NOT listed
-- as a threat completion: 'kill myself' already holds it as
-- self_harm, which outranks threat, so no threat row is needed.
-- STAGING TESTS for §T1 (as the post author; verify the returned
-- row's hidden_at / hidden_reason, as in §S1):
--   MUST HOLD (hidden_reason 'hold:threat'): "kill all of you",
--   "kill all christians", "kill everyone", "death to them",
--   "death to christians", "I want to kill you",
--   "I want to kill everyone".
--   MUST NOT HOLD: "kill all fear", "death to sin",
--   "I want to kill sin", "kill all demons", bare "kill all",
--   bare "death to", bare "I want to kill" (no object),
--   "my brother died by suicide, please pray" (bare suicide,
--   settled ruling), "kill sin" (unchanged, no person target).
--   KNOWN EVASIONS (record, do not misread as test failures):
--   "I want to kill my brother" (possessive slot excluded),
--   "kill all teachers" (novel group), "kill all the
--   christians" (intervening article), "I will kill sin" and
--   "kill your fear" (seeds outside this section's scope).
--   MUST STILL HOLD as before: "kill you" (threat), "kill
--   myself" (self_harm), "thinking about suicide" (self_harm).
--   TABLE CHECK (service role): SELECT pattern FROM
--   public.moderation_hold_patterns WHERE pattern IN
--   ('kill all', 'death to', 'i want to kill') must return 0
--   rows, and every §T1 completion above must be present.

-- =====================================================================
-- §T2 — Theological guard widening + blocklist guard (audit M25,
-- R10-M8). VERIFIED-SYNTAX-ONLY (read against 00019 guard +
-- 00010 blocklist seeds) AND NEEDS-STAGING-TEST (below). NOT
-- executed against any database. No existing migration is edited:
-- 00019's guard stays as written; this section SUPERSEDES it on
-- the hold table (same constraint name, widened body) and adds
-- the same guard, under a new constraint name, to the
-- blocklist table. §H14 earlier in this file re-adds the 6-token
-- guard only if it is missing; because this section runs after
-- §H14, the widened guard below is the final state either way.
--
-- Defect: 00019's guard rejects only exact spaced tokens demon /
-- demons / hell / deliverance / spirit / spirits. demonic,
-- spiritual, devil, satan (and hellfire) all pass it, so a
-- future service-role seed containing them would be accepted —
-- and, separately, moderation_blocklist has NO guard at all, so
-- a future service-role insert of hell / demon / deliverance
-- into the blocklist would hard-block theological prayer
-- language at Tier 1 with nothing to stop it.
-- Fix: widen the guarded token list to 10 tokens — demon,
-- demons, hell, deliverance, spirit, spirits, demonic,
-- spiritual, devil, satan — on BOTH tables. The guard form is
-- unchanged from 00019: a CHECK on the normalized spaced copy
-- (normalize_wall_text, then non-letters to spaces, padded),
-- so a seed/term is rejected if ANY guarded token appears as a
-- whole token anywhere in it.
-- What the guard is NOT (token-exact limits, stated honestly):
--   * It does NOT stem. 'devils' does NOT match '% devil %';
--     'satanic' does NOT match '% satan %'; 'hellfire',
--     'hellish', 'demoniac', 'spiritualized', and 'unspiritual'
--     all PASS the guard. A future seed containing only such a
--     form would be accepted. The list buys exact-token cover,
--     not morphological cover.
--   * It DOES split on non-letters first, so hyphenated /
--     punctuated forms DO trip it: 'devil-worship' normalizes
--     to tokens including 'devil' and is rejected, and a
--     possessive such as "demon's" splits to 'demon' + 's' and
--     is rejected. Accent/homoglyph folding from
--     normalize_wall_text applies (same chain as 00019).
--   * It guards SEED/TERM INSERTS only. It does not scan post
--     text, does not remove existing rows, and does not cover
--     the allowlist (untouched here, per scope — an allowlist
--     entry alone blocks nothing).
--   * It depends on normalize_wall_text() existing and parsing
--     (§S4 branch question) — the same dependency 00019's guard
--     already has, not a new one.
-- Validation safety, by reading (NOT by execution): no existing
-- row violates the widened guard, so the validating ADDs below
-- should succeed on a repo-faithful database — 00019 seeds +
-- §S1 seeds + §T1 completions contain no guarded token, and
-- 00010 blocklist terms (fuck ... tranny) contain none either.
-- If staging/live holds a service-role-added row that DOES
-- violate it, the ADD fails loudly: run the staging pre-checks
-- below FIRST, investigate the row, and do not force the
-- migration past it.
-- Idempotency: DROP CONSTRAINT IF EXISTS + ADD makes a second
-- apply of this file safe for this section (the widened guard
-- is dropped and re-added; rows still pass).
-- =====================================================================
-- STAGING PRE-CHECKS for §T2 (service role, BEFORE applying):
--   SELECT pattern FROM public.moderation_hold_patterns WHERE
--     (' ' || regexp_replace(public.normalize_wall_text(pattern),
--       '[^a-z]+', ' ', 'g') || ' ') LIKE ANY (ARRAY[
--       '% demon %', '% demons %', '% hell %', '% deliverance %',
--       '% spirit %', '% spirits %', '% demonic %',
--       '% spiritual %', '% devil %', '% satan %']);
--   SELECT term FROM public.moderation_blocklist WHERE
--     (' ' || regexp_replace(public.normalize_wall_text(term),
--       '[^a-z]+', ' ', 'g') || ' ') LIKE ANY (ARRAY[
--       '% demon %', '% demons %', '% hell %', '% deliverance %',
--       '% spirit %', '% spirits %', '% demonic %',
--       '% spiritual %', '% devil %', '% satan %']);
-- Both must return 0 rows. Any row returned is a pre-existing
-- violation to investigate before deploying, not a row to
-- delete silently.
ALTER TABLE public.moderation_hold_patterns DROP CONSTRAINT IF EXISTS moderation_hold_patterns_theology_guard;
ALTER TABLE public.moderation_hold_patterns
  ADD CONSTRAINT moderation_hold_patterns_theology_guard CHECK (
    NOT ((' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% demon %'
      OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% demons %'
      OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% hell %'
      OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% deliverance %'
      OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% spirit %'
      OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% spirits %'
      OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% demonic %'
      OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% spiritual %'
      OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% devil %'
      OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% satan %')
  );
ALTER TABLE public.moderation_blocklist DROP CONSTRAINT IF EXISTS moderation_blocklist_theology_guard;
ALTER TABLE public.moderation_blocklist
  ADD CONSTRAINT moderation_blocklist_theology_guard CHECK (
    NOT ((' ' || regexp_replace(public.normalize_wall_text(term), '[^a-z]+', ' ', 'g') || ' ') LIKE '% demon %'
      OR (' ' || regexp_replace(public.normalize_wall_text(term), '[^a-z]+', ' ', 'g') || ' ') LIKE '% demons %'
      OR (' ' || regexp_replace(public.normalize_wall_text(term), '[^a-z]+', ' ', 'g') || ' ') LIKE '% hell %'
      OR (' ' || regexp_replace(public.normalize_wall_text(term), '[^a-z]+', ' ', 'g') || ' ') LIKE '% deliverance %'
      OR (' ' || regexp_replace(public.normalize_wall_text(term), '[^a-z]+', ' ', 'g') || ' ') LIKE '% spirit %'
      OR (' ' || regexp_replace(public.normalize_wall_text(term), '[^a-z]+', ' ', 'g') || ' ') LIKE '% spirits %'
      OR (' ' || regexp_replace(public.normalize_wall_text(term), '[^a-z]+', ' ', 'g') || ' ') LIKE '% demonic %'
      OR (' ' || regexp_replace(public.normalize_wall_text(term), '[^a-z]+', ' ', 'g') || ' ') LIKE '% spiritual %'
      OR (' ' || regexp_replace(public.normalize_wall_text(term), '[^a-z]+', ' ', 'g') || ' ') LIKE '% devil %'
      OR (' ' || regexp_replace(public.normalize_wall_text(term), '[^a-z]+', ' ', 'g') || ' ') LIKE '% satan %')
  );
-- STAGING TESTS for §T2 (service-role seed/term inserts; delete
-- or roll back every test row afterwards — these are probe
-- inserts, not shipped seeds):
--   MUST REJECT (CHECK violation): hold-pattern inserts
--   'demonic oppression', 'spiritual warfare', 'devil worship',
--   'satan rules' (new tokens), and 'demon attack' (old token);
--   blocklist inserts 'hell', 'demon', 'deliverance', 'spirit',
--   'demonic', 'spiritual', 'devil', 'satan'.
--   MUST ACCEPT (then delete/roll back): a hold-pattern insert
--   with no guarded token, and a blocklist insert with no
--   guarded token — proving the guard rejects tokens, not the
--   tables.
--   TOKEN-EXACT LIMITS (verify, do not misread as failures):
--   hold-pattern inserts 'devils army', 'satanic ritual',
--   'hellfire preaching' PASS the guard (plurals/derived forms
--   are not exact tokens); 'devil-worship' is REJECTED (hyphen
--   splits into the 'devil' token).
--   SECOND APPLY: applying this file twice must not fail on
--   §T1/§T2 (DELETE no-op, INSERT ON CONFLICT DO NOTHING,
--   DROP IF EXISTS + ADD).

-- =====================================================================
-- END OF 00020. Reminder, repeated so it cannot be missed at
-- the bottom of the file: NOT YET APPLIED, NOT EXECUTED, NOT
-- VERIFIED AGAINST STAGING OR LIVE. Every section above states
-- its own verification status; the file as a whole is
-- syntax-read-only plus staging-test-owed. Obtain Kai's approval
-- on every approval-required item (header list) and pass every
-- staging test in this file before any deploy.
-- =====================================================================
