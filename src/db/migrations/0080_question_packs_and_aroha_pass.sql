-- Question Packs + Aroha Pass (roadmap step 10). Everything ships switched
-- off; these columns sit unused until an admin turns the features on.
--
-- users.question_credits: prepaid chat questions bought as packs. Chat spends
-- them after the Pass's monthly quota and before the wallet.
--
-- user_subscriptions / subscription_plans already existed (created early,
-- never used). The Pass adds its own columns: how it was paid (wallet or
-- google_play), the Play purchase token as external_id, the price variant and
-- amount, the current period, questions used this period, auto-renew and the
-- cancellation time. One row per subscription; a renewal moves the period
-- forward on the same row.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS guards make this safe
-- to re-run. See 0074_feature_unlocks_and_signup_bonus.sql.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "question_credits" integer DEFAULT 0 NOT NULL;

ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'wallet' NOT NULL;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "price_variant" text;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "price_paise" integer DEFAULT 0 NOT NULL;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "auto_renew" boolean DEFAULT false NOT NULL;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "period_start" timestamp with time zone;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "period_end" timestamp with time zone;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "questions_used" integer DEFAULT 0 NOT NULL;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "reminded_at" timestamp with time zone;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "user_subscriptions_external_id_unique"
  ON "user_subscriptions" ("external_id") WHERE "external_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "user_subscriptions_period_end_idx"
  ON "user_subscriptions" ("status", "period_end");

INSERT INTO "subscription_plans" ("name", "monthly_price", "features")
SELECT 'aroha_pass', 29900, '{"questionsPerPeriod": 30, "periodDays": 30}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "subscription_plans" WHERE "name" = 'aroha_pass');
