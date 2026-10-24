-- Google Play refunds (2026-10-24). Google lets a buyer get their money back
-- (within 48 hours from Google itself, later through us, or as a bank
-- chargeback) and nothing in the app ever heard about it: the order stayed
-- `paid` and the wallet kept the money. The hourly check
-- (billing/play-refunds.service.ts) reads Google's voided-purchases list and
-- the RTDN voided-purchase notice, and records every refund here.
--
--   play_refunds            one row per refunded Google order. `refund_key` is
--                           Google's order id (a Pass renewal refund shares the
--                           purchase token with the rest of the subscription).
--                           status: recorded (switch off, nothing taken back),
--                           clawed_back, skipped (our order was not paid),
--                           pass (a subscription; Google ends the Pass), unmatched.
--   users.purchases_blocked_at   set after a second refund: no more top-ups or
--                           packs until an admin unblocks the account.
--   reports.refund_locked_at     a report bought with refunded money, closed
--                           while the wallet is below zero.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.
-- Journal `when` sits between 0099 and the v7 branch's 0094+ (1792800000000),
-- so drizzle still applies those after this one.

CREATE TABLE IF NOT EXISTS "play_refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "refund_key" text NOT NULL,
  "purchase_token" text NOT NULL,
  "google_order_id" text,
  "kind" text NOT NULL,
  "product_id" text,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "order_id" uuid REFERENCES "orders"("id") ON DELETE SET NULL,
  "amount_paise" integer DEFAULT 0 NOT NULL,
  "question_credits" integer DEFAULT 0 NOT NULL,
  "status" text NOT NULL,
  "clawed_back_paise" integer DEFAULT 0 NOT NULL,
  "clawed_back_questions" integer DEFAULT 0 NOT NULL,
  "clawed_back_at" timestamp with time zone,
  "reports_locked" integer DEFAULT 0 NOT NULL,
  "voided_at" timestamp with time zone,
  "purchased_at" timestamp with time zone,
  "voided_source" integer,
  "voided_reason" integer,
  "detected_via" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "play_refunds_refund_key_idx" ON "play_refunds" ("refund_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "play_refunds_user_id_idx" ON "play_refunds" ("user_id");
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "purchases_blocked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "refund_locked_at" timestamp with time zone;
