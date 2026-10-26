-- 20261025000019 — Wall moderation tiers (Kai-approved 2026-10-25 late).
--
-- Expands the 00010 moderation stack, which hard-blocked only a short
-- profanity/slur/sexual list. The approved tiers, in enforcement order:
--
--   Tier 1 — HARD BLOCK (unchanged, 00010): profanity / slurs /
--     sexually explicit language. The 00010 trigger raises
--     MODERATION_BLOCKED and the whole transaction aborts, so a blocked
--     post never lands, held or otherwise.
--   Tier 2 — HOLD HIDDEN, never public (this migration): self-harm
--     phrases, threats to harm someone else, hate targeting a person or
--     group, phone numbers, email addresses, home addresses, links, and
--     money asks / fundraising. A held post INSERTS successfully with
--     hidden_at set and hidden_reason 'hold:<category>'; it is visible
--     ONLY to its author (as "Under review") and to moderators via the
--     existing review queue — the same hidden-post RLS from 00010, which
--     this migration does not change. Moderators unhide or delete held
--     rows with the existing moderate_wall_post RPC (it acts on any
--     hidden row, regardless of reason), and unhide clears the reason.
--   Tier 3 — REPORT AUTO-HIDE (unchanged, 00010): 3 distinct reporters.
--   Tier 4 — NEVER BLOCKED OR HELD FOR THEOLOGY: demon, hell,
--     deliverance, spirit, and similar prayer language stay allowed.
--     The pattern table below enforces this structurally: its CHECK
--     rejects any pattern containing those words, so a future seed
--     cannot quietly reintroduce a theological block. (Deliverance
--     phrasing such as "spirit of death" is therefore never a hold
--     trigger on its own; only the intent phrases in the seed list
--     hold, e.g. "kill myself".)
--
-- Server-side only, same lesson as 00010: the triggers below are the
-- gate. Client code reads the returned row's hidden_at/hidden_reason
-- to tell the author a post is under review; it never decides
-- block vs hold itself, and there is no client pre-check RPC for the
-- hold categories (a hold-category oracle would let anyone probe
-- which phrases hold, exactly why 00010 revoked the blocklist grant).
--
-- Trigger order on BEFORE INSERT (Postgres fires same-timing triggers
-- in trigger-name order), and why each ordering is safe:
--   wall_daily_limit (00010) runs first: a held post CONSUMES the
--     one-public-post-per-UTC-day ledger slot, exactly like a
--     published post. This is deliberate — held posts are reviewable
--     submissions, not free retries, so the ledger still bounds
--     held-queue flooding. Delete-and-repost does not reset it (00010).
--   wall_hold_policy_* (this file) runs second: sets hidden_at /
--     hidden_reason on the NEW row when it is still visible.
--   wall_text_policy_* (00010) runs last: a blocked post raises and
--     aborts the transaction, so the held row and the ledger insert
--     both roll back. Block therefore always wins over hold.
-- On BEFORE UPDATE the hidden-field guard (00010, name order first)
-- sees hidden_at unchanged and passes; the hold trigger then sets
-- hidden_at only when it is still NULL and the text actually changed,
-- mirroring the 00010 skip-if-unchanged rule so amen-count and other
-- unrelated updates never re-hold a row. A row already hidden by
-- reports keeps its 'reports' reason: re-holding would overwrite the
-- review signal, and the moderator queue already covers it.
--
-- Circle scope, unchanged from 00010: the hold triggers apply to
-- circle echoes too (same as the block trigger), and the existing
-- hidden-post RLS + public-only moderator queue apply unchanged — a
-- held circle post is visible to its author only, not to circle
-- members, and does not surface in the public review queue (the
-- 00010 H1 circle limitation, not re-litigated here).
--
-- Amen + realtime, unchanged: amen_community_echo already rejects
-- any hidden_at row ("Post under review"), so held posts cannot
-- collect amens; realtime postgres_changes is RLS-gated, so a held
-- row is delivered only to its author. Both are staging-matrix
-- verification items for this migration (held post must not appear
-- for any other user, in feed, search, bell, or realtime).
--
-- Deliberately NOT in this migration (separate, Kai-gated work):
--   * The self-harm support card (prayer text + hotline). The client
--     holds a clearly-marked placeholder hook only; no prayer text
--     and no phone number ship here. The hook fires on
--     hidden_reason = 'hold:self_harm' and today shows only the
--     generic under-review notice, exactly like every other hold.
--   * Any change to 00010–00018, the RLS policies, the ledger, or
--     the moderator RPCs. Forward-fix only.
--
-- Seed-list judgment calls, documented so Kai can overrule:
--   * Bare "suicide" is NOT a hold phrase: a bereavement prayer
--     ("my brother died by suicide, please pray") is legitimate and
--     must not be held. Intent phrases ("kill myself", "suicidal",
--     "better off without me", ...) hold instead.
--   * "kill" alone never holds: deliverance prayers talk about
--     killing / breaking spiritual things. Threat phrases are
--     person-directed ("kill you", "kill someone", "i will kill").
--   * Money detection is intentionally broad for a HOLD (not a
--     block): a wall post mentioning a payment handle, a donation
--     ask, or a dollar amount is held for a human to clear, because
--     the wall is not a fundraising channel. A moderator unhides a
--     legitimate prayer about money; nothing is deleted by the
--     machine. Same reasoning for the address pattern.
--   * Hate seeds are group-targeted phrases only. Individual
--     harassment ("you are disgusting") is left to the report path:
--     keyword-matching it would false-hold ordinary prayer language
--     about sin and brokenness.

