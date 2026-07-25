-- The admin_audit_log table already existed in production from the reverted
-- admin-console branch (0032's CREATE TABLE IF NOT EXISTS correctly avoided
-- clobbering it, but that also left it in its OLD shape: admin_firebase_uid
-- instead of the admin_phone column this codebase's logAdminAction expects).
-- Table has zero rows in production, so this is a pure additive/relaxing fix.
ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "admin_phone" text;
ALTER TABLE "admin_audit_log" ALTER COLUMN "admin_firebase_uid" DROP NOT NULL;
