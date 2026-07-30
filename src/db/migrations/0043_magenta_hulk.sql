-- Realtime voice (Gemini Live): voice_sessions ledger + the users.voice_consent_* pair.
--
-- NOTE: the `notifications.link` column below is NOT part of the voice work. It
-- came from an unrelated, uncommitted schema.ts change already present in the
-- working tree when this migration was generated, and drizzle-kit necessarily
-- emits the full schema diff. It is left in ON PURPOSE: deleting the statement
-- would desync this file from meta/0043_snapshot.json, which already records the
-- column as existing — after which no future `db:generate` would ever emit it
-- again and the column would silently never be created in production.
CREATE TABLE IF NOT EXISTS "voice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"birth_profile_id" uuid,
	"minutes_charged" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "link" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "voice_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "voice_consent_revoked_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_sessions_user_idx" ON "voice_sessions" USING btree ("user_id","created_at");