-- WALL-LIVE-1 (audit round 4, fix lane 1): the live wall INSERT policy
-- stack is still open to anonymous posting AND non-member circle
-- posting. Migration 20261025000008 was meant to replace the live
-- policy, but it dropped the PRE-circles name ("Users can create
-- community echoes"), which the circles migration
-- (20260822000000:115-116) had already dropped — a silent no-op — and
-- then created a second policy alongside the live one. Postgres ORs
-- permissive policies, so the pair together admits: anonymous public
-- posts (via the old circle-checked policy, which has no anon guard)
-- and non-member circle posts (via the new anon-guarded policy, which
-- has no circle check). This migration drops BOTH live INSERT policy
-- names — verified against the migration files, not from memory — and
-- creates exactly ONE combined policy. It applies independently of
-- 00010 (which does not touch echo INSERT) and of build 7.
--
-- VERIFY AFTER DEPLOY (do not trust DROP IF EXISTS silence):
--   SELECT policyname, cmd, with_check FROM pg_policies
--   WHERE tablename = 'community_echoes' AND cmd = 'INSERT';
-- Expected: exactly one row, "Users can create own community echoes".
-- Then JWT-test: anonymous public post denied; non-member circle post
-- denied; member public + circle posts allowed.

DROP POLICY IF EXISTS "Users can create own community echoes" ON public.community_echoes;
DROP POLICY IF EXISTS "Users can create community echoes" ON public.community_echoes;
CREATE POLICY "Users can create own community echoes"
  ON public.community_echoes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    AND (circle_id IS NULL OR EXISTS (
      SELECT 1 FROM public.circle_members cm
      WHERE cm.circle_id = community_echoes.circle_id AND cm.user_id = auth.uid()
    ))
  );
