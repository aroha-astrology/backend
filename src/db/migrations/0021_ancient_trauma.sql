CREATE TYPE "public"."gemstone_recommendation_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gemstone_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"analysis" jsonb,
	"translations" jsonb,
	"model" text,
	"status" "gemstone_recommendation_status" NOT NULL,
	"started_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gemstone_recommendations_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gemstone_unlocked_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gemstone_recommendations" ADD CONSTRAINT "gemstone_recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
