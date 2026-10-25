-- Audit must-fix #8 (2026-10-24): a self-amen used to consume milestone 1.
--
-- The original RPC incremented the counter first and skipped only the
-- notification for self-amens, so an author amening their own request took
-- the count 0 -> 1 with no bell, and the first genuine pray-er took it
-- 1 -> 2, also not a milestone. Reject self-amens outright, before the
-- insert, so milestone 1 always means "someone prayed for you".
-- (This redefines the function created in 20261025000002; that migration
-- is already applied remotely, so it is never edited in place.)
CREATE OR REPLACE FUNCTION public.amen_community_echo(p_echo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  v_circle_id uuid;
  v_author_id uuid;
  v_new_count integer;
  v_notify boolean;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT user_id, circle_id INTO v_author_id, v_circle_id
  FROM public.community_echoes
  WHERE id = p_echo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prayer request not found' USING ERRCODE = 'P0002';
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

  -- Milestone notification: only for a real author, never for amening
  -- your own request (now impossible above, kept as defense in depth),
  -- only on an exact milestone, only if the author has not turned these
  -- off. The UNIQUE constraint + ON CONFLICT guard make a double-write
  -- impossible even under concurrent amens.
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

REVOKE ALL ON FUNCTION public.amen_community_echo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.amen_community_echo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.amen_community_echo(uuid) TO authenticated;
