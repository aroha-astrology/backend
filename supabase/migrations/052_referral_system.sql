-- ============================================================================
-- 052: 6-digit referral system
--
-- Replaces the ad-hoc "first 8 chars of user.id" scheme with a real
-- referral_code column on users and a dedicated bonus-payout RPC.
--
-- Flow:
--   1. User A signs up → trigger generates a unique 6-digit referral_code.
--   2. User A shares code via WhatsApp / Telegram / SMS.
--   3. User B signs up with the code → phone-signin route sets
--      B.referred_by = A.id (referral_bonus_paid stays false).
--   4. User B finishes onboarding (first birth_profiles row inserted) →
--      kundli/generate route calls pay_referral_bonus(B.id).
--   5. RPC atomically: marks B.referral_bonus_paid = true, credits B +10
--      Dhanam and A +20 Dhanam, inserts a notification row for A.
--
-- The pay_referral_bonus RPC is idempotent — re-runs are no-ops.
-- ============================================================================

-- ---- 1. Schema additions on users -----------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code            varchar(6),
  ADD COLUMN IF NOT EXISTS referred_by              uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_bonus_paid      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_popup_seen_at   timestamptz;

-- Self-referral guard
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_referred_by_not_self'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_referred_by_not_self
      CHECK (referred_by IS NULL OR referred_by <> id);
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_uidx
  ON users (referral_code);

CREATE INDEX IF NOT EXISTS users_referred_by_idx
  ON users (referred_by) WHERE referred_by IS NOT NULL;

-- ---- 2. generate_referral_code() ------------------------------------------
-- Returns a 6-digit numeric code (100000–999999) that doesn't collide with
-- any existing users.referral_code. Caps at 20 attempts to avoid runaway.

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS varchar(6)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code     varchar(6);
  v_attempts int := 0;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    v_code := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');

    -- Check collision; on miss, return the code.
    IF NOT EXISTS (SELECT 1 FROM users WHERE referral_code = v_code) THEN
      RETURN v_code;
    END IF;

    IF v_attempts >= 20 THEN
      RAISE EXCEPTION 'REFERRAL_CODE_GEN_FAILED: 20 collisions in a row';
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_referral_code() TO authenticated;

-- ---- 3. Backfill existing users -------------------------------------------
-- One-at-a-time loop with retry, since collisions are possible on a bulk pass.

DO $$
DECLARE
  r record;
  v_attempts int;
BEGIN
  FOR r IN SELECT id FROM users WHERE referral_code IS NULL LOOP
    v_attempts := 0;
    LOOP
      v_attempts := v_attempts + 1;
      BEGIN
        UPDATE users
           SET referral_code = lpad((floor(random() * 900000) + 100000)::int::text, 6, '0')
         WHERE id = r.id;
        EXIT;  -- success, leave inner loop
      EXCEPTION WHEN unique_violation THEN
        IF v_attempts >= 20 THEN
          RAISE EXCEPTION 'BACKFILL_FAILED for user %', r.id;
        END IF;
        -- else: try again
      END;
    END LOOP;
  END LOOP;
END$$;

-- ---- 4. Extend handle_new_user() to assign a code on signup ---------------
-- Re-create the trigger function preserving the existing welcome-bonus logic.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code varchar(6);
BEGIN
  v_code := public.generate_referral_code();

  INSERT INTO public.users (id, email, name, credits, referral_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', ''),
    2,
    v_code
  );

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 2, 'signup_bonus', 'Welcome bonus credits');

  RETURN NEW;
END;
$$;

-- ---- 5. pay_referral_bonus(invitee_id) RPC --------------------------------
-- Atomic + idempotent. Credits both users, inserts notification for referrer.

CREATE OR REPLACE FUNCTION public.pay_referral_bonus(p_invitee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id   uuid;
  v_invitee_name  text;
  v_first_name    text;
BEGIN
  -- Single atomic claim. If row was already paid OR has no referrer, this
  -- returns zero rows and we exit silently (idempotency guard).
  UPDATE users
     SET referral_bonus_paid = true
   WHERE id = p_invitee_id
     AND referral_bonus_paid = false
     AND referred_by IS NOT NULL
     AND referred_by <> id
  RETURNING referred_by INTO v_referrer_id;

  IF v_referrer_id IS NULL THEN
    RETURN;
  END IF;

  -- Credit the invitee (+10) and referrer (+20).
  PERFORM public.increment_credits(p_invitee_id, 10);
  INSERT INTO credit_transactions (user_id, amount, type, description)
  VALUES (p_invitee_id, 10, 'referral', 'Welcome bonus from referral code');

  PERFORM public.increment_credits(v_referrer_id, 20);
  INSERT INTO credit_transactions (user_id, amount, type, description)
  VALUES (v_referrer_id, 20, 'referral', 'Friend joined via your code');

  -- Notify the referrer. Use first name only to keep PII out of the bell feed.
  SELECT name INTO v_invitee_name FROM users WHERE id = p_invitee_id;
  v_first_name := COALESCE(NULLIF(split_part(COALESCE(v_invitee_name, ''), ' ', 1), ''), 'A friend');

  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  VALUES (
    v_referrer_id,
    'referral_bonus',
    '+20 Dhanam earned',
    v_first_name || ' joined using your code',
    '/referral',
    jsonb_build_object('invitee_id', p_invitee_id, 'amount', 20)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_referral_bonus(uuid) TO authenticated;
