-- Sprint 1 gaps of the v7 build (2026-10-24). Every feature that uses these ships OFF.
--
-- 1. reports.charge_key: the wallet key of the purchase that paid for a report row
--    (money.refundKeys). A failed generation refunds under "refund:<charge_key>", so the
--    generation failure path and the stale-row reaper can never both pay the same refund.
--    Rewritten on every claim, so buying a failed report again refunds again if it fails again.
--    It also marks a Platinum Pass free report ("pass_free_report:<iso>"), whose failure gives
--    the free report back instead of money.
-- 2. users.pass_free_report_at: when the user last took the Platinum Pass free report
--    (money.platinumReport). One per Pass period.
-- 3. orders_app_store_txn_unique: one order per App Store transaction id (money.storekit), so a
--    replayed or shared receipt can never credit coins twice.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

ALTER TABLE "reports"
  ADD COLUMN IF NOT EXISTS "charge_key" text;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "pass_free_report_at" timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_app_store_txn_unique"
  ON "orders" ("gateway_order_id")
  WHERE "gateway_provider" = 'app_store';
