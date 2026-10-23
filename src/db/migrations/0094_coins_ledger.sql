-- Aroha Coins groundwork (v7 spec, Sprint 1). 1 coin = 1 rupee = 100 paise, so the
-- wallet stays in paise and nothing about existing balances changes.
--
-- 1. wallet_transactions.idempotency_key: a charge, a grant or a refund can carry a key;
--    a second write with the same (user, key) is refused by the unique index, so a retried
--    request can never charge twice and a refund can never be paid twice.
-- 2. users.free_profiles_used: how many of the free extra-profile slots a user has taken
--    (counted when used, so deleting a free profile does not hand the slot back).
-- 3. users.signup_drip: set on accounts created while the 3-stage signup bonus is on, so the
--    day-2 and first-profile stages are only ever paid to those accounts.
--
-- 4. feature_flags.audience: which section a feature is for - 'all', 'classic' (the Indian look)
--    or 'cosmic' (the international look). NULL = the registry default. Set from Admin -> Features.
-- 5. users.ui_skin: the experience the user picked ('CLASSIC_VEDIC' or 'MODERN_COSMIC'). NULL = not
--    picked yet, which counts as classic (today's look). Read by the audience filter; the picker
--    itself arrives with the two looks.
--
-- 6. orders.charged_minor: what a coin-pack order actually charged, in the minor unit of its own
--    currency (cents, pence, paise). final_amount_paise stays the pack's RUPEE list price for every
--    order, so the admin revenue sums keep adding rupees; for a dollar buyer it is the list-price
--    equivalent, not the dollars received.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

ALTER TABLE "wallet_transactions"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_user_idem_unique"
  ON "wallet_transactions" ("user_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "free_profiles_used" smallint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "signup_drip" boolean DEFAULT false NOT NULL;

ALTER TABLE "feature_flags"
  ADD COLUMN IF NOT EXISTS "audience" text
    CHECK ("audience" IS NULL OR "audience" IN ('all', 'classic', 'cosmic'));

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "ui_skin" text
    CHECK ("ui_skin" IS NULL OR "ui_skin" IN ('CLASSIC_VEDIC', 'MODERN_COSMIC'));

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "charged_minor" integer;
