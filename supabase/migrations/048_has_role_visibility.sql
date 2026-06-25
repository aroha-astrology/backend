-- ============================================================================
-- 048: Fix has_role() RPC visibility for service_role and force PostgREST
--      to reload its schema cache so new RPCs / columns from 047 appear in
--      the REST API immediately.
-- ============================================================================

-- service_role bypasses RLS but still needs EXECUTE to call SECURITY DEFINER
-- functions from server-side admin clients (scripts, webhooks, sync flush).
GRANT EXECUTE ON FUNCTION public.has_role(text) TO service_role;

-- Force PostgREST to reload the schema cache so /rpc/has_role and the new
-- 047 columns are visible to the JS client without a project restart.
NOTIFY pgrst, 'reload schema';
