-- Digital Yantras & Wallpapers (roadmap step 11): one row per product a user
-- bought for a profile — the yantra (print-ready) or the phone wallpaper —
-- with the design spec as it was built from the chart at purchase time, so
-- reopening shows the same yantra and never charges again.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS guards make this safe
-- to re-run. See 0074_feature_unlocks_and_signup_bonus.sql.

CREATE TABLE IF NOT EXISTS "digital_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "birth_profile_id" uuid REFERENCES "birth_profiles"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "spec" jsonb NOT NULL,
  "price_paid_paise" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "digital_products_user_primary_kind_unique"
  ON "digital_products" ("user_id", "kind") WHERE "birth_profile_id" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "digital_products_user_profile_kind_unique"
  ON "digital_products" ("user_id", "birth_profile_id", "kind") WHERE "birth_profile_id" IS NOT NULL;
