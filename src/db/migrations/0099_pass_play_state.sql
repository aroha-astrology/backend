-- Aroha Pass lifecycle fixes (2026-10-23 audit). A Google Play Pass now keeps
-- Google's own view of it:
--   play_state        Google's subscriptionState (SUBSCRIPTION_STATE_ACTIVE,
--                     _IN_GRACE_PERIOD, _ON_HOLD, _PAUSED, _CANCELED, _EXPIRED, ...).
--                     Drives the "payment failed" notices and banner.
--   latest_order_id   the latest SUCCESSFUL Play order (lineItems[].latestSuccessfulOrderId).
--                     A renewal is a new paid order, never just a later expiry: during a
--                     grace period Google keeps moving the expiry while nothing is paid.
--   play_synced_at    the last time the row was checked against Google (the hourly
--                     reconcile and the on-demand check use it to avoid asking too often).
-- Rows from before keep NULLs and are filled the next time they are synced.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "play_state" text;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "latest_order_id" text;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "play_synced_at" timestamp with time zone;
