/*
  # Prayer Wall Moderation — Report & Block (App Store Guideline 1.2)

  ## Overview
  Adds user-generated-content moderation to the community prayer wall:
  - `echo_reports`: users can report a request they find offensive.
    Reporting also hides the author's requests from the reporter.
  - `echo_mutes`: users can block an author ("hide requests from this person").
    Muted requests are filtered client-side after fetch (a NULL user_id must
    never be dropped by a NOT IN filter, so exclusion happens in the app).

  ## Review access
  Moderators can read all reports with the service role key; users only ever
  see their own reports and mutes via RLS.

  ## Security
  - Insert-only for reports and mutes, scoped to auth.uid().
  - Delete only your own mute rows (unblock).
  - SECURITY DEFINER RPCs (empty search_path, schema-qualified) handle the
    report + hide pair atomically. Anonymous sessions may report/mute; fully
    signed-out visitors cannot.
*/

-- Reports: one per echo per reporter (idempotent re-reports).
CREATE TABLE IF NOT EXISTS echo_reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  echo_id uuid NOT NULL REFERENCES community_echoes(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(echo_id, reporter_id)
);

-- Mutes: block an author's requests from your wall.
CREATE TABLE IF NOT EXISTS echo_mutes (
  user_id uuid NOT NULL,
  muted_user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, muted_user_id)
);

CREATE INDEX IF NOT EXISTS idx_echo_reports_echo ON echo_reports(echo_id);
CREATE INDEX IF NOT EXISTS idx_echo_mutes_user ON echo_mutes(user_id);

ALTER TABLE echo_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE echo_mutes ENABLE ROW LEVEL SECURITY;

-- Reports: insert your own, read your own.
CREATE POLICY "Users can file reports"
  ON echo_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view own reports"
  ON echo_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

-- Mutes: manage your own block list.
CREATE POLICY "Users can view own mutes"
  ON echo_mutes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mute authors"
  ON echo_mutes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND muted_user_id <> auth.uid());

CREATE POLICY "Users can unmute authors"
  ON echo_mutes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Report a request: files the report AND mutes the author in one transaction,
-- so the offensive request disappears from the reporter's wall immediately.
CREATE OR REPLACE FUNCTION report_community_echo(p_echo_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_author uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT user_id INTO v_author
  FROM public.community_echoes
  WHERE id = p_echo_id;

  IF v_author IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.community_echoes WHERE id = p_echo_id
  ) THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  INSERT INTO public.echo_reports (echo_id, reporter_id, reason)
  VALUES (p_echo_id, auth.uid(), NULLIF(p_reason, ''))
  ON CONFLICT (echo_id, reporter_id) DO NOTHING;

  -- Hide the author going forward (their seeded/anonymous posts may have no author).
  IF v_author IS NOT NULL AND v_author <> auth.uid() THEN
    INSERT INTO public.echo_mutes (user_id, muted_user_id)
    VALUES (auth.uid(), v_author)
    ON CONFLICT (user_id, muted_user_id) DO NOTHING;
  END IF;
END;
$$;

-- Unblock an author.
CREATE OR REPLACE FUNCTION unmute_community_echo_author(p_muted_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.echo_mutes
  WHERE user_id = auth.uid() AND muted_user_id = p_muted_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION report_community_echo(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION unmute_community_echo_author(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION report_community_echo(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION unmute_community_echo_author(uuid) TO authenticated;
