-- ============================================================================
-- 056: Fix Supabase advisor "Security Definer View" on public.pandits_public
--
-- The view was created in 046 without an explicit security_invoker option.
-- Postgres defaults views to run with the creator's privileges (effectively
-- SECURITY DEFINER), which bypasses RLS on the underlying tables.
--
-- Both underlying tables already have permissive SELECT policies for anon +
-- authenticated:
--   * pandits         — pandits_read_all              USING (true)   [032]
--   * pandit_profiles — pandit_profiles_select_all    USING (true)   [046]
-- so flipping the view to security_invoker = on is functionally a no-op for
-- callers, but ensures RLS is honored if either table is tightened later.
-- ============================================================================

ALTER VIEW public.pandits_public SET (security_invoker = on);
