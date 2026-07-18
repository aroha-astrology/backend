ALTER TABLE "gemstone_recommendations" DROP CONSTRAINT "gemstone_recommendations_user_id_unique";--> statement-breakpoint
ALTER TABLE "kundlis" DROP CONSTRAINT "kundlis_user_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "daily_horoscopes_user_period_key_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "house_insights_user_house_unique";--> statement-breakpoint
ALTER TABLE "birth_profiles" ADD COLUMN "unlocked_houses" integer[];--> statement-breakpoint
ALTER TABLE "birth_profiles" ADD COLUMN "gemstone_unlocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "birth_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "daily_horoscopes" ADD COLUMN "birth_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "gemstone_recommendations" ADD COLUMN "birth_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "house_insights" ADD COLUMN "birth_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "kundlis" ADD COLUMN "birth_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "user_facts" ADD COLUMN "birth_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "active_profile_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_horoscopes" ADD CONSTRAINT "daily_horoscopes_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gemstone_recommendations" ADD CONSTRAINT "gemstone_recommendations_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "house_insights" ADD CONSTRAINT "house_insights_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kundlis" ADD CONSTRAINT "kundlis_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_facts" ADD CONSTRAINT "user_facts_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_active_profile_id_birth_profiles_id_fk" FOREIGN KEY ("active_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_horoscopes_user_period_key_primary_unique" ON "daily_horoscopes" USING btree ("user_id","period","period_key") WHERE "daily_horoscopes"."birth_profile_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_horoscopes_user_period_key_profile_unique" ON "daily_horoscopes" USING btree ("user_id","period","period_key","birth_profile_id") WHERE "daily_horoscopes"."birth_profile_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gemstone_recommendations_user_primary_unique" ON "gemstone_recommendations" USING btree ("user_id") WHERE "gemstone_recommendations"."birth_profile_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gemstone_recommendations_user_profile_unique" ON "gemstone_recommendations" USING btree ("user_id","birth_profile_id") WHERE "gemstone_recommendations"."birth_profile_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "house_insights_user_house_primary_unique" ON "house_insights" USING btree ("user_id","house") WHERE "house_insights"."birth_profile_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "house_insights_user_house_profile_unique" ON "house_insights" USING btree ("user_id","house","birth_profile_id") WHERE "house_insights"."birth_profile_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kundlis_user_primary_unique" ON "kundlis" USING btree ("user_id") WHERE "kundlis"."birth_profile_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kundlis_user_profile_unique" ON "kundlis" USING btree ("user_id","birth_profile_id") WHERE "kundlis"."birth_profile_id" is not null;