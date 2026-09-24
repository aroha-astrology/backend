-- Decision Astrology + Find My Date (roadmap step 6): one row per paid result,
-- so reopening a result never charges again. The user's own question and the
-- place are personal data, stored encrypted by the application in "input";
-- "result" holds the scored days, windows and best dates.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS guards make this safe
-- to re-run. See 0074_feature_unlocks_and_signup_bonus.sql.

CREATE TABLE IF NOT EXISTS "decision_queries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "birth_profile_id" uuid REFERENCES "birth_profiles"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "category" text NOT NULL,
  "input" text NOT NULL,
  "result" jsonb NOT NULL,
  "price_paid_paise" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "decision_queries_user_created_idx"
  ON "decision_queries" ("user_id", "created_at");
