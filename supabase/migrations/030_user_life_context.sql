-- Add life-context fields to users for personalised AI readings
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profession             text,
  ADD COLUMN IF NOT EXISTS marital_status         text,
  ADD COLUMN IF NOT EXISTS financial_status       text,
  ADD COLUMN IF NOT EXISTS life_context_updated_at timestamptz;

COMMENT ON COLUMN users.profession             IS 'Free-text: e.g. "software engineer", "homemaker"';
COMMENT ON COLUMN users.marital_status         IS 'single | dating | engaged | married | separated_divorced | widowed';
COMMENT ON COLUMN users.financial_status       IS 'tight | stable | comfortable | prefer_not_to_say';
