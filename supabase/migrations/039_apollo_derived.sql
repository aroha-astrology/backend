-- ============================================================================
-- 039: Apollo-derived life context
-- Denormalizes the apollo_enrichment JSONB (migration 038) into queryable
-- columns. Downstream code reads these — never the raw JSONB — so company
-- and college names cannot leak into prompts or UI.
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS apollo_sector               text,
  ADD COLUMN IF NOT EXISTS apollo_seniority            text,
  ADD COLUMN IF NOT EXISTS apollo_years_experience     int,
  ADD COLUMN IF NOT EXISTS apollo_state                text,
  ADD COLUMN IF NOT EXISTS apollo_country              text,
  ADD COLUMN IF NOT EXISTS apollo_estimated_salary_inr int,
  ADD COLUMN IF NOT EXISTS apollo_salary_confidence    text
    CHECK (apollo_salary_confidence IN ('known_company','sector_average','unknown')),
  ADD COLUMN IF NOT EXISTS apollo_career_milestones    jsonb,
  ADD COLUMN IF NOT EXISTS apollo_reveal_at            timestamptz,
  ADD COLUMN IF NOT EXISTS apollo_derived_at           timestamptz;

-- The nightly From-Astrologer cron iterates users whose reveal window has
-- already passed. This partial index keeps that scan cheap.
CREATE INDEX IF NOT EXISTS users_apollo_reveal_ready_idx
  ON users (apollo_reveal_at)
  WHERE apollo_derived_at IS NOT NULL;
