-- ============================================================================
-- 031: Restore Supabase role grants on public schema
-- ----------------------------------------------------------------------------
-- After a `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` reset, the
-- ALTER DEFAULT PRIVILEGES that Supabase normally sets up for anon /
-- authenticated / service_role are gone. New tables created by subsequent
-- migrations therefore have NO grants for those roles -- PostgREST then
-- returns "permission denied for table users" on any read or write, even
-- when the RLS policy would have allowed it.
--
-- This migration:
--   1. Grants table/routine/sequence privileges on every existing object
--      in `public` to the three Supabase roles.
--   2. Sets ALTER DEFAULT PRIVILEGES so any object created by `postgres`
--      in `public` going forward inherits those grants automatically.
--
-- Idempotent: GRANT is a no-op if already granted; ALTER DEFAULT PRIVILEGES
-- silently re-asserts the same default.
-- ============================================================================

-- Make sure each role can at least enter the schema
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Privileges on existing objects
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO anon, authenticated, service_role;

-- Default privileges so future objects (created by postgres) auto-grant
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON ROUTINES  TO anon, authenticated, service_role;
