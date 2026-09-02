-- Self-reported income ranges, collected in chat as a one-tap answer when a
-- money question needs a scale to read against. Plain text (not an enum): the
-- bracket table lives in src/lib/chat-income.ts and will be retuned.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "income_bracket" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "family_income_bracket" text;
