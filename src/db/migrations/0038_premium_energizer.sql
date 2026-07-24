CREATE TYPE "public"."pooja_booking_status" AS ENUM('requested', 'assigned', 'completed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pandits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"phone" text,
	"city" text NOT NULL,
	"languages" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pooja_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"birth_profile_id" uuid,
	"pooja_id" uuid NOT NULL,
	"pandit_id" uuid,
	"preferred_date" date NOT NULL,
	"ship_address" text NOT NULL,
	"ship_pincode" text NOT NULL,
	"status" "pooja_booking_status" DEFAULT 'requested' NOT NULL,
	"price_paise_paid" integer NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pooja_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"deity" text,
	"base_price_paise" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pooja_bookings" ADD CONSTRAINT "pooja_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pooja_bookings" ADD CONSTRAINT "pooja_bookings_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pooja_bookings" ADD CONSTRAINT "pooja_bookings_pooja_id_pooja_catalog_id_fk" FOREIGN KEY ("pooja_id") REFERENCES "public"."pooja_catalog"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pooja_bookings" ADD CONSTRAINT "pooja_bookings_pandit_id_pandits_id_fk" FOREIGN KEY ("pandit_id") REFERENCES "public"."pandits"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pooja_bookings_user_id_idx" ON "pooja_bookings" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pooja_bookings_pandit_id_idx" ON "pooja_bookings" USING btree ("pandit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pooja_bookings_status_idx" ON "pooja_bookings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pooja_catalog_name_unique" ON "pooja_catalog" USING btree (lower("name"));