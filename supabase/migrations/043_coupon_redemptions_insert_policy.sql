-- ============================================================================
-- Migration 043: INSERT policy for coupon_redemptions
-- ============================================================================
-- Migration 042 enabled RLS on coupon_redemptions and added a SELECT policy
-- but forgot the INSERT policy. The /api/credits/redeem route runs under the
-- user's auth (anon key + session), so inserts were blocked by RLS — surfacing
-- to the user as the 409 "Could not record redemption" when redeeming
-- reusable perk coupons like IWANTCALL.

CREATE POLICY "Users can insert their own redemptions"
  ON coupon_redemptions FOR INSERT
  WITH CHECK (user_id = auth.uid());
