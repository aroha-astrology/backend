-- Admin -> Gemini Keys: switch any Gemini key off, paste more free or paid
-- keys, test them, and choose which paid key is tried first. A key from .env
-- gets a row (secret null) the first time the admin page lists it; a pasted
-- key keeps its secret here, encrypted. See lib/llm/gemini-keys.ts.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

CREATE TABLE IF NOT EXISTS "gemini_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fingerprint" text NOT NULL,
  "source" text NOT NULL,
  "name" text NOT NULL,
  "tier" text NOT NULL,
  "secret" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "paid_rank" integer DEFAULT 100 NOT NULL,
  "last_tested_at" timestamp with time zone,
  "last_test_ok" boolean,
  "last_test_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  CONSTRAINT "gemini_keys_fingerprint_unique" UNIQUE("fingerprint")
);
