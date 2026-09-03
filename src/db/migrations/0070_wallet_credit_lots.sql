-- Expiring wallet credits become spendable "lots" so a spend can drain the
-- soonest-expiring grant FIRST, and expiry claws back only what is genuinely
-- unspent. Before this, wallet_transactions rows with an `expires_at` recorded
-- only the granted amount, so the expiry sweep clawed back
-- `min(granted, current balance)` — a user who was granted Rs 100, spent
-- Rs 100 and held Rs 500 of their own money lost the Rs 100 twice: once at the
-- spend, once at the clawback out of paid balance.
--
-- `remaining_paise` is set ONLY on credit rows that carry an `expires_at`;
-- NULL everywhere else (purchases, refunds, non-expiring bonuses, every debit)
-- so nothing else in the ledger changes shape. users.wallet_balance_paise
-- stays the single authoritative spendable total — this column is expiry
-- accounting only, never a second source of truth for what a user can spend.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS guards make this safe to
-- re-run. See 0056_remedy_insights.sql.

ALTER TABLE "wallet_transactions"
  ADD COLUMN IF NOT EXISTS "remaining_paise" integer;

-- Backfill live (granted, not yet swept) expiring grants as fully unspent.
-- That is exactly what the old min(granted, balance) clawback already assumed,
-- so no in-flight grant changes value as a result of this migration.
UPDATE "wallet_transactions"
  SET "remaining_paise" = "delta"
  WHERE "expires_at" IS NOT NULL
    AND "expired_at" IS NULL
    AND "delta" > 0
    AND "remaining_paise" IS NULL;

-- The drain runs on every debit, so keep it off a full per-user ledger scan.
CREATE INDEX IF NOT EXISTS "wallet_transactions_live_lots_idx"
  ON "wallet_transactions" ("user_id", "expires_at")
  WHERE "remaining_paise" > 0 AND "expired_at" IS NULL;
