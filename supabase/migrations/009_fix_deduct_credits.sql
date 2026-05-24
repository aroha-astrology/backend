-- ============================================================================
-- Migration 009: Fix deduct_credits RPC
--
-- Problem: The 2-arg deduct_credits(uuid, int) function added in 008_coupons.sql
-- is missing SECURITY DEFINER. Without it, the inner UPDATE runs with the
-- caller's privileges and is filtered by RLS. Combined with the older 4-arg
-- overload from 001_initial.sql (which also takes uuid + int as the first two
-- positional params), PostgREST sometimes resolves the call ambiguously and
-- the UPDATE silently matches 0 rows → the function raises INSUFFICIENT_TOKENS
-- even when the user has plenty of credits.
--
-- Fix:
--   1. Drop both existing overloads to remove ambiguity.
--   2. Recreate a single canonical deduct_credits(uuid, int) RETURNS int with
--      SECURITY DEFINER + a fixed search_path.
-- ============================================================================

DROP FUNCTION IF EXISTS public.deduct_credits(uuid, int);
DROP FUNCTION IF EXISTS public.deduct_credits(uuid, int, text, text);

CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id uuid, p_amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_credits int;
BEGIN
  UPDATE users
     SET credits = credits - p_amount
   WHERE id = p_user_id
     AND credits >= p_amount
  RETURNING credits INTO v_new_credits;

  IF v_new_credits IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_TOKENS: Not enough tokens to complete this action';
  END IF;

  RETURN v_new_credits;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, int) TO authenticated;
