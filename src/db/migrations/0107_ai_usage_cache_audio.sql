-- 2026-11-05 (audit sprint 6, L10 + L9): two telemetry columns on ai_usage.
--
--   cached_tokens  input tokens the provider served from its prompt cache (the compat endpoint
--                  reports usage.prompt_tokens_details.cached_tokens, and omits it when 0).
--                  NULL = row written before this column existed; 0 = reported, none cached.
--   audio_seconds  voice only: seconds of audio the minted token could cover (60 per paid minute).
--                  The conversation streams browser-to-Google, so this server never sees the real
--                  talk time; the cost view prices it as an upper bound per minute.
--
-- Hand-written (post-0050 convention): ADD COLUMN IF NOT EXISTS makes this safe to re-run.

ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "cached_tokens" integer;
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "audio_seconds" integer;
