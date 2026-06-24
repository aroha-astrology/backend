CREATE TYPE "public"."birth_location_accuracy" AS ENUM('exact', 'city', 'region', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."birth_profile_relationship" AS ENUM('partner', 'prospective_match', 'spouse', 'child', 'parent', 'sibling', 'friend', 'other');--> statement-breakpoint
CREATE TYPE "public"."birth_time_accuracy" AS ENUM('exact', 'approximate', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."birth_time_rectification_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."birth_time_source" AS ENUM('birth_certificate', 'hospital_record', 'family_memory', 'rectified', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."consent_action" AS ENUM('granted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."consent_type" AS ENUM('terms', 'privacy', 'marketing', 'data_processing', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."house_system" AS ENUM('whole_sign', 'equal', 'placidus', 'koch', 'campanus', 'regiomontanus', 'porphyry', 'topocentric', 'alcabitius', 'sripati', 'kp_placidus');--> statement-breakpoint
CREATE TYPE "public"."onboarding_status" AS ENUM('not_started', 'in_progress', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."partner_seeking_intent" AS ENUM('not_seeking', 'exploring', 'seeking_marriage');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('ios', 'android', 'web');--> statement-breakpoint
CREATE TYPE "public"."preferred_ayanamsa" AS ENUM('lahiri', 'raman', 'krishnamurti', 'yukteshwar', 'true_chitrapaksha', 'fagan_bradley');--> statement-breakpoint
CREATE TYPE "public"."preferred_calendar_locale" AS ENUM('amanta', 'purnimanta');--> statement-breakpoint
CREATE TYPE "public"."preferred_chart_style" AS ENUM('north_indian', 'south_indian', 'east_indian');--> statement-breakpoint
CREATE TYPE "public"."preferred_dasha_system" AS ENUM('vimshottari', 'yogini', 'ashtottari', 'kalachakra', 'chara');--> statement-breakpoint
CREATE TYPE "public"."preferred_dasha_year_length" AS ENUM('savana_360', 'solar_365_25', 'drik_365_2425');--> statement-breakpoint
CREATE TYPE "public"."preferred_node_type" AS ENUM('mean', 'true');--> statement-breakpoint
CREATE TYPE "public"."preferred_system" AS ENUM('vedic', 'western');--> statement-breakpoint
CREATE TYPE "public"."relationship_status" AS ENUM('single', 'in_relationship', 'engaged', 'married', 'divorced', 'widowed', 'separated', 'complicated', 'prefer_not_to_say');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "birth_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"relationship" "birth_profile_relationship",
	"display_name" text,
	"gender" "gender",
	"date_of_birth" date,
	"time_of_birth" time,
	"place_of_birth" jsonb,
	"birth_time_accuracy" "birth_time_accuracy",
	"birth_time_source" "birth_time_source",
	"birth_location_accuracy" "birth_location_accuracy",
	"gotra" text,
	"added_with_consent" boolean,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" "platform" NOT NULL,
	"device_id" text,
	"locale" text,
	"app_version" text,
	"os_version" text,
	"push_enabled" boolean,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_consent_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"consent_type" "consent_type" NOT NULL,
	"action" "consent_action" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"policy_version" text,
	"source_ip" text,
	"user_agent" text
);
--> statement-breakpoint
DROP INDEX IF EXISTS "users_firebase_uid_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "users_phone_e164_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_time_accuracy" "birth_time_accuracy";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_time_source" "birth_time_source";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_time_rectified" boolean;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_time_rectification_confidence" "birth_time_rectification_confidence";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_location_accuracy" "birth_location_accuracy";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gotra" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sankalpa_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_system" "preferred_system";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_ayanamsa" "preferred_ayanamsa";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_house_system" "house_system";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_chart_style" "preferred_chart_style";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_dasha_system" "preferred_dasha_system";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_dasha_year_length" "preferred_dasha_year_length";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_node_type" "preferred_node_type";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_calendar_locale" "preferred_calendar_locale";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "chart_preferences" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "current_location" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "current_location_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "current_timezone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "current_country" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "content_language" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "daily_horoscope_send_hour_local" time;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "interest_areas" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "relationship_status" "relationship_status";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "partner_seeking_intent" "partner_seeking_intent";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notification_prefs" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quiet_hours" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_status" "onboarding_status";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_step" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "streak_count" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "streak_last_day" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "app_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform" "platform";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referral_source" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referred_by_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "acquisition_attribution" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "marketing_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "marketing_consent_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_opt_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_opt_in_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "data_processing_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "data_processing_consent_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privacy_policy_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privacy_policy_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "birth_profiles" ADD CONSTRAINT "birth_profiles_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_consent_log" ADD CONSTRAINT "user_consent_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "birth_profiles_owner_user_id_idx" ON "birth_profiles" USING btree ("owner_user_id") WHERE "birth_profiles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_push_tokens_user_id_idx" ON "device_push_tokens" USING btree ("user_id") WHERE "device_push_tokens"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "device_push_tokens_token_unique" ON "device_push_tokens" USING btree ("token") WHERE "device_push_tokens"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_consent_log_user_id_occurred_at_idx" ON "user_consent_log" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_unique" ON "users" USING btree (lower("email")) WHERE "users"."deleted_at" is null and "users"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_code_unique" ON "users" USING btree ("referral_code") WHERE "users"."referral_code" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_referred_by_code_idx" ON "users" USING btree ("referred_by_code");