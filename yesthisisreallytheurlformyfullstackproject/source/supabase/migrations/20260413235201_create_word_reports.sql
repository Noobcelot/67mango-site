/*
  # Create word_reports table

  ## Summary
  Creates a table for storing player-submitted reports about words in the game dictionary.

  ## New Tables
  - `word_reports`
    - `id` (uuid, primary key) - unique identifier
    - `word` (text, not null) - the word being reported
    - `report_type` (text, not null) - either 'missing' (word should be in dictionary) or 'bogus' (word should not be in dictionary)
    - `note` (text) - optional player note/explanation
    - `created_at` (timestamptz) - when the report was submitted

  ## Security
  - RLS enabled
  - Anyone (including anonymous users) can insert reports
  - No one can read/update/delete reports through the API (admin access only via service role)
*/

CREATE TABLE IF NOT EXISTS word_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word text NOT NULL,
  report_type text NOT NULL CHECK (report_type IN ('missing', 'bogus')),
  note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE word_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a word report"
  ON word_reports
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
