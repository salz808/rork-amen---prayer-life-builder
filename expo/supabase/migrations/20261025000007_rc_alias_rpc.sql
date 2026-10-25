-- Audit round 2, hole #1 (2026-10-24): the opaque RevenueCat alias was
-- readable by circle co-members.
--
-- profiles.rc_alias_id is a bearer token for someone else's subscription:
-- anyone who can read it can log in to RevenueCat as that user in a
-- modified build. But RLS policies cannot restrict columns, and the
-- "Circle members can view co-member profiles" policy (20260826000000)
-- grants SELECT on whole profile rows to co-members. So the alias must
-- never be readable through the table at all — only through an RPC that
-- returns the CALLER's own alias.
--
-- 1. SECURITY DEFINER RPC: returns rc_alias_id for auth.uid() only.
-- 2. Column-level REVOKE: blocks every direct SELECT of rc_alias_id,
--    including co-member reads, while leaving all other profile columns
--    (and the co-member policy) untouched. SELECT * from a client now
--    simply omits this column.
-- The webhook is unaffected: it runs as the service role, which bypasses
-- both RLS and this revoke, and it never reads the column through the
-- client path anyway (it resolves aliases server-side).
CREATE OR REPLACE FUNCTION public.get_my_rc_alias()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT rc_alias_id FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_rc_alias() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_rc_alias() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_rc_alias() TO authenticated;

REVOKE SELECT (rc_alias_id) ON public.profiles FROM authenticated;
REVOKE SELECT (rc_alias_id) ON public.profiles FROM anon;
