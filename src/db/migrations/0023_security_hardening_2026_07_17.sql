CREATE TABLE IF NOT EXISTS "telegram_admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" text NOT NULL,
	"tier" text NOT NULL,
	"command" text NOT NULL,
	"args" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_phone_e164_unique";--> statement-breakpoint
ALTER TABLE "birth_profiles" ALTER COLUMN "date_of_birth" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "birth_profiles" ALTER COLUMN "time_of_birth" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "birth_profiles" ALTER COLUMN "place_of_birth" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "chat_sessions" ALTER COLUMN "history" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "chat_sessions" ALTER COLUMN "history" SET DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "date_of_birth" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "time_of_birth" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "place_of_birth" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_e164_hash" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telegram_admin_audit_log_created_at_idx" ON "telegram_admin_audit_log" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "acquisition_attribution";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_e164_hash_unique" UNIQUE("phone_e164_hash");