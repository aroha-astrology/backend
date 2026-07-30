CREATE TYPE "public"."palm_reading_status" AS ENUM('pending', 'generating', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "palm_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"birth_profile_id" uuid,
	"status" "palm_reading_status" DEFAULT 'pending' NOT NULL,
	"primary_hand" text NOT NULL,
	"frames" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"frames_hash" text,
	"observations" jsonb,
	"content" jsonb,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence_score" integer,
	"unlocked" boolean DEFAULT false NOT NULL,
	"price_paid_paise" integer,
	"model" text,
	"started_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "palm_readings" ADD CONSTRAINT "palm_readings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "palm_readings" ADD CONSTRAINT "palm_readings_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "palm_readings_user_idx" ON "palm_readings" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "palm_readings_user_frames_hash_idx" ON "palm_readings" USING btree ("user_id","frames_hash");