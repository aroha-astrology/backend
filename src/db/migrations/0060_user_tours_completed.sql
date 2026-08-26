-- Server-side truth for "the user has already seen this tour". Previously the app tour
-- tracked itself in localStorage only, which forgets on reinstall or a second device, so a
-- one-time tour replayed. Same house rule FeedbackPrompt already follows: server first,
-- localStorage as a mirror.
--
-- One jsonb array of tour ids rather than a boolean column per screen — adding an 11th tour
-- is then a frontend-only change with no migration. Backfilled to '[]' so existing rows are
-- "has seen nothing"; the frontend backfills the legacy aroha_tour_completed localStorage
-- key into 'home' on that user's next load so nobody re-sees the tour they already took.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tours_completed" jsonb DEFAULT '[]'::jsonb NOT NULL;
