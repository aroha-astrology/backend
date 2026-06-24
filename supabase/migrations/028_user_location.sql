-- ============================================================================
-- 028: User current location
-- Stores the device's last-known location on the users row.
-- Distinct from birth_profiles.latitude/longitude (birth place — never touched).
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_latitude    decimal,
  ADD COLUMN IF NOT EXISTS current_longitude   decimal,
  ADD COLUMN IF NOT EXISTS current_city        text,
  ADD COLUMN IF NOT EXISTS current_country     text,
  ADD COLUMN IF NOT EXISTS location_source     text
    CHECK (location_source IN ('device', 'manual', 'ip')),
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;
