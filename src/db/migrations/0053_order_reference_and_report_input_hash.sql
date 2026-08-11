-- =============================================================================
-- Purchase state machine + idempotency (architecture hardening, phase 1)
-- =============================================================================
-- Hand-written, not drizzle-kit-generated: the last snapshot on disk is
-- 0049 even though migrations exist through 0052 (those were hand-written
-- too, same as this one — see 0052's own file), so `drizzle-kit generate`
-- diffs against a stale baseline and reinvents already-applied objects. Not
-- fixed here; out of scope for this change. Follow 0052's pattern (defensive
-- IF NOT EXISTS / duplicate_object guards, one transaction, no
-- --> statement-breakpoint markers) rather than trusting the generator.
--
-- 1. orders: `reference` (short support-facing id) + `verified_at` (distinct
--    from `paid_at` — set when the gateway signature check passes). Existing
--    rows are backfilled with a generated reference before the NOT NULL/
--    unique constraint lands, since the column has no SQL-level default
--    (its default is application-side, via schema.ts's $defaultFn, which
--    only fires on new inserts).
-- 2. orders.status: adds 'refund_pending'/'refunded' — there was no refund
--    state for a top-up order at all before this (every refund elsewhere in
--    the codebase is a wallet-credit side effect with no queryable state).
-- 3. reports.input_hash: sha256(input), nullable. Existing partner-report
--    rows are left NULL (no backfill) — NULLs never collide in a unique
--    index, so this is safe, it just means those rows don't retroactively
--    gain dedup coverage until superseded by a fresh purchase.
-- 4. Two partial unique indexes closing the idempotency hole where
--    input-bearing reports (kundli_milan/partner/answer-bearing reports)
--    previously had no uniqueness constraint at all, so a repeated purchase
--    against the same partner details always inserted a fresh row and
--    charged twice.
-- =============================================================================

-- 1. orders.reference + verified_at ------------------------------------------
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reference" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone;

UPDATE "orders"
  SET "reference" = 'AR-' || upper(substr(md5(random()::text || "id"::text), 1, 8))
  WHERE "reference" IS NULL;

ALTER TABLE "orders" ALTER COLUMN "reference" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_reference_idx" ON "orders" ("reference");

-- 2. orders.status refund states ----------------------------------------------
DO $$ BEGIN
  ALTER TYPE "order_status" ADD VALUE IF NOT EXISTS 'refund_pending';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "order_status" ADD VALUE IF NOT EXISTS 'refunded';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. reports.input_hash --------------------------------------------------------
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "input_hash" text;

-- 4. partner-report idempotency ------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "reports_uniq_input_hash_primary"
  ON "reports" ("user_id", "report_key", "input_hash")
  WHERE "birth_profile_id" IS NULL AND "input" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "reports_uniq_input_hash_profile"
  ON "reports" ("user_id", "birth_profile_id", "report_key", "input_hash")
  WHERE "birth_profile_id" IS NOT NULL AND "input" IS NOT NULL;
