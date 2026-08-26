-- =============================================================================
-- Public (anonymous) support tickets
-- =============================================================================
-- Hand-written, not drizzle-kit-generated — same reason as every migration
-- from 0050 onward (see 0053's own comment): the last drizzle-kit snapshot on
-- disk predates them, so `generate` diffs against a stale baseline. Follows
-- 0052/0053's pattern: defensive IF NOT EXISTS / duplicate_object guards, one
-- file, no statement-breakpoint markers.
--
-- Lets a support ticket exist without an account. The public /support form on
-- the landing site (no login) has no userId to attach a ticket to, so
-- contact_name/contact_email are the fallback identity. The CHECK constraint
-- guarantees every ticket carries ONE of the two.
-- =============================================================================

ALTER TABLE "support_tickets" ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "contact_name" text;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "contact_email" text;

DO $$ BEGIN
  ALTER TABLE "support_tickets"
    ADD CONSTRAINT "support_tickets_identity_check"
    CHECK ("user_id" IS NOT NULL OR "contact_email" IS NOT NULL);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
