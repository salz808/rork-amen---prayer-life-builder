-- Audit must-fixes #4, #9, #5, #2 (2026-10-24), all on public.profiles.
--
-- #4 Monastic soundscape: the original CHECK allowed only three
-- soundscapes, but the app ships a fourth ('monastic'). Every sync for a
-- Monastic user raised a CHECK violation that syncAppState swallowed
-- silently, so the preference reverted on reinstall/re-login.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_soundscape_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_soundscape_check
  CHECK (soundscape IN ('throughTheDoor', 'firstLight', 'reunion', 'monastic'));

-- #9 first_name default: first_name is NOT NULL with no default, which
-- blocks bare profile upserts (the wall-toggle fix and the age-attestation
-- write both upsert a row carrying only id + one flag column).
ALTER TABLE public.profiles ALTER COLUMN first_name SET DEFAULT '';

-- #5 age attestation: 13+ attestation timestamp for the pre-sign-up age
-- gate. NULL means never attested (legacy rows); the auth screen records
-- it on first account-creating sign-in after this migration lands.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age_attested_at timestamptz;

-- #2 RevenueCat opaque alias: the app used the Supabase user id as the
-- RevenueCat app user id, but that id is published on the public wall, so
-- anyone could claim another subscriber's entitlements. The alias is a
-- random id that no public query ever selects; the webhook resolves it
-- back to the real user id server-side.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rc_alias_id uuid DEFAULT gen_random_uuid();
UPDATE public.profiles SET rc_alias_id = gen_random_uuid() WHERE rc_alias_id IS NULL;
ALTER TABLE public.profiles ALTER COLUMN rc_alias_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_rc_alias_id ON public.profiles (rc_alias_id);
