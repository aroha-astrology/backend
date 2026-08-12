-- =============================================================================
-- remedy_insights — the plain-language half of the Lal Kitab remedies page
-- =============================================================================
-- Hand-written, not drizzle-kit-generated, for the same reason as 0055 and
-- every other hand-written migration here: the last snapshot on disk is 0049
-- even though migrations exist well past it, so `drizzle-kit generate` diffs
-- against a stale baseline and reinvents already-applied objects.
--
-- One row per (user, birth profile), holding ONLY the model-written prose that
-- explains each planet placement and karmic debt in plain language. Every
-- deterministic fact on that page is recomputed per request, so nothing here
-- needs backfilling when the remedy database or the engine changes.
--
-- Structurally identical to gemstone_recommendations (0044-era) and
-- house_insights: a status enum with a started_at claim token for
-- single-flight generation, plus a translations jsonb for the seven UI
-- languages under the standard translate-on-read pattern.
--
-- The two partial unique indexes are what let a NULL birth_profile_id mean
-- "the primary/self profile" while still being unique — a plain UNIQUE
-- (user_id, birth_profile_id) would allow unlimited NULL rows, since NULLs
-- never compare equal in Postgres.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE "remedy_insight_status" AS ENUM ('generating', 'ready', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "remedy_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "birth_profile_id" uuid REFERENCES "birth_profiles"("id") ON DELETE CASCADE,
  "analysis" jsonb,
  "translations" jsonb,
  "model" text,
  "status" "remedy_insight_status" NOT NULL,
  "started_at" timestamp with time zone,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "remedy_insights_user_primary_unique"
  ON "remedy_insights" ("user_id")
  WHERE "birth_profile_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "remedy_insights_user_profile_unique"
  ON "remedy_insights" ("user_id", "birth_profile_id")
  WHERE "birth_profile_id" IS NOT NULL;
