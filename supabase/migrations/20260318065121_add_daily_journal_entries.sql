/*
  # Add Daily Journal Entries Table

  ## Overview
  Creates a table to store daily journal entries that users can write after completing each day's devotional.

  ## New Tables Created

  ### 1. `daily_journal_entries`
  User's daily journal entries tied to specific days
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles)
  - `day` (integer, 1-30) - The day this entry is associated with
  - `journey_pass` (integer) - Which journey iteration this belongs to
  - `entry_text` (text) - The journal entry content
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## Security
  - RLS enabled
  - Users can only access their own journal entries
  - Authenticated users required for all operations

  ## Indexes
  - Composite index on (user_id, journey_pass, day) for efficient querying
  - Index on created_at for chronological sorting
*/

-- Create daily_journal_entries table
CREATE TABLE IF NOT EXISTS daily_journal_entries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day integer NOT NULL CHECK (day >= 1 AND day <= 30),
  journey_pass integer DEFAULT 1,
  entry_text text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, day, journey_pass)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_daily_journal_user_journey_day 
  ON daily_journal_entries(user_id, journey_pass, day);

CREATE INDEX IF NOT EXISTS idx_daily_journal_created 
  ON daily_journal_entries(user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE daily_journal_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for daily_journal_entries
CREATE POLICY "Users can view own journal entries"
  ON daily_journal_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own journal entries"
  ON daily_journal_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own journal entries"
  ON daily_journal_entries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own journal entries"
  ON daily_journal_entries FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_daily_journal_entries_updated_at
  BEFORE UPDATE ON daily_journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();