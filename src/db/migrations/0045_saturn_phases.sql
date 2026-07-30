DO $$ BEGIN
 CREATE TYPE "public"."saturn_phase" AS ENUM('sade-sati-rising', 'sade-sati-peak', 'sade-sati-setting', 'dhaiya-4th', 'dhaiya-8th', 'none');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saturn_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"birth_profile_id" uuid,
	"phase" "saturn_phase" NOT NULL,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"last_checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saturn_phases" ADD CONSTRAINT "saturn_phases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saturn_phases" ADD CONSTRAINT "saturn_phases_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saturn_phases_user_primary_unique" ON "saturn_phases" USING btree ("user_id") WHERE "saturn_phases"."birth_profile_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saturn_phases_user_profile_unique" ON "saturn_phases" USING btree ("user_id","birth_profile_id") WHERE "saturn_phases"."birth_profile_id" is not null;
