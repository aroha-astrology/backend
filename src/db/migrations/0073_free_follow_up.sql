-- When this account last used its free chat follow-up tap — one per 3 days,
-- enforced by users.repo.ts's claimFreeFollowUp (conditional UPDATE), not
-- the client. See lib/chat-follow-up.ts.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS guard makes this safe
-- to re-run. See 0072_next_report_vote.sql.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "last_free_follow_up_at" timestamp with time zone;
