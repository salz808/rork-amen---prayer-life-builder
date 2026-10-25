-- Audit round 4, lane 2 (auth/session + age gate) — 2026-10-25.
--
-- AUTH-2: age attestation has no server enforcement, and the record itself
-- was self-writable through the unrestricted profiles UPDATE policy.
--   1. record_age_attestation(): caller-only SECURITY DEFINER RPC (the
--      get_my_rc_alias pattern from 20261025000007). It sets
--      age_attested_at = now() for auth.uid() only, creating the profile
--      row if needed (first_name already defaults to '' since 00004).
--   2. Column revokes: direct INSERT/UPDATE of age_attested_at are revoked
--      from authenticated/anon. Client upserts that do not touch the column
--      (upsertProfile, wall toggle, alias minting) are unaffected.
--   3. Belt-and-braces trigger: the column may change only inside the RPC
--      (signalled by a transaction-local setting the RPC sets) or by a
--      role that bypasses grants (service role / table owner). A future
--      grant change alone cannot silently reopen self-writes.
--   4. RESTRICTIVE wall INSERT policies: age_attested_at IS NOT NULL is
--      now required for echoes AND testimonies. RESTRICTIVE (not
--      permissive) on purpose: it ANDs with whatever permissive policy
--      lane 1's 00011 creates for echoes, so this migration composes with
--      00011 regardless of the policy name lane 1 chooses, and it does not
--      need to drop/recreate lane 1's policy. Honest ceiling, stated
--      plainly: attestation is self-declared and can never prove age.
--      These steps make the record honest (set only via a modal confirm)
--      and enforced, not verified. Never describe it as age verification.
--
-- AUTH-4 (decision default, Kai may overrule): the amen RPC accepts
-- anonymous callers, so minted anonymous identities can trigger milestone
-- bell rows to real authors. Anonymous amens are NOT rejected outright
-- (that stricter option stays Kai's call). Instead, without touching the
-- amen RPC itself (lane 1 owns its MOD-8 edit, so this migration must not
-- redefine it):
--   * a BEFORE INSERT trigger on prayer_notifications silently drops bell
--     rows written by an anonymous caller (the RPC is the only writer);
--   * community_amens gains is_anonymous_amen, stamped from the caller's
--     JWT claim by a BEFORE INSERT trigger (callers cannot lie about it),
--     with a cap of 10 anonymous amens per echo — the 11th anonymous amen
--     for an echo is rejected, counter and bell untouched.
--   Pre-existing anonymous amen rows are unstamped (default false) and do
--   not count toward the cap; the cap binds going forward.
--
-- Deploy order: this migration must land together with (or after) the
-- client changes that point recordAgeAttestation at the RPC. Until then,
-- direct client writes to the column are revoked — that is the point —
-- so do not deploy this ahead of build 7's client.

-- ---------------------------------------------------------------- AUTH-2

CREATE OR REPLACE FUNCTION public.record_age_attestation()
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
  -- Transaction-local marker the trigger guard below recognises. It
  -- lives only for this transaction, so no other write can reuse it.
  PERFORM pg_catalog.set_config('triad.age_attestation_via_rpc', '1', true);
  INSERT INTO public.profiles (id, age_attested_at)
  VALUES (caller_id, now())
  ON CONFLICT (id) DO UPDATE SET age_attested_at = EXCLUDED.age_attested_at;
END;
$$;

REVOKE ALL ON FUNCTION public.record_age_attestation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_age_attestation() FROM anon;
GRANT EXECUTE ON FUNCTION public.record_age_attestation() TO authenticated;

-- Trigger guard: age_attested_at may change only via the RPC above
-- (marker set) or by a grant-bypassing role. Direct PostgREST writes are
-- already blocked by the column revokes below; this is defense in depth
-- against a future grant change. NOTE: this function is deliberately NOT
-- SECURITY DEFINER — a definer trigger would run as the table owner and
-- its current_user check would pass for everyone. As a plain function,
-- current_user is the caller's role (authenticated / service_role), or
-- the function owner when fired from inside the SECURITY DEFINER RPC
-- (which also sets the marker, so it passes on that ground instead).
CREATE OR REPLACE FUNCTION public.guard_profiles_age_attestation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.current_setting('triad.age_attestation_via_rpc', true) = '1' THEN
    RETURN NEW;
  END IF;
  -- Roles that bypass column grants (service role, table owner) are the
  -- only other legitimate writers; everyone else is stopped here even if
  -- a grant is ever re-added by mistake.
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.age_attested_at IS NOT NULL THEN
      RAISE EXCEPTION 'age_attested_at may only be set via record_age_attestation' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.age_attested_at IS DISTINCT FROM OLD.age_attested_at THEN
      RAISE EXCEPTION 'age_attested_at may only be set via record_age_attestation' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_age_attestation ON public.profiles;
CREATE TRIGGER trg_guard_profiles_age_attestation
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_age_attestation();

REVOKE INSERT (age_attested_at) ON public.profiles FROM authenticated, anon;
REVOKE UPDATE (age_attested_at) ON public.profiles FROM authenticated, anon;

-- RESTRICTIVE wall INSERT policies (see header: they compose with, and
-- never replace, lane 1's permissive policies).
DROP POLICY IF EXISTS "Age attestation required for echoes" ON public.community_echoes;
CREATE POLICY "Age attestation required for echoes"
  ON public.community_echoes FOR INSERT
  TO authenticated
  AS RESTRICTIVE
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.age_attested_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Age attestation required for testimonies" ON public.community_testimonies;
CREATE POLICY "Age attestation required for testimonies"
  ON public.community_testimonies FOR INSERT
  TO authenticated
  AS RESTRICTIVE
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.age_attested_at IS NOT NULL
    )
  );

-- ---------------------------------------------------------------- AUTH-4

ALTER TABLE public.community_amens
  ADD COLUMN IF NOT EXISTS is_anonymous_amen boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_community_amens_anon_cap
  ON public.community_amens (echo_id)
  WHERE is_anonymous_amen;

-- Stamp anonymity from the JWT claim (never from caller-supplied input)
-- and cap anonymous amens per echo at 10.
CREATE OR REPLACE FUNCTION public.guard_community_amen_anon()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_is_anon boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  v_anon_count integer;
BEGIN
  NEW.is_anonymous_amen := v_is_anon;
  IF v_is_anon THEN
    SELECT count(*) INTO v_anon_count
    FROM public.community_amens
    WHERE echo_id = NEW.echo_id AND is_anonymous_amen;
    IF v_anon_count >= 10 THEN
      RAISE EXCEPTION 'Anonymous amen cap reached for this request' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_community_amen_anon ON public.community_amens;
CREATE TRIGGER trg_guard_community_amen_anon
BEFORE INSERT ON public.community_amens
FOR EACH ROW EXECUTE FUNCTION public.guard_community_amen_anon();

-- Bell rows are written only by the amen RPC, on behalf of the amen-er.
-- An anonymous amen-er must never produce a bell row for a real author:
-- silently drop the row (raising here would roll back the whole amen).
CREATE OR REPLACE FUNCTION public.suppress_anon_amen_bell()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suppress_anon_amen_bell ON public.prayer_notifications;
CREATE TRIGGER trg_suppress_anon_amen_bell
BEFORE INSERT ON public.prayer_notifications
FOR EACH ROW EXECUTE FUNCTION public.suppress_anon_amen_bell();
