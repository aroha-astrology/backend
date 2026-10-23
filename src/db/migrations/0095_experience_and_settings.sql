-- The two looks (v7 spec, Sprint 2) and the owner's Home layout.
--
-- 1. users.ui_skin_changed_at / ui_skin_free_change_used: the rule for switching the look. The first
--    pick (onboarding, or the one-time picker for an existing user) starts no cooldown. After it a
--    user gets ONE free change at any time; every later change needs ui_skin_changed_at + 30 days.
-- 2. ui_skin_changes: one row per pick or change, for support and the admin Users page.
-- 3. app_settings: small owner-edited JSON documents. Key 'home.layout' holds { draft, published }
--    for Admin -> Home Layout.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "ui_skin_changed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "ui_skin_free_change_used" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "ui_skin_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "from_skin" text,
  "to_skin" text NOT NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('first_pick', 'free_change', 'change', 'reset')),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ui_skin_changes_user_idx" ON "ui_skin_changes" ("user_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "app_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text
);
