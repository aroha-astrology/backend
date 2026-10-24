-- Palm Reading is open to everyone (2026-10-24): the full reading costs the normal price from the
-- wallet, and an Aroha Pass member gets one free per Pass period on top. Admin can hand the free
-- one back ("reset the palm count"): `palm_free_reset_at` is the moment it was last reset, and only
-- free readings unlocked AFTER it count against the period's one. Null = never reset.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "palm_free_reset_at" timestamp with time zone;
