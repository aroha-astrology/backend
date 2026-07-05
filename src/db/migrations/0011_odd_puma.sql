CREATE TYPE "public"."purchase_plan_category" AS ENUM('vehicle', 'home', 'commercial', 'other');--> statement-breakpoint
CREATE TYPE "public"."purchase_plan_status" AS ENUM('pending', 'processing', 'done', 'error');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chart_id" uuid,
	"category" "purchase_plan_category" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_bracket" text,
	"booking_date" date,
	"delivery_date" date,
	"resolved_booking_date" date NOT NULL,
	"resolved_delivery_date" date NOT NULL,
	"panchang_date" date NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"status" "purchase_plan_status" DEFAULT 'pending' NOT NULL,
	"analysis" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_plans" ADD CONSTRAINT "purchase_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_plans" ADD CONSTRAINT "purchase_plans_chart_id_kundlis_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."kundlis"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_plans_user_created_idx" ON "purchase_plans" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_plans_status_idx" ON "purchase_plans" USING btree ("status");