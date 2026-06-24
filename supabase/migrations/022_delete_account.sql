-- Allows a signed-in user to permanently delete their own account.
-- SECURITY DEFINER lets the function run as the owning role (postgres),
-- which has permission to delete from auth.users.
-- Deleting from auth.users cascades to our public.users row (and all
-- child tables that reference it via ON DELETE CASCADE).

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard: only allow a signed-in user to delete themselves.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Only signed-in users may call this function.
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
