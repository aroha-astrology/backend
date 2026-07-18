-- Rename users.credits -> wallet_balance_paise, converting every existing
-- credit-count balance to its paise equivalent at the fixed rate of
-- 1 credit = Rs 10 = 1000 paise.
ALTER TABLE users RENAME COLUMN credits TO wallet_balance_paise;
UPDATE users SET wallet_balance_paise = wallet_balance_paise * 1000;
ALTER TABLE users ALTER COLUMN wallet_balance_paise SET DEFAULT 50000;

-- Rename the ledger table + convert its historical amounts the same way.
ALTER TABLE credit_transactions RENAME TO wallet_transactions;
UPDATE wallet_transactions SET delta = delta * 1000, balance_after = balance_after * 1000;
ALTER INDEX credit_transactions_user_id_idx RENAME TO wallet_transactions_user_id_idx;

-- orders.credits becomes redundant once top-up is always 1:1 with the
-- amount actually paid (amountPaise/finalAmountPaise) — see billing.service.ts.
ALTER TABLE orders DROP COLUMN credits;