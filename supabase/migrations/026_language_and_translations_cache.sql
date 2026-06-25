-- ============================================================================
-- 026: language_and_translations_cache
-- 1. Relax users.language CHECK to cover all 20 supported UI language codes
-- 2. New translations_cache table — shared UI string cache across all users
--    so /api/translate returns DB hits instead of calling NIM for known strings
-- ============================================================================

-- ── 1. Expand users.language constraint ──────────────────────────────────────
-- Previous constraint only covered 9 codes; LanguageSwitcher offers 20.
-- Existing rows are all valid under the new constraint — no backfill needed.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_language_check;
ALTER TABLE users ADD CONSTRAINT users_language_check
  CHECK (language IN (
    'en','hi','bn','ta','te','mr','gu','kn','ml',
    'pa','or','ur','ne','sa','es','fr','de','ar','zh','ja'
  ));

-- ── 2. Shared UI string translation cache ────────────────────────────────────
-- Keyed by (source_text, target_lang). Populated by /api/translate on NIM
-- miss; read before calling NIM on subsequent requests from any user.
-- Admin-only writes (service role); no RLS required.
CREATE TABLE IF NOT EXISTS translations_cache (
  source_text     text        NOT NULL,
  target_lang     text        NOT NULL,
  translated_text text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_text, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_translations_cache_lang
  ON translations_cache (target_lang);
