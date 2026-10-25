-- A client-created echo must start at 0 amens: a forged amens value on
-- insert used to survive (the amen RPC only increments afterwards, and
-- the wall renders whatever the row carries — the old seed fallback even
-- showed invented counts up to 304).
--
-- A BEFORE INSERT trigger, NOT a CHECK constraint: the legitimate amen
-- RPC UPDATE-increments amens, and a CHECK (amens = 0) would break it.
-- The trigger forces 0 only on insert; updates pass through untouched.
CREATE OR REPLACE FUNCTION public.community_echoes_zero_amens()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.amens := 0;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_echoes_zero_amens ON public.community_echoes;
CREATE TRIGGER community_echoes_zero_amens
BEFORE INSERT ON public.community_echoes
FOR EACH ROW EXECUTE FUNCTION public.community_echoes_zero_amens();
