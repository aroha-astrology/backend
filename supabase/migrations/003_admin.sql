-- ============================================================================
-- 003: Admin role
-- ============================================================================

-- Add is_admin column to users table
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- ============================================================================
-- Admin check helper — SECURITY DEFINER so the inner SELECT bypasses RLS
-- on the users table. Without this, an admin RLS policy that queries users
-- recursively triggers itself (Postgres error 42P17 "infinite recursion
-- detected in policy for relation \"users\"").
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false);
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ============================================================================
-- Admin RLS policies — service-role key bypasses RLS entirely,
-- but expose read-all policies for authenticated admins as well
-- ============================================================================

-- Allow admins to read ALL users
DROP POLICY IF EXISTS "admin_users_select_all" ON users;
CREATE POLICY "admin_users_select_all" ON users
    FOR SELECT USING (public.is_admin());

-- Allow admins to read ALL neural_pathways
DROP POLICY IF EXISTS "admin_neural_pathways_select_all" ON neural_pathways;
CREATE POLICY "admin_neural_pathways_select_all" ON neural_pathways
    FOR SELECT USING (public.is_admin());

-- Allow admins to read ALL generated_reports
DROP POLICY IF EXISTS "admin_generated_reports_select_all" ON generated_reports;
CREATE POLICY "admin_generated_reports_select_all" ON generated_reports
    FOR SELECT USING (public.is_admin());
