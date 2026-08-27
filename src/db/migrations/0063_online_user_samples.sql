-- Periodic snapshot of concurrent-online-user counts, sampled by a 5-minute
-- cron. Powers "peak concurrent users" per day/week/month/year in the
-- Telegram admin bot's /stats command (usersActiveBetween's lastActiveAt
-- proxy can't answer that — it has no history of past online-counts).
-- Hand-written (post-0050 convention): IF NOT EXISTS guards make this safe
-- to re-run.

CREATE TABLE IF NOT EXISTS "online_user_samples" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sampled_at" timestamp with time zone NOT NULL DEFAULT now(),
  "online_count" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "online_user_samples_sampled_at_idx"
  ON "online_user_samples" ("sampled_at");
