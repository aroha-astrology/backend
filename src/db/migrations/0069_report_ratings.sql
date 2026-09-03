-- =============================================================================
-- report_ratings — per-report star rating; <3 stars auto-refunds 100% of what
-- was paid for that specific report. Distinct from user_feedback (once-ever,
-- app-wide) — this is repeatable, one row per (user, report).
-- =============================================================================
-- Hand-written, not the raw `drizzle-kit generate` diff, for the same reason
-- documented in 0056_remedy_insights.sql: the last real snapshot on disk
-- predates dozens of already-applied migrations, so a fresh `generate` diffs
-- against a stale baseline and reinvents already-applied tables/columns
-- (confirmed here — the raw output tried to re-CREATE gift_campaigns,
-- prediction_outcomes, remedy_insights, user_activity_daily, online_user_samples
-- and re-ALTER a dozen already-existing columns). Trimmed to just this table;
-- the journal/snapshot metadata from the `generate` run is kept as-is.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "report_ratings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "report_id" uuid NOT NULL REFERENCES "reports"("id") ON DELETE CASCADE,
  "rating" integer NOT NULL,
  "comment" text,
  "refunded_paise" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "report_ratings_user_report_unique"
  ON "report_ratings" ("user_id", "report_id");

CREATE INDEX IF NOT EXISTS "report_ratings_report_id_idx"
  ON "report_ratings" ("report_id");
