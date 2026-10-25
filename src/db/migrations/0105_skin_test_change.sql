-- 2026-10-25: the experience test switch (2c88cb6) logs a test group member's look change as
-- kind 'test_change', but 0095's CHECK only allowed the four original kinds, so every such
-- PUT /v1/me/experience failed with a 500 (ui_skin_changes_kind_check).
--
-- Hand-written (post-0050 convention): DROP ... IF EXISTS makes this safe to re-run.

ALTER TABLE "ui_skin_changes"
  DROP CONSTRAINT IF EXISTS "ui_skin_changes_kind_check",
  ADD CONSTRAINT "ui_skin_changes_kind_check"
    CHECK ("kind" IN ('first_pick', 'free_change', 'change', 'reset', 'test_change'));
