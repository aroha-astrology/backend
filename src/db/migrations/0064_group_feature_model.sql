-- Per-group model override, mirroring feature_flags.model (0058) at the group level: Admin ->
-- Groups can now pin a specific group to a specific model for an AI model-picker key (e.g. a
-- beta-test group on gemini-3.1-pro while everyone else stays on the global default) instead of
-- the model choice being all-or-nothing for every user. Nullable: a row with no model, or a
-- disabled row, inherits the global feature_flags.model choice — same fallback chain the
-- existing per-user `enabled` override already uses. See modelForUser() in features.service.ts.
ALTER TABLE "feature_flag_group_overrides" ADD COLUMN IF NOT EXISTS "model" text;
