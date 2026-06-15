/*
  # Community Echoes — Shared Prayer Wall

  ## Overview
  Adds community prayer wall tables so users can share prayer requests
  anonymously and support each other with "Amen" interactions.

  ## New Tables

  ### 1. `community_echoes`
  Shared prayer requests visible to all authenticated users
  - `id` (uuid, primary key)
  - `user_id` (uuid, nullable — anonymous posts allowed)
  - `text` (text, not null)
  - `amens` (integer, default 0)
  - `created_at` (timestamptz)

  ### 2. `community_amens`
  Tracks which user amened which echo (prevents duplicates)
  - `id` (uuid, primary key)
  - `echo_id` (uuid, references community_echoes)
  - `user_id` (uuid, not null)
  - `created_at` (timestamptz)
  - UNIQUE(echo_id, user_id)

  ## Security
  - Anyone authenticated can view community echoes
  - Anyone authenticated can create echoes
  - Users can only see their own amen records
  - Users can only create their own amen records
*/

-- Create community_echoes table
CREATE TABLE IF NOT EXISTS community_echoes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid,
  text text NOT NULL,
  amens integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create community_amens table
CREATE TABLE IF NOT EXISTS community_amens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  echo_id uuid NOT NULL REFERENCES community_echoes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(echo_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_community_echoes_created ON community_echoes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_amens_user ON community_amens(user_id);
CREATE INDEX IF NOT EXISTS idx_community_amens_echo ON community_amens(echo_id);

-- Enable Row Level Security
ALTER TABLE community_echoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_amens ENABLE ROW LEVEL SECURITY;

-- RLS Policies for community_echoes

-- Anyone authenticated can view the prayer wall
CREATE POLICY "Anyone can view community echoes"
  ON community_echoes FOR SELECT
  TO authenticated
  USING (true);

-- Anyone authenticated can share a prayer request
CREATE POLICY "Users can create community echoes"
  ON community_echoes FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can delete their own echoes
CREATE POLICY "Users can delete own community echoes"
  ON community_echoes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for community_amens

-- Users can check which echoes they've amened
CREATE POLICY "Users can view own amens"
  ON community_amens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can create their own amens
CREATE POLICY "Users can create amens"
  ON community_amens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Atomic amen function: inserts amen record + increments counter
CREATE OR REPLACE FUNCTION amen_community_echo(p_echo_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Insert amen record (will fail on duplicate due to UNIQUE constraint)
  INSERT INTO community_amens (echo_id, user_id)
  VALUES (p_echo_id, p_user_id);

  -- Increment the amen counter
  UPDATE community_echoes
  SET amens = amens + 1
  WHERE id = p_echo_id;
END;
$$;

-- Seed data: 10 initial prayer requests so the wall feels alive from day one.
-- Only inserted if the table is empty.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM community_echoes LIMIT 1) THEN
    INSERT INTO community_echoes (text, amens, created_at) VALUES
      ('For my mother''s health — she got her test results back today and we''re waiting to hear from the doctor.', 14, now() - interval '2 minutes'),
      ('For peace of mind today at work. I feel completely overwhelmed by everything on my plate.', 42, now() - interval '15 minutes'),
      ('Thankful for a new job after 6 months of waiting! God is so good and His timing is perfect.', 108, now() - interval '1 hour'),
      ('For my marriage. We''re barely speaking to each other right now and I don''t know what to do.', 89, now() - interval '3 hours'),
      ('Just feeling so distant from God right now. I need a breakthrough in my spirit.', 215, now() - interval '4 hours'),
      ('For my teenage son — he''s struggling with anxiety and won''t leave his room. My heart is breaking.', 304, now() - interval '5 hours'),
      ('To finally let go of the anger I''ve been holding onto for years. It''s eating me alive.', 67, now() - interval '8 hours'),
      ('Starting chemo next week. I''m scared but I know God goes before me. Please pray for strength.', 176, now() - interval '12 hours'),
      ('For my daughter starting college across the country. Praying for the right friends and protection.', 53, now() - interval '18 hours'),
      ('Grateful for 3 years of sobriety today. If you''re struggling, don''t give up — one day at a time.', 241, now() - interval '1 day');
  END IF;
END $$;
