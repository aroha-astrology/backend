-- ============================================================================
-- Jyotish AI - Migration 008: Coupon System & Token Costs
-- ============================================================================

-- 1. Coupons table
CREATE TABLE IF NOT EXISTS coupons (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code       text UNIQUE NOT NULL,
    token_amount int NOT NULL CHECK (token_amount > 0),
    is_used    boolean DEFAULT false,
    used_by    uuid REFERENCES users(id) ON DELETE SET NULL,
    used_at    timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_coupons_code    ON coupons(code);
CREATE INDEX idx_coupons_is_used ON coupons(is_used);

-- RLS for coupons (admin inserts, authenticated reads)
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view available coupons"
    ON coupons FOR SELECT
    USING (auth.role() = 'authenticated');

-- 2. Add chat_session_expires to users for 5-min token window
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_session_expires timestamptz;

-- 3. Extend credit_transactions type to include coupon + feature debits
ALTER TABLE credit_transactions
    DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE credit_transactions
    ADD CONSTRAINT credit_transactions_type_check
    CHECK (type IN (
        'signup_bonus', 'purchase', 'video_debit', 'report_debit',
        'referral', 'coupon_redeem', 'feature_debit', 'chat_debit'
    ));

-- 4. Atomic credit deduction RPC (returns new balance, raises if insufficient)
CREATE OR REPLACE FUNCTION deduct_credits(p_user_id uuid, p_amount int)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_credits int;
BEGIN
  UPDATE users
     SET credits = credits - p_amount
   WHERE id = p_user_id
     AND credits >= p_amount
  RETURNING credits INTO v_new_credits;

  IF v_new_credits IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_TOKENS: Not enough tokens to complete this action';
  END IF;

  RETURN v_new_credits;
END;
$$;

-- 5. Seed coupon codes
-- One master coupon (40 tokens)
INSERT INTO coupons (code, token_amount) VALUES ('JYOTISH40', 40)
ON CONFLICT (code) DO NOTHING;

-- 20 × 1-token coupons
INSERT INTO coupons (code, token_amount) VALUES
  ('JY1-ABCD', 1), ('JY1-EFGH', 1), ('JY1-IJKL', 1), ('JY1-MNOP', 1),
  ('JY1-QRST', 1), ('JY1-UVWX', 1), ('JY1-YZBC', 1), ('JY1-DEFG', 1),
  ('JY1-HIJK', 1), ('JY1-LMNO', 1), ('JY1-PQRS', 1), ('JY1-TUVW', 1),
  ('JY1-XYZA', 1), ('JY1-BCDE', 1), ('JY1-FGHI', 1), ('JY1-JKLM', 1),
  ('JY1-NOPQ', 1), ('JY1-RSTU', 1), ('JY1-VWXY', 1), ('JY1-ZABC', 1)
ON CONFLICT (code) DO NOTHING;

-- 20 × 2-token coupons
INSERT INTO coupons (code, token_amount) VALUES
  ('JY2-ABCD', 2), ('JY2-EFGH', 2), ('JY2-IJKL', 2), ('JY2-MNOP', 2),
  ('JY2-QRST', 2), ('JY2-UVWX', 2), ('JY2-YZBC', 2), ('JY2-DEFG', 2),
  ('JY2-HIJK', 2), ('JY2-LMNO', 2), ('JY2-PQRS', 2), ('JY2-TUVW', 2),
  ('JY2-XYZA', 2), ('JY2-BCDE', 2), ('JY2-FGHI', 2), ('JY2-JKLM', 2),
  ('JY2-NOPQ', 2), ('JY2-RSTU', 2), ('JY2-VWXY', 2), ('JY2-ZABC', 2)
ON CONFLICT (code) DO NOTHING;
