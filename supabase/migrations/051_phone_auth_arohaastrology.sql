-- ============================================================================
-- Migration 051: Rename phantom email domain to arohaastrology.in
--
-- Phantom emails are internal-only identifiers used to satisfy Supabase auth's
-- requirement that every account has an email, for users who sign in by phone.
-- Users never see them. This migration:
--   1. Updates handle_new_user() to strip the new @phone.arohaastrology.in
--      suffix (also keeps stripping the legacy @phone.jyotishai.app suffix as
--      a safety net during the deploy window).
--   2. Rewrites existing phantom emails in auth.users from the old domain to
--      the new one.
--
-- Run order matters: trigger update first, then data migration. Both are
-- idempotent — re-running this migration is safe.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Update the new-user trigger to recognise the new phantom domain
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  v_email := CASE
    WHEN NEW.email LIKE '%@phone.arohaastrology.in' THEN NULL
    WHEN NEW.email LIKE '%@phone.jyotishai.app'      THEN NULL  -- legacy
    ELSE NEW.email
  END;

  INSERT INTO public.users (id, email, phone, name, credits)
  VALUES (
    NEW.id,
    v_email,
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', ''),
    2
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 2, 'signup_bonus', 'Welcome bonus credits')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Dry-run: how many auth users carry the old phantom domain?
--    (Comment out / inspect before running step 3.)
-- ----------------------------------------------------------------------------
-- SELECT COUNT(*) AS legacy_phantom_users
-- FROM auth.users
-- WHERE email LIKE '%@phone.jyotishai.app';

-- ----------------------------------------------------------------------------
-- 3. Rewrite legacy phantom emails to the new domain
--    Safe because:
--      - auth.users.email has a unique index, but old and new suffixes
--        cannot collide (the local part is the phone number, which is
--        unique per user already).
--      - public.users.email already holds NULL for these rows (the old
--        trigger stripped them on insert), so no downstream fixup needed.
-- ----------------------------------------------------------------------------
UPDATE auth.users
SET email = REPLACE(email, '@phone.jyotishai.app', '@phone.arohaastrology.in')
WHERE email LIKE '%@phone.jyotishai.app';

-- ----------------------------------------------------------------------------
-- 4. Sanity check (run manually after the UPDATE; should return 0):
-- ----------------------------------------------------------------------------
-- SELECT COUNT(*) AS remaining_legacy
-- FROM auth.users
-- WHERE email LIKE '%@phone.jyotishai.app';
