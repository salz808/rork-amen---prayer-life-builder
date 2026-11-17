-- =====================================================================
-- 20261117000000 — Wall Terms acceptances, server-side (D2, 2026-11-17)
-- ChatGPT second-opinion audit finding D2: lib/wallTerms.ts records
-- Wall Terms acceptance as a single AsyncStorage flag
-- 'triad_wall_terms_accepted_v1' — device-scoped, no identity,
-- timestamp, or version. There is no server record of who accepted
-- which version of the Wall Terms, or when.
--
-- WHAT THIS DOES:
--   §1  Table public.wall_terms_acceptances (user_id, version,
--       accepted_at), PRIMARY KEY (user_id, version) — one row per
--       user per terms version. RLS enabled; own-row INSERT and
--       SELECT policies only, TO authenticated. No UPDATE/DELETE
--       policies: acceptances are append-only history (a re-accept
--       of the same version is a no-op, not an overwrite).
--   §2  SECURITY DEFINER RPC record_wall_terms_acceptance(p_version
--       text) RETURNS void: inserts (auth.uid(), p_version, now())
--       ON CONFLICT DO NOTHING (idempotent re-record). Raises if
--       p_version is null/empty or auth.uid() is null. Granted to
--       authenticated only (REVOKE ALL FROM PUBLIC, anon).
--
-- RELEASE CONDITION — safe to apply independently: the client calls
--   this RPC best-effort and degrades gracefully if the function is
--   missing (the device-local AsyncStorage flag remains the gate
--   until the server record exists). No client reorder or other
--   migration is a prerequisite. Staging first, then live.
--
-- ANONYMOUS-ROLE STAGING CHECK (do this FIRST on staging):
--   Supabase anonymous users are expected to carry the `authenticated`
--   role (the amen RPC itself is granted only to `authenticated` yet
--   accepts anonymous callers, per 00013's header) — but CONFIRM the
--   anon JWT role claim on staging. If staging shows anonymous
--   callers arriving as role `anon`, extend the grant in the same
--   staging run (GRANT EXECUTE ... TO anon) — otherwise anonymous
--   users could never record, and their acceptances would stay
--   device-local only.
--
-- CURRENT TERMS VERSION: 'v1' (matches the existing
--   'triad_wall_terms_accepted_v1' flag in lib/wallTerms.ts). A
--   future terms revision bumps the version string; old-version
--   rows stay as history and the client re-prompts for the new
--   version.
--
-- DEPLOY: staging first, then live. Re-runnable (CREATE TABLE IF
--   NOT EXISTS / CREATE OR REPLACE + DROP POLICY IF EXISTS).
-- =====================================================================

-- ── §1 — wall_terms_acceptances table ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wall_terms_acceptances (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, version)
);

ALTER TABLE public.wall_terms_acceptances ENABLE ROW LEVEL SECURITY;

-- Own-row only: a caller can record and read only their own
-- acceptances. No UPDATE/DELETE policies — acceptances are
-- append-only; re-accepting the same version is a no-op via the
-- RPC's ON CONFLICT DO NOTHING.
DROP POLICY IF EXISTS "wall_terms_acceptances_insert_own" ON public.wall_terms_acceptances;
CREATE POLICY "wall_terms_acceptances_insert_own"
  ON public.wall_terms_acceptances FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "wall_terms_acceptances_select_own" ON public.wall_terms_acceptances;
CREATE POLICY "wall_terms_acceptances_select_own"
  ON public.wall_terms_acceptances FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ── §2 — record_wall_terms_acceptance RPC ─────────────────────────────

CREATE OR REPLACE FUNCTION public.record_wall_terms_acceptance(p_version text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_version IS NULL OR btrim(p_version) = '' THEN
    RAISE EXCEPTION 'Terms version is required' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.wall_terms_acceptances (user_id, version, accepted_at)
  VALUES (v_caller, p_version, now())
  ON CONFLICT (user_id, version) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.record_wall_terms_acceptance(text) IS
  'D2 (2026-11-17): server-side record of Wall Terms acceptance. Idempotent per (user, version); actor is auth.uid() — never a parameter. Current terms version is v1.';

REVOKE ALL ON FUNCTION public.record_wall_terms_acceptance(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_wall_terms_acceptance(text) TO authenticated;

-- STAGING TESTS:
--   §1a Authenticated caller: record_wall_terms_acceptance('v1')
--       -> void; row appears in wall_terms_acceptances
--       (user_id = caller, version = 'v1', accepted_at ≈ now()).
--   §1b Same caller, same version again -> void, still exactly
--       ONE row (ON CONFLICT DO NOTHING — idempotent re-record).
--   §1c Same caller, different version ('v2') -> second row; the
--       'v1' row is untouched (per-version history).
--   §1d A DIFFERENT authenticated caller SELECTs from
--       wall_terms_acceptances -> sees only their own rows (the
--       first caller's rows are invisible — own-row policy).
--   §1e record_wall_terms_acceptance(NULL) and ('') -> rejected
--       ('Terms version is required'); no row written.
--   §1f Unauthenticated caller -> permission denied (no grant),
--       not a silent no-op.
--   §1g Anonymous-role check (FIRST): confirm the anon JWT role
--       claim on staging — anonymous callers must arrive as role
--       `authenticated`. If staging shows role `anon`, extend the
--       grant in the same staging run (see header).
--   §1h Direct UPDATE/DELETE on own row as authenticated ->
--       permission denied (no policies; append-only).
