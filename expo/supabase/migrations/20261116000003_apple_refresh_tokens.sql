-- =====================================================================
-- apple_refresh_tokens: server-side Apple refresh-token storage
-- (P0-5, Guideline 5.1.1(v), 2026-11-16)
--
-- Native Sign in with Apple returns a single-use authorization code.
-- The `store-apple-token` edge function exchanges it for a refresh
-- token and stores it here; at account deletion, `delete-account`
-- revokes the stored token at Apple (auth/revoke) and drops the row,
-- so the Apple authorization is fully disconnected.
--
-- STAGED, NOT APPLIED: apply to STAGING first, then live (same
-- staging-first rule as every migration). Deploy order: this
-- migration, then the Apple secrets in the Supabase dashboard
-- (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_P8,
-- APPLE_CLIENT_ID), then the `store-apple-token` function.
--
-- SECURITY: service-role only. No client policy exists on purpose —
-- the anon/authenticated roles are explicitly revoked below, so the
-- token is reachable only through the admin client inside edge
-- functions. The table is keyed by user_id with ON DELETE CASCADE, so
-- a hard auth delete removes the row even if the function-side delete
-- is skipped.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.apple_refresh_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.apple_refresh_tokens ENABLE ROW LEVEL SECURITY;

-- No client access: edge functions use the service-role admin client.
REVOKE ALL ON public.apple_refresh_tokens FROM anon, authenticated;
