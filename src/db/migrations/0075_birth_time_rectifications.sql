-- Birth Time Confidence (roadmap step 1): one row per paid birth-time check.
-- Birth times and life events are stored encrypted by the application (same
-- field encryption as users/birth_profiles), so those columns are plain text
-- here. The birth_time_rectification_confidence enum already exists (it was
-- created with the users columns that never got used until now).
--
-- Hand-written (post-0050 convention): IF NOT EXISTS guards make this safe
-- to re-run. See 0074_feature_unlocks_and_signup_bonus.sql.

CREATE TABLE IF NOT EXISTS "birth_time_rectifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "birth_profile_id" uuid REFERENCES "birth_profiles"("id") ON DELETE CASCADE,
  "stated_time" text NOT NULL,
  "suggested_time" text NOT NULL,
  "detail" text NOT NULL,
  "confidence" "birth_time_rectification_confidence" NOT NULL,
  "confidence_pct" integer NOT NULL,
  "price_paid_paise" integer DEFAULT 0 NOT NULL,
  "applied_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "birth_time_rectifications_user_profile_idx"
  ON "birth_time_rectifications" ("user_id", "birth_profile_id", "created_at");
