-- =============================================================================
-- Per-user engine preferences + prediction de-duplication
-- =============================================================================
-- 1. `preferred_lunar_node` lets a user pick the true node instead of the mean.
--    Until now this was a process-wide env var, so it was all-or-nothing for
--    every user on the box. NULL means "use the server default", which keeps
--    every existing row behaving exactly as it does today.
--
-- 2. A uniqueness rule on prediction_outcomes. Chat capture records the
--    strongest window per domain on every turn, and the same window would
--    otherwise be inserted again on the next turn, and the next — inflating the
--    denominator of the accuracy number this table exists to produce. One row
--    per (user, profile, surface, domain, window), and re-capture becomes a
--    no-op instead of a duplicate.
-- =============================================================================

-- 1. per-user lunar node ------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "preferred_lunar_node" AS ENUM ('mean', 'true');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "preferred_lunar_node" "preferred_lunar_node";

-- 2. prediction de-duplication -----------------------------------------------
-- COALESCE on the nullable columns: NULLs never compare equal in a plain unique
-- index, so without this the primary-profile rows (birth_profile_id IS NULL)
-- would duplicate freely — exactly the common case.
CREATE UNIQUE INDEX IF NOT EXISTS "prediction_outcomes_unique_claim_idx"
  ON "prediction_outcomes" (
    "user_id",
    COALESCE("birth_profile_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "surface",
    COALESCE("domain", ''),
    COALESCE("window_start", '0001-01-01'::date),
    COALESCE("window_end", '0001-01-01'::date)
  );
