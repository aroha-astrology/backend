CREATE TYPE "public"."house_insight_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "house_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"house" integer NOT NULL,
	"text" text,
	"strengths" jsonb,
	"weaknesses" jsonb,
	"model" text,
	"status" "house_insight_status" NOT NULL,
	"started_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_insights" ADD CONSTRAINT "house_insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "house_insights_user_house_unique" ON "house_insights" USING btree ("user_id","house");