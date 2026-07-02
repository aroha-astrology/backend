CREATE TYPE "public"."kundli_status" AS ENUM('pending', 'generating', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kundlis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "kundli_status" DEFAULT 'pending' NOT NULL,
	"ayanamsa" text,
	"house_system" text,
	"time_known" boolean,
	"birth_hash" text,
	"chart_data" jsonb,
	"dasha_data" jsonb,
	"yoga_data" jsonb,
	"dosha_data" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kundlis_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kundlis" ADD CONSTRAINT "kundlis_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
