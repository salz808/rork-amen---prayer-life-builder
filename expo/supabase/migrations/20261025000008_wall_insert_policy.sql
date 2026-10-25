-- Audit round 2, lane 2, BLOCKER B1: the public-wall INSERT policy was
-- WITH CHECK (true).
--
-- Anonymous Supabase users hold the `authenticated` role, so despite the
-- client's anonymous-posting guard, anyone with a minted anonymous session
-- could post to the 13+ feed through the API directly — bypassing the age
-- gate entirely. The open policy also permitted impersonation (any
-- user_id, no FK, nothing overriding it), which in turn lets an attacker
-- spam a victim's bell by posting as them and amening.
--
-- Rewrite mirrors the testimony policy (20260825000000), which already
-- does this correctly: the row's user_id must be the caller, and the
-- caller must not be anonymous. The client insert (createCommunityEcho)
-- already sets user_id to the non-anonymous session user, so no client
-- change is needed. Attestation itself is NOT enforced here on purpose:
-- it is self-declared (a policy check would add failure modes for users
-- whose best-effort record write failed offline, without adding real age
-- assurance); attestation is enforced by the client gates (auth screen,
-- startup gate, wall-write gate) and recorded server-side as the audit
-- trail.
DROP POLICY IF EXISTS "Users can create community echoes" ON public.community_echoes;
CREATE POLICY "Users can create community echoes"
  ON public.community_echoes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );
