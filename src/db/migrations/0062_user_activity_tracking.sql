-- Per-user IP-geolocation cache on `users`, plus a daily active-seconds
-- counter table fed by client heartbeats. Powers the admin Users table's
-- Country/City/time-spent columns and the Active Users location breakdown.
-- Hand-written (post-0050 convention): IF NOT EXISTS guards make this safe
-- to re-run.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_ip" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "geo_country" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "geo_city" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "geo_resolved_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "user_activity_daily" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "activity_date" date NOT NULL,
  "seconds_active" integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_activity_daily_user_date_unique"
  ON "user_activity_daily" ("user_id", "activity_date");
