-- Tracks when an admin most recently flipped a feature flag from off to on.
-- Powers the report catalogue's "New" badge (config/reports.ts's
-- computeIsNewReport) — a report shows "New" for NEW_REPORT_WINDOW_MS after
-- this timestamp. Set only on that false->true transition (see
-- admin.service.ts's updateFeature); a price/model-only edit while already
-- enabled leaves it untouched, and a row with no override yet has no value
-- here at all.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS guard makes this safe
-- to re-run. See 0070_wallet_credit_lots.sql.

ALTER TABLE "feature_flags"
  ADD COLUMN IF NOT EXISTS "enabled_at" timestamp with time zone;
