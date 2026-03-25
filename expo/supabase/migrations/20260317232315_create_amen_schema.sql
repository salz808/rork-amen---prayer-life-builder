/*
  # Amen Prayer App Database Schema

  ## Overview
  Complete schema for the Amen 30-day prayer journey app with user profiles, progress tracking,
  reflections, prayer requests, and answered prayers.

  ## New Tables Created

  ### 1. `profiles`
  User profile and preferences
  - `id` (uuid, references auth.users)
  - `first_name` (text)
  - `prayer_life` (text) - 'new', 'inconsistent', or 'growing'
  - `reminder_time` (time)
  - `onboarding_complete` (boolean)
  - `blocker` (integer)
  - `dark_mode` (boolean)
  - `font_size` (text) - 'normal' or 'large'
  - `ambient_muted` (boolean)
  - `soundscape` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. `day_progress`
  Daily prayer session completion tracking
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles)
  - `day` (integer, 1-30)
  - `completed` (boolean)
  - `completed_at` (timestamptz)
  - `duration` (integer, seconds)
  - `journey_pass` (integer) - allows multiple 30-day journeys
  - `created_at` (timestamptz)

  ### 3. `weekly_reflections`
  End-of-week reflection responses
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles)
  - `week` (integer, 1-4)
  - `journey_pass` (integer)
  - `question_1` (text)
  - `question_2` (text)
  - `question_3` (text)
  - `created_at` (timestamptz)

  ### 4. `prayer_requests`
  User prayer requests and tracking
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles)
  - `text` (text)
  - `is_answered` (boolean)
  - `answer` (text)
  - `answered_at` (timestamptz)
  - `created_at` (timestamptz)

  ### 5. `answered_prayers`
  Archive of answered prayers with testimony
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles)
  - `request` (text)
  - `answer` (text)
  - `shared` (boolean)
  - `created_at` (timestamptz)

  ### 6. `journey_stats`
  Journey-level statistics and tracking
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles)
  - `journey_pass` (integer)
  - `current_day` (integer)
  - `streak_count` (integer)
  - `last_completed_date` (date)
  - `journey_complete` (boolean)
  - `last_opened_date` (date)
  - `open_streak_count` (integer)
  - `is_subscriber` (boolean)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 7. `phase_timings`
  User's time spent in each prayer phase
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles)
  - `phase_name` (text)
  - `total_seconds` (integer)
  - `updated_at` (timestamptz)

  ## Security
  - RLS enabled on all tables
  - Users can only access their own data
  - Authenticated users required for all operations
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  prayer_life text NOT NULL DEFAULT 'new' CHECK (prayer_life IN ('new', 'inconsistent', 'growing')),
  reminder_time time,
  onboarding_complete boolean DEFAULT false,
  blocker integer,
  dark_mode boolean DEFAULT false,
  font_size text DEFAULT 'normal' CHECK (font_size IN ('normal', 'large')),
  ambient_muted boolean DEFAULT false,
  soundscape text DEFAULT 'throughTheDoor' CHECK (soundscape IN ('throughTheDoor', 'firstLight', 'reunion')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create day_progress table
CREATE TABLE IF NOT EXISTS day_progress (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day integer NOT NULL CHECK (day >= 1 AND day <= 30),
  completed boolean DEFAULT false,
  completed_at timestamptz,
  duration integer DEFAULT 0,
  journey_pass integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, day, journey_pass)
);

-- Create weekly_reflections table
CREATE TABLE IF NOT EXISTS weekly_reflections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week integer NOT NULL CHECK (week >= 1 AND week <= 4),
  journey_pass integer DEFAULT 1,
  question_1 text DEFAULT '',
  question_2 text DEFAULT '',
  question_3 text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, week, journey_pass)
);

-- Create prayer_requests table
CREATE TABLE IF NOT EXISTS prayer_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text text NOT NULL,
  is_answered boolean DEFAULT false,
  answer text,
  answered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create answered_prayers table
CREATE TABLE IF NOT EXISTS answered_prayers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  request text NOT NULL,
  answer text NOT NULL,
  shared boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create journey_stats table
CREATE TABLE IF NOT EXISTS journey_stats (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  journey_pass integer DEFAULT 1,
  current_day integer DEFAULT 1 CHECK (current_day >= 1 AND current_day <= 30),
  streak_count integer DEFAULT 0,
  last_completed_date date,
  journey_complete boolean DEFAULT false,
  last_opened_date date,
  open_streak_count integer DEFAULT 0,
  is_subscriber boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, journey_pass)
);

-- Create phase_timings table
CREATE TABLE IF NOT EXISTS phase_timings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phase_name text NOT NULL,
  total_seconds integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, phase_name)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_day_progress_user_journey ON day_progress(user_id, journey_pass);
CREATE INDEX IF NOT EXISTS idx_day_progress_completed ON day_progress(user_id, completed);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_user ON prayer_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_answered ON prayer_requests(user_id, is_answered);
CREATE INDEX IF NOT EXISTS idx_journey_stats_user ON journey_stats(user_id, journey_pass);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE prayer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE answered_prayers ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_timings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- RLS Policies for day_progress
CREATE POLICY "Users can view own progress"
  ON day_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
  ON day_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
  ON day_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own progress"
  ON day_progress FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for weekly_reflections
CREATE POLICY "Users can view own reflections"
  ON weekly_reflections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reflections"
  ON weekly_reflections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reflections"
  ON weekly_reflections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for prayer_requests
CREATE POLICY "Users can view own prayer requests"
  ON prayer_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prayer requests"
  ON prayer_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prayer requests"
  ON prayer_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own prayer requests"
  ON prayer_requests FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for answered_prayers
CREATE POLICY "Users can view own answered prayers"
  ON answered_prayers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own answered prayers"
  ON answered_prayers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own answered prayers"
  ON answered_prayers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for journey_stats
CREATE POLICY "Users can view own journey stats"
  ON journey_stats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own journey stats"
  ON journey_stats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own journey stats"
  ON journey_stats FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for phase_timings
CREATE POLICY "Users can view own phase timings"
  ON phase_timings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own phase timings"
  ON phase_timings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own phase timings"
  ON phase_timings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_journey_stats_updated_at
  BEFORE UPDATE ON journey_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_phase_timings_updated_at
  BEFORE UPDATE ON phase_timings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();