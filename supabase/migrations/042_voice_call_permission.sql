-- ============================================================================
-- Migration 042: Voice call permission gate + IWANTCALL perk coupon
-- ============================================================================
-- The voice-call feature is opt-in. By default users do not see the call
-- button. They unlock it by redeeming the IWANTCALL coupon (token_amount = 0,
-- grants_perk = 'voice_call'). This lets us run a controlled beta and observe
-- behavior before opening the feature to everyone.

-- 1. Per-user permission flag (default OFF for everyone, including existing users)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS voice_call_enabled boolean NOT NULL DEFAULT false;

-- 2. Allow coupons to grant perks instead of (or in addition to) tokens.
--    The IWANTCALL coupon has token_amount = 0 and grants_perk = 'voice_call'.
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS grants_perk text;

-- Relax the legacy token_amount > 0 constraint — perk-only coupons exist now.
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_token_amount_check;
ALTER TABLE coupons
  ADD CONSTRAINT coupons_token_amount_check CHECK (token_amount >= 0);

-- 3. Make IWANTCALL reusable so multiple beta users can redeem the SAME code.
--    Without this, the existing unique (code) + is_used flag would block the
--    second redeemer. We track per-user redemption via the new table below.
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id   uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, user_id)     -- a user can redeem a given coupon at most once
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions(user_id);

ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own redemptions"
  ON coupon_redemptions FOR SELECT
  USING (user_id = auth.uid());

-- 4. Add 'reusable' flag on coupons so single-use vs multi-use is explicit.
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS is_reusable boolean NOT NULL DEFAULT false;

-- 5. Seed the IWANTCALL coupon. Reusable across the whole beta cohort.
INSERT INTO coupons (code, token_amount, grants_perk, is_reusable)
VALUES ('IWANTCALL', 0, 'voice_call', true)
ON CONFLICT (code) DO UPDATE
  SET token_amount = EXCLUDED.token_amount,
      grants_perk = EXCLUDED.grants_perk,
      is_reusable = EXCLUDED.is_reusable;
