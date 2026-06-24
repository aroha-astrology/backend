-- ============================================================================
-- 027: signup_bonus_100_tokens
-- Increase new-user welcome bonus from 2 → 100 credits.
-- Updates the handle_new_user trigger function and the column default.
-- ============================================================================

-- Update column default so any direct INSERT without specifying credits
-- also gets 100 (belt-and-suspenders alongside the trigger).
ALTER TABLE public.users ALTER COLUMN credits SET DEFAULT 100;

-- Replace the trigger function with 100-credit signup bonus.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, name, credits)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', ''),
        100
    )
    ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            name  = CASE WHEN public.users.name = '' OR public.users.name IS NULL
                         THEN EXCLUDED.name ELSE public.users.name END;

    INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (
        NEW.id,
        100,
        'signup_bonus',
        'Welcome bonus — 100 free tokens'
    );

    RETURN NEW;
END;
$$;
