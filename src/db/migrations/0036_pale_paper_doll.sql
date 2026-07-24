CREATE TYPE "public"."provider_kind" AS ENUM('astrologer', 'pandit');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "provider_kind" NOT NULL,
	"ref_id" uuid NOT NULL,
	"firebase_uid" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_accounts_firebase_uid_unique" ON "provider_accounts" USING btree ("firebase_uid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_accounts_ref_idx" ON "provider_accounts" USING btree ("kind","ref_id");