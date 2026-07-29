-- ============================================================================
-- 058: credits_to_wallet_balance
-- Same conversion as the live backend (see jyotish-backend/src's
-- 0024_credits_to_wallet_balance.sql): 1 credit = Rs 10 = 1000 paise.
-- This system has no live traffic, but gets the same treatment for
-- codebase consistency.
-- ============================================================================

-- users
ALTER TABLE public.users RENAME COLUMN credits TO wallet_balance_paise;
UPDATE public.users SET wallet_balance_paise = wallet_balance_paise * 1000;
ALTER TABLE public.users ALTER COLUMN wallet_balance_paise SET DEFAULT 50000;

-- credit_transactions -> wallet_transactions
ALTER TABLE public.credit_transactions RENAME TO wallet_transactions;
UPDATE public.wallet_transactions SET amount = amount * 1000;

-- credit_orders -> wallet_orders; drop the now-redundant separate credits count
-- (post-conversion, granted amount == amount_paise, always 1:1)
ALTER TABLE public.credit_orders RENAME TO wallet_orders;
ALTER TABLE public.wallet_orders DROP COLUMN credits;

-- RPCs embed the column name as literal SQL text, so the rename above breaks
-- them until redefined here.
CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id uuid, p_amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance int;
BEGIN
  UPDATE users
     SET wallet_balance_paise = wallet_balance_paise - p_amount
   WHERE id = p_user_id
     AND wallet_balance_paise >= p_amount
  RETURNING wallet_balance_paise INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_TOKENS: Not enough balance to complete this action';
  END IF;

  RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_credits(p_user_id uuid, p_amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance int;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Amount must be positive';
  END IF;

  UPDATE users
     SET wallet_balance_paise = COALESCE(wallet_balance_paise, 0) + p_amount
   WHERE id = p_user_id
  RETURNING wallet_balance_paise INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: No users row for id %', p_user_id;
  END IF;

  RETURN v_new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_credits(uuid, int) TO authenticated;

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

  INSERT INTO public.users (id, email, phone, name, wallet_balance_paise)
  VALUES (
    NEW.id,
    v_email,
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', ''),
    50000
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.wallet_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 50000, 'signup_bonus', 'Welcome bonus — Rs 500')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
