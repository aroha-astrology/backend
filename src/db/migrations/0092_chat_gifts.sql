-- Gift questions: free chat questions given to users for an occasion
-- (Dussehra 2026: 2 questions to every existing user, until 21 Oct 23:59 IST).
-- Spent before the Pass, Question Pack credits and the wallet; a question that
-- gets no answer is given back. One row per user per campaign, so granting a
-- campaign twice never doubles it. See modules/pass/chat-gifts.repo.ts.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

CREATE TABLE IF NOT EXISTS "chat_gifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "campaign" text NOT NULL,
  "questions" integer NOT NULL,
  "used" integer DEFAULT 0 NOT NULL,
  "valid_until" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chat_gifts_user_campaign_unique" UNIQUE("user_id", "campaign"),
  CONSTRAINT "chat_gifts_used_in_range" CHECK ("used" >= 0 AND "used" <= "questions")
);
