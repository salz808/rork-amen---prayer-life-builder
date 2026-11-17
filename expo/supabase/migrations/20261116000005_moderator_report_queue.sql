-- =====================================================================
-- 20261116000005 — Moderator report queue (GPT-6 item 12, 2026-11-16)
--
-- Guideline 1.2: a moderator must be able to review reported
-- user-generated content. Until now the queue (get_hidden_wall_posts,
-- 00010, reworked 00020 §H24) listed ONLY posts hidden by the
-- 3-distinct-reporter auto-hide threshold. A post with 1–2 reports
-- was invisible to moderators until a third report hid it — and a
-- held post with no reports at all was only visible through that
-- same hidden-posts list. This migration keeps the 3-reporter
-- auto-hide threshold exactly as it is (no change to the auto-hide
-- triggers in 00010/00017/00018) and adds the missing review surface.
--
-- WHAT THIS DOES:
--   §1  reviewed_by uuid on echo_reports + testimony_reports, so a
--       review records WHO reviewed it (with the existing
--       reviewed_at, WHEN). Nullable, no FK: a moderator account
--       deleted later must not block or cascade the audit trail.
--   §2  moderation_actions CHECK gains 'dismiss' (the new action).
--   §3  moderate_wall_post (text, uuid, text, boolean) is REDEFINED
--       — same signature, so CREATE OR REPLACE suffices (no DROP,
--       grants preserved). Body is 00020 §S6 verbatim EXCEPT:
--       (a) the unhide branches now stamp reviewed_by = auth.uid()
--           alongside reviewed_at, so a Restore records its reviewer;
--       (b) the delete branch drops its `hidden_at IS NOT NULL`
--           requirement, so a moderator can delete a VISIBLE
--           reported post straight from the new queue (delete was
--           previously reachable only after a post was hidden);
--           scope is unchanged (public echoes only, any testimony),
--           and report rows still cascade with the post (FK ON
--           DELETE CASCADE) — the §H24 delete-evidence archiving
--           question is still Kai/process-owned, NOT decided here;
--       (c) a new 'dismiss' action: archives a VISIBLE post's
--           unreviewed reports (reviewed_at + reviewed_by) without
--           touching the post. Visible-only by design: dismissing a
--           hidden post's reports while leaving it hidden would
--           strand it (hidden, nothing left to review). Hidden posts
--           use Restore / Delete. Dismiss with no unreviewed
--           reports raises 'Nothing to dismiss'.
--       The §S6 unhide revalidation (Tier 1 refusal, self_harm /
--       threat force rule), the 'hide' action, and the re-report
--       reactivation are all unchanged.
--   §4  NEW RPC get_report_queue(p_limit, p_offset) — moderator-only,
--       oldest-first. Returns ONE row per post needing review:
--         * every post with ≥1 UNREVIEWED report (visible or hidden),
--           with report_count (distinct unreviewed reporters),
--           first_reported_at (oldest unreviewed report) and
--           recent_reasons (up to 3 most recent unreviewed reasons,
--           newest first — the 00020 §H24 pattern), and
--         * every HIDDEN post with zero unreviewed reports (pure
--           tier-2 holds). These carry report_count 0,
--           first_reported_at NULL, recent_reasons NULL, and order by
--           hidden_at.
--       The union is deliberate: the old queue's entire content
--       (all hidden posts) is a subset of this queue, so switching
--       the screen to it loses NO moderator coverage — a self-harm
--       hold with no reports still shows up for review. Ordering is
--       COALESCE(first_reported_at, hidden_at) ASC (oldest first);
--       paging mirrors get_hidden_wall_posts (limit clamped 1–100,
--       offset ≥ 0); each returned row logs a 'queue_read' audit row,
--       same as the old queue.
--
-- REASONS: the report RPCs (report_community_echo /
--   report_testimony, 00020 §S6) keep accepting free-text p_reason
--   (≤ 500 chars) — NO server-side vocabulary CHECK is added here.
--   Legacy free-text reasons exist in the tables, and the reason
--   selector is a client affordance (lib/moderation.ts
--   REPORT_REASONS): the client sends a canonical code
--   ('harassment', 'personal_info', 'self_harm', 'threat', 'spam',
--   'inappropriate', 'other'), the queue renders known codes via
--   the client label map and any other stored text verbatim. If the
--   owner later wants the vocabulary enforced server-side, add a
--   CHECK then — do not silently reject legacy reasons now.
--
-- NO CHANGE to the auto-hide threshold, the report RPCs, the daily
--   report cap, or get_hidden_wall_posts (kept for compatibility;
--   the screen moves to get_report_queue).
--
-- DEPLOY: staging first, then live. Re-runnable where marked
--   (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE).
-- =====================================================================

-- ── §1 — Who reviewed it ─────────────────────────────────────────────

ALTER TABLE public.echo_reports ADD COLUMN IF NOT EXISTS reviewed_by uuid;
ALTER TABLE public.testimony_reports ADD COLUMN IF NOT EXISTS reviewed_by uuid;

-- ── §2 — 'dismiss' joins the moderation_actions vocabulary ───────────

