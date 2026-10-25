/*
  # Prayer notifications — "someone prayed for you" bell (in-app, no push)

  ## Overview
  When someone taps Amen on a public Prayer Wall request, the author is
  NOT notified today: the amen RPC only inserts a row and bumps a counter.
  This migration adds the server side of the in-app bell:

  - `prayer_notifications`: one row per author, per request, per milestone.
    Milestones are 1, 5, 10, 25, 50, 100 amens — the author is never
    pinged for every single amen, and a viral request cannot spam them.
  - The amen RPC writes the row when the new count lands exactly on a
    milestone. It deliberately stores NO pray-er identity: the
    notification carries only the request and the milestone, so the wall
    stays anonymous ("someone prayed for you", never who).
  - `profiles.wall_prayer_notifications`: the Settings toggle. Default
    true; when false, the RPC writes nothing for that author. A missing
    profile row also defaults to true (anonymous wall users have no
    profile row yet), so the toggle can only silence, never invent, a
    notification.

  ## What this is NOT
  This is not push. No push token, no APNs capability, no edge function
  sending messages is involved. The bell is discovered the next time the
  app opens (focus refetch + a realtime INSERT subscription on this
  table for the signed-in author). Nothing here wakes a closed app.

  ## Deployment note
  Written, not deployed: applying it needs Supabase access Stitch does
  not hold (console masked, no token). The client code that reads this
  table degrades silently to "no notifications" until the migration lands.
*/

-- ── Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prayer_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), -- was uuid_generate_v4(): uuid-ossp not enabled on this project; gen_random_uuid() is built-in
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  echo_id uuid NOT NULL REFERENCES public.community_echoes(id) ON DELETE CASCADE,
  milestone integer NOT NULL CHECK (milestone IN (1, 5, 10, 25, 50, 100)),
  created_at timestamptz DEFAULT now(),
  seen_at timestamptz,
  UNIQUE(recipient_id, echo_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_prayer_notifications_recipient
  ON public.prayer_notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prayer_notifications_echo
  ON public.prayer_notifications(echo_id);

-- ── Row Level Security: an author sees only their own rows ────────────────

ALTER TABLE public.prayer_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own prayer notifications"
  ON public.prayer_notifications;
CREATE POLICY "Users can view own prayer notifications"
  ON public.prayer_notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users can mark own prayer notifications seen"
  ON public.prayer_notifications;
CREATE POLICY "Users can mark own prayer notifications seen"
  ON public.prayer_notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- No INSERT or DELETE policy for clients: only the SECURITY DEFINER amen
-- function below writes rows, and rows die with their echo (CASCADE).

-- ── Settings toggle column ─────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wall_prayer_notifications boolean DEFAULT true;

-- ── Amen RPC: same as the circles version, plus milestone notification ────

DROP FUNCTION IF EXISTS public.amen_community_echo(uuid);

CREATE OR REPLACE FUNCTION public.amen_community_echo(p_echo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  v_circle_id uuid;
  v_author_id uuid;
  v_new_count integer;
  v_notify boolean;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT circle_id INTO v_circle_id
  FROM public.community_echoes
  WHERE id = p_echo_id;

  IF v_circle_id IS NULL THEN
    NULL; -- public echo, any authenticated user may amen
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = v_circle_id AND user_id = caller_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this circle' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.community_amens (echo_id, user_id)
  VALUES (p_echo_id, caller_id);

  UPDATE public.community_echoes
  SET amens = public.community_echoes.amens + 1
  WHERE public.community_echoes.id = p_echo_id
  RETURNING public.community_echoes.amens, public.community_echoes.user_id
  INTO v_new_count, v_author_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prayer request not found' USING ERRCODE = 'P0002';
  END IF;

  -- Milestone notification: only for a real author, never for amening
  -- your own request, only on an exact milestone, only if the author
  -- has not turned these off. The UNIQUE constraint + ON CONFLICT guard
  -- make a double-write impossible even under concurrent amens.
  IF v_author_id IS NOT NULL
    AND v_author_id <> caller_id
    AND v_new_count IN (1, 5, 10, 25, 50, 100)
  THEN
    SELECT COALESCE(
      (SELECT wall_prayer_notifications FROM public.profiles WHERE id = v_author_id),
      true
    ) INTO v_notify;

    IF v_notify THEN
      INSERT INTO public.prayer_notifications (recipient_id, echo_id, milestone)
      VALUES (v_author_id, p_echo_id, v_new_count)
      ON CONFLICT (recipient_id, echo_id, milestone) DO NOTHING;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.amen_community_echo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.amen_community_echo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.amen_community_echo(uuid) TO authenticated;
