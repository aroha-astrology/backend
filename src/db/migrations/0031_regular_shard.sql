CREATE TYPE "public"."prime_report_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prime_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"birth_profile_id" uuid,
	"report_type" text NOT NULL,
	"period" text DEFAULT 'lifetime' NOT NULL,
	"unlocked_at" timestamp with time zone NOT NULL,
	"analysis" jsonb,
	"translations" jsonb,
	"model" text,
	"status" "prime_report_status" NOT NULL,
	"started_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prime_reports" ADD CONSTRAINT "prime_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prime_reports" ADD CONSTRAINT "prime_reports_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prime_reports_primary_unique" ON "prime_reports" USING btree ("user_id","report_type","period") WHERE "prime_reports"."birth_profile_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prime_reports_profile_unique" ON "prime_reports" USING btree ("user_id","birth_profile_id","report_type","period") WHERE "prime_reports"."birth_profile_id" is not null;
