-- ============================================================================
-- 035: Credit orders + payment idempotency
-- ============================================================================
-- Two changes for the live Razorpay flow:
--   1. credit_orders — server-side record of every order created. The verify
--      endpoint and webhook look up the canonical (user_id, pack_id, amount)
--      from this table so the client cannot swap pack_id between order and
--      verify to claim a larger pack than they paid for.
--   2. UNIQUE on credit_transactions.razorpay_payment_id — closes the
--      race window the existing purchase route relies on but never enforced.
-- ============================================================================

-- 1. credit_orders
CREATE TABLE IF NOT EXISTS credit_orders (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    razorpay_order_id   text UNIQUE NOT NULL,
    pack_id             text NOT NULL,
    credits             integer NOT NULL,
    amount_paise        integer NOT NULL,
    currency            text NOT NULL DEFAULT 'INR',
    status              text NOT NULL DEFAULT 'created'
                          CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
    razorpay_payment_id text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_orders_user
  ON credit_orders (user_id, created_at DESC);

ALTER TABLE credit_orders ENABLE ROW LEVEL SECURITY;

-- Users may read their own orders; only service_role writes.
CREATE POLICY credit_orders_select_own ON credit_orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. UNIQUE on credit_transactions.razorpay_payment_id (partial — only when set)
-- A NULL razorpay_payment_id is fine for non-purchase transactions
-- (signup_bonus, video_debit, refund, etc.).
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_razorpay_payment_id
  ON credit_transactions (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- 3. Add 'refund' to the allowed transaction types so the admin/webhook
--    refund flow has a clean audit row.
ALTER TABLE credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('signup_bonus', 'purchase', 'video_debit', 'report_debit', 'referral', 'refund'));
