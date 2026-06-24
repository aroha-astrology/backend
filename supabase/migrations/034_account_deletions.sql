-- Logs the reason a user gave when deleting their account, then performs the
-- delete. The row is inserted BEFORE auth.users is removed so we keep the
-- feedback even after the user (and all their data) is gone. There is no FK
-- back to auth.users so the row survives the cascade.

CREATE TABLE IF NOT EXISTS public.account_deletions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  email        text,
  reasons      text[] NOT NULL DEFAULT '{}',
  other_reason text,
  deleted_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_deletions_deleted_at_idx
  ON public.account_deletions (deleted_at DESC);

ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;

-- No policies: only SECURITY DEFINER functions and the service_role can read /
-- write this table. Authenticated users cannot query it directly.

-- Replace the existing delete_my_account() with a version that records the
-- user's reason. Default args keep the mobile app's no-arg `rpc('delete_my_account')`
-- call working unchanged.
CREATE OR REPLACE FUNCTION public.delete_my_account(
  p_reasons      text[] DEFAULT '{}',
  p_other_reason text   DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO public.account_deletions (user_id, email, reasons, other_reason)
  VALUES (v_uid, v_email, COALESCE(p_reasons, '{}'), NULLIF(trim(p_other_reason), ''));

  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account(text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account(text[], text) TO authenticated;
