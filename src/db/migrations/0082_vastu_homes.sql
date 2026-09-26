-- Vastu Studio phase 0: floor plans saved to the account (per profile) instead
-- of only on the device, and a rule-set stamp on every paid report so an old
-- report is never silently re-scored under a newer rules table.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS guards make this safe
-- to re-run. See 0074_feature_unlocks_and_signup_bonus.sql.

CREATE TABLE IF NOT EXISTS "vastu_homes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "birth_profile_id" uuid REFERENCES "birth_profiles"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "layout" jsonb NOT NULL,
  "overall_score" integer,
  "rule_set_id" text DEFAULT 'aroha-traditional-v1' NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "vastu_homes_user_updated_idx"
  ON "vastu_homes" ("user_id", "updated_at");

ALTER TABLE "vastu_plans"
  ADD COLUMN IF NOT EXISTS "home_id" uuid REFERENCES "vastu_homes"("id") ON DELETE SET NULL;
ALTER TABLE "vastu_plans"
  ADD COLUMN IF NOT EXISTS "rule_set_id" text DEFAULT 'aroha-traditional-v1' NOT NULL;