-- 1. Hold-pattern table: phrase seeds for self_harm / threat / hate.
-- RLS enabled with no policies: only SECURITY DEFINER functions read
-- it (same pattern as moderation_blocklist in 00010). Service role
-- adds future patterns; the theological CHECK below guards the seed.
CREATE TABLE IF NOT EXISTS public.moderation_hold_patterns (
  pattern text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('self_harm', 'threat', 'hate')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moderation_hold_patterns_theology_guard CHECK (
    NOT ((' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% demon %'
      OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% demons %'
      OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% hell %'
      OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% deliverance %'
      OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% spirit %'
      OR (' ' || regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g') || ' ') LIKE '% spirits %')
  ),
  CONSTRAINT moderation_hold_patterns_nonempty CHECK (
    btrim(regexp_replace(public.normalize_wall_text(pattern), '[^a-z]+', ' ', 'g')) <> ''
  )
);
ALTER TABLE public.moderation_hold_patterns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.moderation_hold_patterns FROM anon, authenticated;

INSERT INTO public.moderation_hold_patterns (pattern, category) VALUES
  -- self_harm: intent phrases, not bereavement mentions (see header).
  ('suicidal', 'self_harm'),
  ('kill myself', 'self_harm'),
  ('hurt myself', 'self_harm'),
  ('cut myself', 'self_harm'),
  ('end my life', 'self_harm'),
  ('take my own life', 'self_harm'),
  ('end it all', 'self_harm'),
  ('i want to die', 'self_harm'),
  ('do not want to live', 'self_harm'),
  ('dont want to live', 'self_harm'),
  ('better off without me', 'self_harm'),
  ('nobody would miss me', 'self_harm'),
  ('thinking about suicide', 'self_harm'),
  ('thoughts of suicide', 'self_harm'),
  -- threat: person-directed only; "kill" alone never holds.
  ('kill you', 'threat'),
  ('kill him', 'threat'),
  ('kill her', 'threat'),
  ('kill them', 'threat'),
  ('kill someone', 'threat'),
  ('kill yourself', 'threat'),
  ('kill your', 'threat'),
  ('i want to kill', 'threat'),
  ('i will kill', 'threat'),
  ('going to kill', 'threat'),
  ('murder you', 'threat'),
  ('murder him', 'threat'),
  ('murder her', 'threat'),
  ('murder them', 'threat'),
  ('i will hurt you', 'threat'),
  ('i want to hurt you', 'threat'),
  ('shoot you', 'threat'),
  ('stab you', 'threat'),
  ('death to', 'threat'),
  ('kill all', 'threat'),
  -- hate: group-targeted phrases only (individual harassment is
  -- report-path work, not keyword work — see header).
  ('i hate jews', 'hate'),
  ('i hate muslims', 'hate'),
  ('i hate gay people', 'hate'),
  ('all jews are', 'hate'),
  ('all muslims are', 'hate'),
  ('all gay people are', 'hate')
ON CONFLICT (pattern) DO NOTHING;

-- 2. Hold classifier. Returns NULL (publish) or one category, in
-- priority order: self_harm > threat > hate > contact > link > money.
-- Phrase matching reuses the 00010 normalization (accent/homoglyph
-- folding, zero-width stripping) plus a letters-only spaced copy, so
-- "k i l l myself", "kill-myself", and "kill  myself" all hold, while
-- word boundaries keep "skill myself" style false hits out. Contact /
-- link / money / address detection runs on the folded text (digits
-- preserved), not the letters-only copy, because phone numbers,
-- emails, and dollar amounts are digit-bearing.
CREATE OR REPLACE FUNCTION public.moderation_hold_category(p_text text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r record;
  folded text;
  spaced text;
  padded text;
  phrase_norm text;
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN NULL;
  END IF;
  folded := public.normalize_wall_text(p_text);
  spaced := regexp_replace(folded, '[^a-z]+', ' ', 'g');
  padded := ' ' || btrim(spaced) || ' ';
  -- Phrase seeds, priority-ordered by category. LIKE (not regex) on
  -- the padded word sequence: phrase_norm holds only letters and
  -- single spaces, so no regex metacharacter can sneak in via a seed.
  FOR r IN
    SELECT p.pattern, p.category FROM public.moderation_hold_patterns p
    ORDER BY CASE p.category WHEN 'self_harm' THEN 0 WHEN 'threat' THEN 1 ELSE 2 END, p.pattern
  LOOP
    phrase_norm := btrim(regexp_replace(public.normalize_wall_text(r.pattern), '[^a-z]+', ' ', 'g'));
    IF phrase_norm <> '' AND padded LIKE '% ' || phrase_norm || ' %' THEN
      RETURN r.category;
    END IF;
  END LOOP;
  -- Contact: email, phone, street address. Phone accepts 10 digits
  -- with optional separators and an optional +1; a bare date
  -- (2026-10-25) does not match the 3-3-4 grouping.
  IF folded ~ '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}' THEN
    RETURN 'contact';
  END IF;
  IF folded ~ '(\+?1[\s.\-]?)?(\(?[0-9]{3}\)?[\s.\-]?){2}[0-9]{4}' THEN
    RETURN 'contact';
  END IF;
  IF folded ~ '\m[0-9]{1,6}\s+[a-z]+(\s+[a-z]+)?\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|place|pl)\M' THEN
    RETURN 'contact';
  END IF;
  -- Link: URL scheme, www., or a bare domain in a common TLD.
  IF folded ~ 'https?://' OR folded ~ 'www\.' OR folded ~ '\m[a-z0-9\-]+\.(com|org|net|io|app|church|co|me)\M' THEN
    RETURN 'link';
  END IF;
  -- Money: payment handles, donation asks, dollar amounts. Broad on
  -- purpose for a HOLD (a human clears legitimate money prayers);
  -- this is never a block.
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
-- No client grant: same oracle reasoning as check_wall_text_blocked
-- in 00010. Callers learn hold-vs-publish only from the row the
-- trigger returns to the author, never by probing this function.
REVOKE EXECUTE ON FUNCTION public.moderation_hold_category(text) FROM anon, public, authenticated;

-- 3. Hold triggers. SECURITY DEFINER so the nested classifier call
-- needs no caller grant, mirroring the 00010 text-policy triggers.
CREATE OR REPLACE FUNCTION public.enforce_echo_hold_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_category text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.text IS NOT DISTINCT FROM OLD.text THEN
    RETURN NEW;
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
  IF NEW.hidden_at IS NULL THEN
    -- Same checked text as the 00010 testimony block trigger.
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
DROP TRIGGER IF EXISTS wall_hold_policy_echoes ON public.community_echoes;
CREATE TRIGGER wall_hold_policy_echoes
  BEFORE INSERT OR UPDATE ON public.community_echoes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_echo_hold_policy();
DROP TRIGGER IF EXISTS wall_hold_policy_testimonies ON public.community_testimonies;
CREATE TRIGGER wall_hold_policy_testimonies
  BEFORE INSERT OR UPDATE ON public.community_testimonies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_testimony_hold_policy();

-- 4. No RLS / RPC changes needed, recorded so a reviewer does not
-- "fix" this by adding any: the 00010 hidden-post SELECT policies
-- already admit (hidden_at IS NULL OR author OR moderator), so held
-- rows are author-visible and otherwise invisible with zero new
-- policy text; get_hidden_wall_posts filters on hidden_at IS NOT
-- NULL only, so held rows already surface in the moderator queue
-- with their 'hold:<category>' reason; moderate_wall_post already
-- unhides (clearing the reason) or deletes any hidden row. The
-- staging matrix must still prove each of those three for a held
-- row, not assume them from the policy text.
