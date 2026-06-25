-- ============================================================================
-- 038: Apollo.io people enrichment
-- Stores the raw Apollo /people/match response so future code can read any
-- field (title, organization, location, seniority, etc.) without re-fetching.
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS apollo_enrichment  jsonb,
  ADD COLUMN IF NOT EXISTS apollo_enriched_at timestamptz;

-- Partial index — only the rows we haven't enriched yet, so the post-login
-- "needs enrichment?" check stays O(1) even as the table grows.
CREATE INDEX IF NOT EXISTS users_apollo_pending_idx
  ON users (id)
  WHERE apollo_enriched_at IS NULL;
