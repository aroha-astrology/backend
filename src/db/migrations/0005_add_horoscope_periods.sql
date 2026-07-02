CREATE TYPE "public"."horoscope_period" AS ENUM('daily', 'weekly', 'monthly', 'yearly');--> statement-breakpoint
DROP INDEX IF EXISTS "daily_horoscopes_user_date_unique";--> statement-breakpoint
ALTER TABLE "daily_horoscopes" ADD COLUMN "period" "horoscope_period" DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_horoscopes" ADD COLUMN "period_key" text;--> statement-breakpoint
UPDATE "daily_horoscopes" SET "period_key" = "for_date"::text WHERE "period_key" IS NULL;--> statement-breakpoint
ALTER TABLE "daily_horoscopes" ALTER COLUMN "period_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_horoscopes" ADD COLUMN "monthly_breakdown" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_horoscopes_user_period_key_unique" ON "daily_horoscopes" USING btree ("user_id","period","period_key");
