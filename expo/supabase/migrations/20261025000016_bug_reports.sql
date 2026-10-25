/*
  # Bug reports (build 7)

  User-submitted bug reports from the in-app "Report a problem" form
  (Settings -> Support & Account -> Report a problem).

  ## Table `bug_reports`
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, references auth.users, cascade on delete)
  - `description` (text, not null, max 2000 chars, blank rejected)
  - `app_version`, `build_number`, `platform`, `os_version` (text, nullable
    diagnostics — version/device/OS only)
  - `created_at` (timestamptz)

  ## Privacy
  The form collects a description + version/device/OS diagnostics and
  nothing else: never prayer text, journal content, message content, or
  wall post content. Reports are private by construction — see RLS below.

  ## Security
  - RLS enabled. Exactly ONE client policy: INSERT for non-anonymous
    authenticated users where `auth.uid() = user_id`. The anonymous
    guard matters even though reports are never readable client-side:
    anonymous sessions are free, so without it the per-user daily cap
    would be unbounded in aggregate (one fresh session per 5 reports).
    There are deliberately NO client SELECT / UPDATE / DELETE policies:
    triage happens via the Supabase dashboard (service role), so no
    client can read anyone else's reports — including, by design, their
    own. Guests (no session) and anonymous sessions never reach the
    form — the screen shows a sign-in prompt instead of minting a
    session for them.
  - Server-side rate limit: at most 5 reports per user per UTC day,
    enforced by a BEFORE INSERT trigger. Best-effort vs races (same
    documented caveat as the wall daily limit): two concurrent inserts
    can slip one extra report past the check; the cap still holds for
    all sequential abuse, which is the realistic flood shape.
  - The trigger function is SECURITY DEFINER (round-4 MOD-5 lesson):
    with no client SELECT policy, a non-DEFINER trigger's count query
    would see zero rows and the limit would silently never fire.
*/

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description text NOT NULL
    CHECK (char_length(description) <= 2000)
    CHECK (btrim(description) <> ''),
  app_version text,
  build_number text,
  platform text,
  os_version text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_user_created
  ON public.bug_reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created
  ON public.bug_reports (created_at DESC);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can submit own bug reports"
  ON public.bug_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND NOT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false));

CREATE OR REPLACE FUNCTION public.enforce_bug_report_daily_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  day_start timestamptz := (date_trunc('day', (now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC');
  report_count integer;
BEGIN
  SELECT count(*) INTO report_count
  FROM public.bug_reports
  WHERE user_id = NEW.user_id
    AND created_at >= day_start;
  IF report_count >= 5 THEN
    RAISE EXCEPTION 'BUG_REPORT_DAILY_LIMIT: one user may submit at most 5 bug reports per day';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_bug_report_daily_limit ON public.bug_reports;
CREATE TRIGGER enforce_bug_report_daily_limit
  BEFORE INSERT ON public.bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_bug_report_daily_limit();
