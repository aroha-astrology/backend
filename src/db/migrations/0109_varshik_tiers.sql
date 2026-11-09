-- 2026-11-09: Varshik Rashifal 2027 sold in three tiers (basic / gold / complete). The report is
-- always written in full; the tier only decides which pages the reader sees (frontend filters by
-- page key). Prices and card text live here so the owner edits them in Admin without a deploy.
-- The server charges the price from this table, never one sent by the client.
--
-- Hand-written (post-0050 convention): every statement is safe to re-run.

CREATE TABLE IF NOT EXISTS "varshik_pricing_tiers" (
  "tier_slug" text PRIMARY KEY CHECK ("tier_slug" IN ('basic', 'gold', 'complete')),
  "display_name" text NOT NULL,
  "subtitle" text NOT NULL,
  "badge_text" text,
  "price_paise" integer NOT NULL CHECK ("price_paise" >= 0),
  "original_price_paise" integer CHECK ("original_price_paise" IS NULL OR "original_price_paise" >= 0),
  "page_count" integer NOT NULL CHECK ("page_count" > 0),
  "short_description" text NOT NULL,
  "features" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "excludes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_popular" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 1,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Which tier a purchased report was bought at. Null on every other report key.
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "tier" text;

INSERT INTO "varshik_pricing_tiers"
  ("tier_slug", "display_name", "subtitle", "badge_text", "price_paise", "original_price_paise",
   "page_count", "short_description", "features", "excludes", "is_popular", "sort_order")
VALUES
(
  'basic', 'Varshik Snapshot', 'Essential scores and core charts', NULL, 29900, 49900, 20,
  'Your 2027 scores and core charts at a glance: birth and Varsha charts, doshas, yogas, remedies, the seven life-area scores and your twelve monthly scores, without the written deep dives.',
  '["20-page personalised report","Overall 2027 score, Year Lord and Muntha","Birth chart, birth stars and two Varsha charts","Doshas, yogas and simple remedies","Seven life-area scores and the 12-month timing map (numbers only)"]'::jsonb,
  '["Detailed life-area readings","Golden windows, sky calendar and when-to-act dates","Month-by-month guide"]'::jsonb,
  false, 1
),
(
  'gold', 'Varshik Gold', 'Life areas, timing and your questions', 'MOST POPULAR', 59900, 99900, 34,
  'Deep readings for all seven life areas and your exact timing: golden windows, the sky calendar, when to act, plus the answers to the questions you told us about.',
  '["Everything in Varshik Snapshot","A full reading for each of the seven life areas","Golden windows, sky calendar, your stars and when to act","Answers to your own questions and what changes this year"]'::jsonb,
  '["Month-by-month guide"]'::jsonb,
  true, 2
),
(
  'complete', 'Varshik Sampoorna', 'The complete twelve-month almanac', 'BEST VALUE', 99900, 199900, 59,
  'The whole report, nothing left out. Everything in Gold plus two pages for every month from January to December: what the month holds and how to live it.',
  '["Everything in Varshik Gold","Two pages for every month, January to December","What to do and what to hold, month by month"]'::jsonb,
  '[]'::jsonb,
  false, 3
)
ON CONFLICT ("tier_slug") DO NOTHING;
