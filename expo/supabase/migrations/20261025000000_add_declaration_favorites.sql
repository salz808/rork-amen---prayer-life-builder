-- Declaration favorites synced across devices.
--
-- Favorites previously lived only in local app state, so signing out (which
-- must clear local data) or switching phones emptied them silently. This
-- table gives them a cloud home keyed by (user, declaration id).

CREATE TABLE IF NOT EXISTS public.declaration_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  declaration_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, declaration_id)
);

ALTER TABLE public.declaration_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own declaration favorites"
  ON public.declaration_favorites FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own declaration favorites"
  ON public.declaration_favorites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own declaration favorites"
  ON public.declaration_favorites FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
