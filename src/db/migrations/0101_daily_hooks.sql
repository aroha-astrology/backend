-- Daily-return hooks (v7 spec, Sprint 6). Every feature ships OFF behind its own `hooks.*` switch.
--
-- hook_progress: one row per user, hook, profile and local day, with a small JSON body each hook
--   shapes itself (scroll progress, beads counted, a diya lit, a receipt verdict, a scratch card).
-- hook_unlocks: a paid or earned unlock; (user, hook, ref) is unique, so a retry or a second device
--   can never charge or grant twice. ref is "<feature>:<profile>:<local_date>" style.
-- hook_push_log: every hook push sent, per user and local day, for the daily cap.
-- hook_alarms: "tell me N minutes before" pushes (Shubh-Labh window, text peak); sent_at is set when
--   the alarm sender has handled it.
-- sleep_logs: the manual 1-5 sleep score with the Moon nakshatra of that night.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

CREATE TABLE IF NOT EXISTS "hook_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "hook" text NOT NULL,
  "profile_key" text NOT NULL DEFAULT '',
  "local_date" text NOT NULL,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "hook_progress_uq"
  ON "hook_progress" ("user_id", "hook", "profile_key", "local_date");
CREATE INDEX IF NOT EXISTS "hook_progress_hook_date_idx"
  ON "hook_progress" ("hook", "local_date");

CREATE TABLE IF NOT EXISTS "hook_unlocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "hook" text NOT NULL,
  "ref" text NOT NULL,
  "coins" integer NOT NULL DEFAULT 0 CHECK ("coins" >= 0),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "hook_unlocks_uq" ON "hook_unlocks" ("user_id", "hook", "ref");

CREATE TABLE IF NOT EXISTS "hook_push_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "local_date" text NOT NULL,
  "hook" text NOT NULL,
  "sent_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "hook_push_log_user_date_idx" ON "hook_push_log" ("user_id", "local_date");

CREATE TABLE IF NOT EXISTS "hook_alarms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "hook" text NOT NULL,
  "ref" text NOT NULL,
  "fire_at" timestamptz NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "link" text,
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "hook_alarms_uq" ON "hook_alarms" ("user_id", "hook", "ref");
CREATE INDEX IF NOT EXISTS "hook_alarms_due_idx" ON "hook_alarms" ("fire_at") WHERE "sent_at" IS NULL;

CREATE TABLE IF NOT EXISTS "sleep_logs" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "local_date" text NOT NULL,
  "score" smallint NOT NULL CHECK ("score" BETWEEN 1 AND 5),
  "nakshatra_index" smallint NOT NULL CHECK ("nakshatra_index" BETWEEN 0 AND 26),
  "sign_index" smallint NOT NULL CHECK ("sign_index" BETWEEN 0 AND 11),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "local_date")
);
