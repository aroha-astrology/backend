CREATE TYPE "public"."astrologer_booking_status" AS ENUM('requested', 'confirmed', 'completed', 'declined', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "astrologer_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"astrologer_id" uuid NOT NULL,
	"birth_profile_id" uuid,
	"preferred_time_window" text NOT NULL,
	"status" "astrologer_booking_status" DEFAULT 'requested' NOT NULL,
	"price_paise_paid" integer NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "astrologers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"bio" text,
	"specialties" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"languages" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"photo_url" text,
	"rate_paise_per_session" integer NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "astrologer_bookings" ADD CONSTRAINT "astrologer_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "astrologer_bookings" ADD CONSTRAINT "astrologer_bookings_astrologer_id_astrologers_id_fk" FOREIGN KEY ("astrologer_id") REFERENCES "public"."astrologers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "astrologer_bookings" ADD CONSTRAINT "astrologer_bookings_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "astrologers" ADD CONSTRAINT "astrologers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "astrologer_bookings_user_id_idx" ON "astrologer_bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "astrologer_bookings_astrologer_id_idx" ON "astrologer_bookings" USING btree ("astrologer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "astrologers_verified_active_idx" ON "astrologers" USING btree ("verified","active");