ALTER TABLE public.moderation_actions DROP CONSTRAINT IF EXISTS moderation_actions_action_check;
ALTER TABLE public.moderation_actions
  ADD CONSTRAINT moderation_actions_action_check
  CHECK (action IN ('unhide', 'delete', 'queue_read', 'hide', 'force_unhide', 'dismiss'));

-- ── §3 — moderate_wall_post: reviewer stamping + visible delete + dismiss ──
-- Same signature as 00020 §S6 (text, uuid, text, boolean), so
-- CREATE OR REPLACE keeps the existing grants. Body copied from
-- 00020 §S6 with ONLY the three changes listed in the header (§3a–c);
-- everything else (revalidation, force rule, hide, re-report
-- reactivation) is unchanged. Do NOT edit this copy without
-- re-reading 00020 §S6 — the two must stay in agreement until the
-- next redefinition supersedes both.

CREATE OR REPLACE FUNCTION public.moderate_wall_post(p_kind text, p_id uuid, p_action text, p_force boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_found boolean := false;
  v_text text;
  v_hold text;
  v_log_action text;
  v_hidden_at timestamptz;
  v_reports bigint;
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
        -- 00005 §3a: stamp the reviewer as well as the time.
        UPDATE public.echo_reports SET reviewed_at = now(), reviewed_by = auth.uid()
        WHERE echo_id = p_id AND reviewed_at IS NULL;
      END IF;
    ELSE
      UPDATE public.community_testimonies SET hidden_at = NULL, hidden_reason = NULL
      WHERE id = p_id AND hidden_at IS NOT NULL;
      v_found := FOUND;
      IF v_found THEN
        -- 00005 §3a: stamp the reviewer as well as the time.
        UPDATE public.testimony_reports SET reviewed_at = now(), reviewed_by = auth.uid()
        WHERE testimony_id = p_id AND reviewed_at IS NULL;
      END IF;
    END IF;
  ELSIF p_action = 'hide' THEN
    -- Hide a VISIBLE post. Scope mirrors the existing RPC
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
  ELSIF p_action = 'dismiss' THEN
    -- 00005 §3c: NEW. Archive a VISIBLE post's unreviewed reports
    -- without touching the post. Visible-only: a hidden post's
    -- reports are cleared by Restore (unhide) or Delete, never by
    -- dismiss — dismissing them while leaving the post hidden would
    -- strand it (hidden, nothing left to review).
    IF p_kind = 'echo' THEN
      SELECT hidden_at INTO v_hidden_at FROM public.community_echoes
      WHERE id = p_id AND circle_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Post is not hidden or not found';
      END IF;
      IF v_hidden_at IS NOT NULL THEN
        RAISE EXCEPTION 'Post is hidden — use Restore or Delete';
      END IF;
      UPDATE public.echo_reports SET reviewed_at = now(), reviewed_by = auth.uid()
      WHERE echo_id = p_id AND reviewed_at IS NULL;
      GET DIAGNOSTICS v_reports = ROW_COUNT;
      v_found := v_reports > 0;
    ELSIF p_kind = 'testimony' THEN
      SELECT hidden_at INTO v_hidden_at FROM public.community_testimonies
      WHERE id = p_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Post is not hidden or not found';
      END IF;
      IF v_hidden_at IS NOT NULL THEN
        RAISE EXCEPTION 'Post is hidden — use Restore or Delete';
      END IF;
      UPDATE public.testimony_reports SET reviewed_at = now(), reviewed_by = auth.uid()
      WHERE testimony_id = p_id AND reviewed_at IS NULL;
      GET DIAGNOSTICS v_reports = ROW_COUNT;
      v_found := v_reports > 0;
    ELSE
      RAISE EXCEPTION 'Unknown kind';
    END IF;
    IF NOT v_found THEN
      RAISE EXCEPTION 'Nothing to dismiss';
    END IF;
    v_log_action := 'dismiss';
  ELSIF p_action = 'delete' THEN
    -- 00005 §3b: the hidden_at requirement is DROPPED — a moderator
    -- can now delete a visible reported post straight from the
    -- report queue. Scope is unchanged (public echoes only, any
    -- testimony). Report rows still cascade with the post (FK ON
    -- DELETE CASCADE); see §H24 for the Kai/process archiving
    -- decision — no archiving is implemented here.
    IF p_kind = 'echo' THEN
      DELETE FROM public.community_echoes WHERE id = p_id AND circle_id IS NULL;
      v_found := FOUND;
    ELSIF p_kind = 'testimony' THEN
      DELETE FROM public.community_testimonies WHERE id = p_id;
      v_found := FOUND;
    ELSE
      RAISE EXCEPTION 'Unknown kind';
    END IF;
    v_log_action := 'delete';
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

-- Grants preserved by CREATE OR REPLACE (00020 §S6: revoked from
-- anon/public, granted to authenticated). No GRANT/REVOKE repeated
-- here on purpose, mirroring 00020.

-- ── §4 — get_report_queue: every unreviewed report, oldest first ────

CREATE OR REPLACE FUNCTION public.get_report_queue(p_limit int DEFAULT 50, p_offset int DEFAULT 0)
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
  first_reported_at timestamptz,
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
    SELECT q.kind, q.id, q.preview, q.author_id, q.first_name,
           q.created_at, q.hidden_at, q.hidden_reason,
           q.report_count, q.circle_id, q.first_reported_at, q.recent_reasons
    FROM (
      SELECT 'echo'::text AS kind, e.id, e.text AS preview, e.user_id AS author_id,
             NULL::text AS first_name, e.created_at, e.hidden_at, e.hidden_reason,
             (SELECT COUNT(DISTINCT reporter_id) FROM public.echo_reports
              WHERE echo_id = e.id AND reviewed_at IS NULL) AS report_count,
             e.circle_id,
             (SELECT MIN(created_at) FROM public.echo_reports
              WHERE echo_id = e.id AND reviewed_at IS NULL) AS first_reported_at,
             (SELECT array_agg(s.reason ORDER BY s.created_at DESC)
              FROM (SELECT reason, created_at FROM public.echo_reports
                    WHERE echo_id = e.id AND reviewed_at IS NULL AND reason IS NOT NULL
                    ORDER BY created_at DESC LIMIT 3) s) AS recent_reasons
      FROM public.community_echoes e
      WHERE e.circle_id IS NULL
        AND (e.hidden_at IS NOT NULL
             OR EXISTS (SELECT 1 FROM public.echo_reports
                        WHERE echo_id = e.id AND reviewed_at IS NULL))
      UNION ALL
      SELECT 'testimony'::text, t.id,
             t.request || E'\n\nGod answered: ' || t.answer,
             t.user_id, t.first_name, t.created_at, t.hidden_at, t.hidden_reason,
             (SELECT COUNT(DISTINCT reporter_id) FROM public.testimony_reports
              WHERE testimony_id = t.id AND reviewed_at IS NULL),
             NULL::uuid,
             (SELECT MIN(created_at) FROM public.testimony_reports
              WHERE testimony_id = t.id AND reviewed_at IS NULL),
             (SELECT array_agg(s.reason ORDER BY s.created_at DESC)
              FROM (SELECT reason, created_at FROM public.testimony_reports
                    WHERE testimony_id = t.id AND reviewed_at IS NULL AND reason IS NOT NULL
                    ORDER BY created_at DESC LIMIT 3) s)
      FROM public.community_testimonies t
      WHERE t.hidden_at IS NOT NULL
         OR EXISTS (SELECT 1 FROM public.testimony_reports
                    WHERE testimony_id = t.id AND reviewed_at IS NULL)
    ) q
    ORDER BY COALESCE(q.first_reported_at, q.hidden_at) ASC
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
    first_reported_at := v_row.first_reported_at;
    recent_reasons := v_row.recent_reasons;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_report_queue(int, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_report_queue(int, int) TO authenticated;

-- STAGING TESTS (moderator JWT + non-moderator JWT + reporter JWTs):
--   §1  Apply; confirm reviewed_by exists on both report tables and
--       existing rows keep reviewed_by NULL.
--   §4a Visible echo, 1 unreviewed report (reason 'harassment'):
--       get_report_queue as moderator returns it with report_count 1,
--       hidden_at NULL, first_reported_at = the report's created_at,
--       recent_reasons = ARRAY['harassment'].
--   §4b Same echo, 2nd report from another user: report_count 2,
--       first_reported_at unchanged (oldest report).
--   §4c Same echo, 3rd distinct reporter: auto-hide still fires
--       (threshold unchanged — post hidden, hidden_reason 'reports');
--       queue row now shows hidden_at set, same reports.
--   §4d Pure hold (hidden, 0 reports): queue returns it with
--       report_count 0, first_reported_at NULL, recent_reasons NULL.
--   §4e Ordering: a post reported yesterday sorts before a post
--       reported today, regardless of hidden state; a pure hold
--       orders by hidden_at among them.
--   §4f Non-moderator queue call -> 'Not a moderator' (no reasons leak).
--   §4g Paging: limit 1 offset 1 returns the 2nd-oldest row.
--   §3a Dismiss the §4a echo: returns void; its report row now has
--       reviewed_at + reviewed_by = moderator; the post stays visible;
--       the queue no longer lists it; moderation_actions has 'dismiss'.
--   §3b Dismiss the same echo again -> 'Nothing to dismiss'.
--   §3c Dismiss a HIDDEN reported post -> 'Post is hidden — use
--       Restore or Delete'; reports untouched.
--   §3d Delete a VISIBLE reported echo (new in 00005): post gone,
--       its reports cascade-gone, moderation_actions has 'delete'.
--   §3e Restore (unhide) a report-hidden echo: post visible, reports
--       archived with reviewed_at AND reviewed_by = moderator.
--   §3f Delete a missing id -> 'Post is not hidden or not found';
--       non-moderator moderate call -> 'Not a moderator'.
--   §3g Self-harm hold unhide without force still refused (§S6
--       revalidation intact — this redefinition must not regress it).
