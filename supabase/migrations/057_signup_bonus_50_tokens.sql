-- ============================================================================
-- 057: signup_bonus_50_tokens
-- Bump new-user welcome bonus to 50 Dhanam (worth ~₹495 at starter-pack rate).
--
-- Supersedes migrations 043 (email signups: 5) and 051 (phone signups: 2).
-- Updates:
--   1. public.users.credits default → 50
--   2. handle_new_user() trigger — same value for email and phone signups,
--      keeps the phantom-email stripping logic from 051.
-- ============================================================================

ALTER TABLE public.users ALTER COLUMN credits SET DEFAULT 50;

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
    50
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 50, 'signup_bonus', 'Welcome bonus — 50 Dhanam (worth ₹495)')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
