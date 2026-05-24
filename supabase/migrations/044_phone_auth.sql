-- ============================================================================
-- Migration 044: Phone-based auth support
-- Relaxes email NOT NULL so Firebase-verified phone users can sign in without
-- an email. Phantom emails (phone@phone.jyotishai.app) are stripped by the
-- updated trigger before being written to the public users table.
-- ============================================================================

-- 1. Drop the UNIQUE constraint that enforces NOT NULL semantics, then drop NOT NULL
ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_key;

-- 2. Partial unique indexes — only enforce uniqueness on non-null values
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON public.users(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON public.users(phone) WHERE phone IS NOT NULL;

-- 3. Update trigger to strip phantom emails and hydrate phone column
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
    WHEN NEW.email LIKE '%@phone.jyotishai.app' THEN NULL
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
