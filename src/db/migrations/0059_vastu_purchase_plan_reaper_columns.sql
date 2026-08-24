-- Supports the vastu/purchase-plan stale-generating reapers (vastu.service.ts's
-- reapStaleVastuPlans, purchase-plan.service.ts's reapStaleProcessingPlans) — same
-- self-heal as the existing reports/palm reapers, applied to the two features that were
-- missing it. vastu_plans.price_paid_paise mirrors palm_readings.price_paid_paise: the
-- amount actually deducted at charge time, so a reap refunds exactly that and never a
-- re-derived (possibly since-changed) feature price. Both tables' started_at is stamped by
-- markProcessing and is what the reaper's staleness query filters on.
ALTER TABLE "vastu_plans" ADD COLUMN IF NOT EXISTS "price_paid_paise" integer;
ALTER TABLE "vastu_plans" ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;
ALTER TABLE "purchase_plans" ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;
