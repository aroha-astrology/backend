CREATE TYPE "public"."horoscope_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "daily_horoscopes" ALTER COLUMN "summary" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_horoscopes" ADD COLUMN "status" "horoscope_status";--> statement-breakpoint
ALTER TABLE "daily_horoscopes" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "daily_horoscopes" ADD COLUMN "error" text;--> statement-breakpoint
UPDATE "daily_horoscopes" SET "status" = 'ready' WHERE "status" IS NULL;--> statement-breakpoint
ALTER TABLE "daily_horoscopes" ALTER COLUMN "status" SET NOT NULL;