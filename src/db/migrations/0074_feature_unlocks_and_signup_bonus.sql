-- Two things, both groundwork for the 2026-09 roadmap build:
--
-- 1. feature_unlocks — a generic one-off paid unlock (user, profile, feature
--    key) so each new paid unlock doesn't need its own *_unlocked_at column.
--    Same NULL-means-primary-profile partial unique indexes as
--    remedy_insights (0056).
--
-- 2. The new-user wallet balance drops from Rs 500 to Rs 201. insertUser() now
--    sets the opening balance explicitly from the admin `rewards.signupBonus`
--    key; this column default is only the safety net and matches that key's
--    default. Existing balances are not touched.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS guards make this safe
-- to re-run. See 0073_free_follow_up.sql.

CREATE TABLE IF NOT EXISTS "feature_unlocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "birth_profile_id" uuid REFERENCES "birth_profiles"("id") ON DELETE CASCADE,
  "feature_key" text NOT NULL,
  "price_paid_paise" integer DEFAULT 0 NOT NULL,
  "unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "feature_unlocks_user_primary_unique"
  ON "feature_unlocks" ("user_id", "feature_key")
  WHERE "birth_profile_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "feature_unlocks_user_profile_unique"
  ON "feature_unlocks" ("user_id", "birth_profile_id", "feature_key")
  WHERE "birth_profile_id" IS NOT NULL;

ALTER TABLE "users" ALTER COLUMN "wallet_balance_paise" SET DEFAULT 20100;
