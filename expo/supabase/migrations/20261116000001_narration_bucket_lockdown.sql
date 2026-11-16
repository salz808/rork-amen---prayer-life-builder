-- =====================================================================
-- P0-3 — Narration bucket lockdown (2026-11-16)
--
-- VERIFIED BEFORE WRITING (repo HEAD 9bdf33d):
--   * The `narration` bucket is referenced by client code but DEFINED
--     NOWHERE in the repo: no `storage.buckets` INSERT and no
--     `storage.objects` policy exists in any migration under
--     expo/supabase/migrations/ or in backend/ (grep: `storage.buckets`
--     / `narration` over both trees returns only the client read path
--     and TTS-proxy comments). The bucket therefore exists, if at all,
--     only as an out-of-band dashboard creation with unknown policies.
--   * The only client use is a public-URL read:
--     expo/services/narration.ts:29 (`NARRATION_BUCKET = 'narration'`)
--     and :43 (`supabase.storage.from(NARRATION_BUCKET).getPublicUrl`).
--     No client code uploads to this bucket: narration files are baked
--     ahead of time (tools/narration/) and uploaded via the Supabase
--     dashboard / service role (e.g. the 2026-11-14 242-file voice
--     re-bake zip). So zero client write access is correct, not a
--     behavior change.
--   * Fixed set for the TTS-proxy gate lives in
--     expo/services/narrationIndex.ts (BAKED_BY_HASH, sha256 of
--     `voice|speed|text` -> Storage path); this migration only defines
--     the bucket those paths live in.
--
-- WHAT THIS DOES:
--   1. Defines the bucket in storage.buckets (public read, 10 MiB
--      file cap, audio MIME allowlist).
--   2. One SELECT policy for anon + authenticated (public read).
--   3. Separate INSERT / UPDATE / DELETE policies per operation
--      (NOT a single FOR ALL policy), each permitting nothing for
--      client roles. NOTE on Postgres semantics, stated honestly: a
--      USING (false) / WITH CHECK (false) policy permits nothing by
--      itself; the actual lock is the ABSENCE of any permissive policy
--      for those operations (RLS default-deny). The deny policies
--      exist so the intent is explicit and auditable, and so a future
--      permissive policy would have to be added deliberately.
--      Uploads continue via service_role / the dashboard, which
--      bypass RLS.
--
-- FILE SIZE LIMIT: 10 MiB (10485760 bytes). Largest file in the
-- committed bake manifest (tools/narration/manifest.json) is a Selah
-- loop at 1,720,173 bytes and the largest single unit is 1,007,653
-- bytes, so 10 MiB is ~6x headroom over anything the pipeline
-- produces today.
--
-- DEPLOY: staging first, then live. Re-runnable (ON CONFLICT upsert
-- + DROP POLICY IF EXISTS before each CREATE POLICY).
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'narration',
  'narration',
  true,
  10485760,
  ARRAY['audio/mpeg', 'audio/mp4', 'audio/wav']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Public read (the only client access the app needs) ───────────────

DROP POLICY IF EXISTS "Narration audio is publicly readable" ON storage.objects;
CREATE POLICY "Narration audio is publicly readable"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'narration');

-- ── Zero client writes, one policy per operation (never FOR ALL) ──────

DROP POLICY IF EXISTS "Narration audio cannot be uploaded by clients" ON storage.objects;
CREATE POLICY "Narration audio cannot be uploaded by clients"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "Narration audio cannot be modified by clients" ON storage.objects;
CREATE POLICY "Narration audio cannot be modified by clients"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "Narration audio cannot be deleted by clients" ON storage.objects;
CREATE POLICY "Narration audio cannot be deleted by clients"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (false);

-- STAGING TESTS (anon key only, no auth):
--   1. SELECT the bucket row: `SELECT * FROM storage.buckets WHERE
--      id = 'narration'` -> public=true, file_size_limit=10485760,
--      allowed_mime_types={audio/mpeg,audio/mp4,audio/wav}.
--   2. Public read works: GET a known baked file's public URL
--      (e.g. foundations/d01/voiceover/settle.mp3) with no auth ->
--      200 + audio bytes.
--   3. Client-role upload fails: POST a file to the bucket with the
--      anon key -> 403 / RLS violation (no permissive INSERT policy).
--   4. Client-role UPDATE/DELETE on an existing object with the anon
--      key -> 403 / RLS violation.
--   5. Service-role upload still works (dashboard / service key) ->
--      proves the lock binds client roles only.
--   6. Re-run this migration file -> no error (idempotent).
