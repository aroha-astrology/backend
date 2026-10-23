-- Where the user's sky is, for the travel pill and NRI mode (v7 spec, Sprint 2).
--
-- home_location / home_timezone: the place the user calls home (not their birth place). The timezone
--   is adopted from the device the first time the travel pill is on, so it works before a city is set.
-- sky_mode: HOME (times for home), TRAVEL_SYNCED (times for where the device is now) or
--   TRAVEL_DISMISSED (the user chose to keep home while away).
-- sky_dismissed_tz: the device zone the user said "keep home" for; asked again when the zone changes.
-- is_nri: the user lives outside India and wants the Delhi times beside their local ones.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "home_location" jsonb,
  ADD COLUMN IF NOT EXISTS "home_timezone" text,
  ADD COLUMN IF NOT EXISTS "sky_mode" text DEFAULT 'HOME' NOT NULL
    CHECK ("sky_mode" IN ('HOME', 'TRAVEL_SYNCED', 'TRAVEL_DISMISSED')),
  ADD COLUMN IF NOT EXISTS "sky_dismissed_tz" text,
  ADD COLUMN IF NOT EXISTS "is_nri" boolean DEFAULT false NOT NULL;
