CREATE TYPE "public"."vastu_plan_status" AS ENUM('pending', 'processing', 'done', 'error');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vastu_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"layout" jsonb,
	"room_layout" jsonb NOT NULL,
	"room_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"overall_score" integer,
	"language" text DEFAULT 'en' NOT NULL,
	"status" "vastu_plan_status" DEFAULT 'pending' NOT NULL,
	"analysis" jsonb,
	"translations" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vastu_plans" ADD CONSTRAINT "vastu_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vastu_plans_user_created_idx" ON "vastu_plans" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vastu_plans_status_idx" ON "vastu_plans" USING btree ("status");