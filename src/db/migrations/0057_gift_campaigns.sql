-- =============================================================================
-- gift_campaigns — admin-managed festival/occasion wallet-credit campaigns
-- =============================================================================
-- Replaces per-festival developer deploys (the old CLAIM_CAMPAIGNS array in
-- config/campaigns.ts, left untouched for its 3 historical entries) with an
-- admin-panel-driven table. Two delivery modes: self_claim (user taps a claim
-- button in the app — reuses the existing claim-bonus route/ledger idempotency)
-- and auto_credit (wallet is credited directly by the send/cron path, no user
-- action). `valid_from`/`valid_until` are stamped at send time from
-- `claim_window_days` — see gift-campaigns.service.ts.
--
-- wallet_transactions gains expires_at/expired_at so a gift can optionally
-- claw itself back if unspent — see gift-campaign-sweep.service.ts. This is
-- an approximation (LEAST(delta, current balance), no per-rupee spend
-- ordering), documented in the design spec.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE "gift_campaign_delivery_mode" AS ENUM ('self_claim', 'auto_credit');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "gift_campaign_status" AS ENUM ('draft', 'scheduled', 'sent', 'canceled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "gift_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "title" text NOT NULL,
  "amount_paise" integer NOT NULL,
  "audience_max_balance_paise" integer,
  "delivery_mode" "gift_campaign_delivery_mode" NOT NULL,
  "claim_window_days" integer,
  "credit_expiry_days" integer,
  "scheduled_send_at" timestamp with time zone,
  "status" "gift_campaign_status" NOT NULL DEFAULT 'draft',
  "valid_from" timestamp with time zone,
  "valid_until" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "gift_campaigns_key_unique" ON "gift_campaigns" ("key");
CREATE INDEX IF NOT EXISTS "gift_campaigns_status_idx" ON "gift_campaigns" ("status");

ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "expired_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "wallet_transactions_expires_at_idx"
  ON "wallet_transactions" ("expires_at")
  WHERE "expires_at" IS NOT NULL AND "expired_at" IS NULL;
