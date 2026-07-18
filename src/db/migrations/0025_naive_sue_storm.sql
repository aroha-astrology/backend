DROP INDEX IF EXISTS "daily_horoscopes_user_period_key_profile_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "gemstone_recommendations_user_profile_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "house_insights_user_house_profile_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "kundlis_user_profile_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_horoscopes_user_period_key_profile_unique" ON "daily_horoscopes" USING btree ("user_id","period","period_key","birth_profile_id") WHERE "daily_horoscopes"."birth_profile_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gemstone_recommendations_user_profile_unique" ON "gemstone_recommendations" USING btree ("user_id","birth_profile_id") WHERE "gemstone_recommendations"."birth_profile_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "house_insights_user_house_profile_unique" ON "house_insights" USING btree ("user_id","house","birth_profile_id") WHERE "house_insights"."birth_profile_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kundlis_user_profile_unique" ON "kundlis" USING btree ("user_id","birth_profile_id") WHERE "kundlis"."birth_profile_id" is not null;