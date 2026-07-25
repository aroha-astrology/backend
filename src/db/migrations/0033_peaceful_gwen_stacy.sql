CREATE TYPE "public"."report_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"birth_profile_id" uuid,
	"report_key" text NOT NULL,
	"period_month" date,
	"status" "report_status" DEFAULT 'generating' NOT NULL,
	"content" jsonb,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input" jsonb,
	"model" text,
	"price_paid_paise" integer NOT NULL,
	"started_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_user_idx" ON "reports" USING btree ("user_id","report_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reports_uniq_primary_onetime" ON "reports" USING btree ("user_id","report_key") WHERE "reports"."birth_profile_id" is null and "reports"."period_month" is null and "reports"."input" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reports_uniq_primary_monthly" ON "reports" USING btree ("user_id","report_key","period_month") WHERE "reports"."birth_profile_id" is null and "reports"."period_month" is not null and "reports"."input" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reports_uniq_profile_onetime" ON "reports" USING btree ("user_id","birth_profile_id","report_key") WHERE "reports"."birth_profile_id" is not null and "reports"."period_month" is null and "reports"."input" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reports_uniq_profile_monthly" ON "reports" USING btree ("user_id","birth_profile_id","report_key","period_month") WHERE "reports"."birth_profile_id" is not null and "reports"."period_month" is not null and "reports"."input" is null;