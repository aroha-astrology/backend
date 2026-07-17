CREATE TABLE IF NOT EXISTS "forecast_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"for_date" date NOT NULL,
	"sign_type" text NOT NULL,
	"sign_index" integer NOT NULL,
	"period" text DEFAULT 'daily' NOT NULL,
	"language" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_horoscopes" ADD COLUMN "translations" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "forecast_translations_lookup_idx" ON "forecast_translations" USING btree ("for_date","sign_type","sign_index","period","language");