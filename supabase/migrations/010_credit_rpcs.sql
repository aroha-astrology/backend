-- ============================================================================
-- Migration 010: Add increment_credits RPC + credits-balance helpers
--
-- Problem: /api/credits/redeem calls supabase.rpc('increment_credits', ...)
-- but no migration ever created that function. The call always errored, the
-- fallback direct UPDATE then ran with the user's RLS context, and any
-- silent RLS denial left the row unchanged → user saw their balance bump
-- locally (frontend setCredits) but on reload the DB still held the old
-- value, so the navbar reverted to 0.
--
-- Fix: Create increment_credits with SECURITY DEFINER so coupons and
-- purchases reliably credit the user.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_credits(p_user_id uuid, p_amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_credits int;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Amount must be positive';
  END IF;

  UPDATE users
     SET credits = COALESCE(credits, 0) + p_amount
   WHERE id = p_user_id
  RETURNING credits INTO v_new_credits;

  IF v_new_credits IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: No users row for id %', p_user_id;
  END IF;

  RETURN v_new_credits;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_credits(uuid, int) TO authenticated;
