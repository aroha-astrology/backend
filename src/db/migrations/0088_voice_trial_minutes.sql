-- Every user gets a few free voice-call minutes once (the voice trial, launched
-- for Durga Puja 2026), Pass or not. This column records how many of a
-- session's minutes were trial minutes, so the trial is counted across all of a
-- user's calls and kept apart from the monthly Pass minutes. `free_minutes`
-- still counts every free minute, trial ones included.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

ALTER TABLE "voice_sessions"
  ADD COLUMN IF NOT EXISTS "trial_minutes" integer DEFAULT 0 NOT NULL;
