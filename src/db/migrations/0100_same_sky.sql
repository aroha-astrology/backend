-- Same Sky rooms (v7 spec, Sprint 4). Ships OFF behind community.sameSky.
--
-- User-generated posts, so: every post starts PENDING, an automatic check publishes it (APPROVED) or sends it
-- to the admin queue / rejects it, readers can report a post and block an author, and an admin can approve,
-- reject or remove. A room is the reader's Moon sign (12 rooms); a reader posts only in their own room.
--
-- sky_posts.status: PENDING (waiting), APPROVED (visible), REJECTED (never shown), REMOVED (taken down later).
-- sky_reports: one row per reader per post (unique), 3 distinct reports pull an APPROVED post back to PENDING.
-- sky_blocks: the blocker no longer sees the blocked reader's posts.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

CREATE TABLE IF NOT EXISTS "sky_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room" text NOT NULL,
  "author_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'REMOVED')),
  "check_reason" text,
  "reviewed_by" text,
  "report_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "decided_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "sky_posts_room_idx" ON "sky_posts" ("room", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "sky_posts_author_idx" ON "sky_posts" ("author_user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "sky_posts_queue_idx" ON "sky_posts" ("status", "created_at") WHERE "status" = 'PENDING';

CREATE TABLE IF NOT EXISTS "sky_reports" (
  "post_id" uuid NOT NULL REFERENCES "sky_posts"("id") ON DELETE CASCADE,
  "reporter_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("post_id", "reporter_user_id")
);

CREATE TABLE IF NOT EXISTS "sky_blocks" (
  "blocker_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "blocked_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("blocker_user_id", "blocked_user_id")
);
