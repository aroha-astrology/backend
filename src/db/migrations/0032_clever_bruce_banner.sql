CREATE TYPE "public"."astrologer_booking_status" AS ENUM('requested', 'confirmed', 'completed', 'declined', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."booking_message_sender_role" AS ENUM('customer', 'provider');--> statement-breakpoint
CREATE TYPE "public"."booking_message_type" AS ENUM('astrologer', 'pooja');--> statement-breakpoint
CREATE TYPE "public"."pooja_booking_status" AS ENUM('requested', 'assigned', 'completed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."prime_report_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."provider_kind" AS ENUM('astrologer', 'pandit');--> statement-breakpoint
CREATE TYPE "public"."shagun_product_category" AS ENUM('gemstone', 'rudraksha', 'yantra', 'mala', 'idol', 'puja-item', 'gift-set');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_firebase_uid" text NOT NULL,
	"route" text NOT NULL,
	"params" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"phone" text,
	"rate_paise_per_session" integer NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "booking_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_type" "booking_message_type" NOT NULL,
	"booking_id" uuid NOT NULL,
	"sender_role" "booking_message_sender_role" NOT NULL,
	"sender_user_id" uuid,
	"sender_provider_account_id" uuid,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "palm_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"birth_profile_id" uuid,
	"image_base64" text NOT NULL,
	"mime_type" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "provider_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "provider_kind" NOT NULL,
	"ref_id" uuid NOT NULL,
	"firebase_uid" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shagun_click_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shagun_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "shagun_product_category" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"price_range_text" text,
	"affiliate_url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
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
DO $$ BEGIN
 ALTER TABLE "booking_messages" ADD CONSTRAINT "booking_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "palm_photos" ADD CONSTRAINT "palm_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "palm_photos" ADD CONSTRAINT "palm_photos_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
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
DO $$ BEGIN
 ALTER TABLE "shagun_click_events" ADD CONSTRAINT "shagun_click_events_product_id_shagun_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shagun_products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shagun_click_events" ADD CONSTRAINT "shagun_click_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_created_at_idx" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "astrologer_bookings_user_id_idx" ON "astrologer_bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "astrologer_bookings_astrologer_id_idx" ON "astrologer_bookings" USING btree ("astrologer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "astrologers_verified_active_idx" ON "astrologers" USING btree ("verified","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_messages_booking_idx" ON "booking_messages" USING btree ("booking_type","booking_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "palm_photos_primary_unique" ON "palm_photos" USING btree ("user_id") WHERE "palm_photos"."birth_profile_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "palm_photos_profile_unique" ON "palm_photos" USING btree ("user_id","birth_profile_id") WHERE "palm_photos"."birth_profile_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pooja_bookings_user_id_idx" ON "pooja_bookings" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pooja_bookings_pandit_id_idx" ON "pooja_bookings" USING btree ("pandit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pooja_bookings_status_idx" ON "pooja_bookings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pooja_catalog_name_unique" ON "pooja_catalog" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prime_reports_primary_unique" ON "prime_reports" USING btree ("user_id","report_type","period") WHERE "prime_reports"."birth_profile_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prime_reports_profile_unique" ON "prime_reports" USING btree ("user_id","birth_profile_id","report_type","period") WHERE "prime_reports"."birth_profile_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_accounts_firebase_uid_unique" ON "provider_accounts" USING btree ("firebase_uid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_accounts_ref_idx" ON "provider_accounts" USING btree ("kind","ref_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shagun_click_events_product_id_idx" ON "shagun_click_events" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shagun_products_active_category_sort_idx" ON "shagun_products" USING btree ("category","sort_order") WHERE "shagun_products"."is_active" = true;