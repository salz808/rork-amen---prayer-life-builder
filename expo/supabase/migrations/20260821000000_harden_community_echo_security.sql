/*
  Harden Community Echo ownership and Amen RPC identity.
  Additive policy/function replacement; existing public wall reads remain unchanged.
*/

DROP POLICY IF EXISTS "Users can create community echoes" ON public.community_echoes;

CREATE POLICY "Users can create own community echoes"
  ON public.community_echoes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP FUNCTION IF EXISTS public.amen_community_echo(uuid, uuid);

CREATE OR REPLACE FUNCTION public.amen_community_echo(p_echo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.community_amens (echo_id, user_id)
  VALUES (p_echo_id, caller_id);

  UPDATE public.community_echoes
  SET amens = public.community_echoes.amens + 1
  WHERE public.community_echoes.id = p_echo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prayer request not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.amen_community_echo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.amen_community_echo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.amen_community_echo(uuid) TO authenticated;
