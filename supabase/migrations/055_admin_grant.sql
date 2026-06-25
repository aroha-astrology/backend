-- ============================================================================
-- 055: Add 'admin_grant' to credit_transactions type constraint
-- ============================================================================

ALTER TABLE credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN (
    'signup_bonus', 'purchase', 'video_debit', 'report_debit',
    'referral', 'refund', 'coupon_redeem', 'feature_debit',
    'chat_debit', 'jaap_reward', 'admin_grant'
  ));
