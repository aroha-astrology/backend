-- Admin-selectable model per AI feature (Admin -> Features renders a dropdown for any
-- FEATURE_REGISTRY entry carrying `modelOptions`). Nullable: a feature with no row, or a row
-- with a null model, resolves to its registry `defaultModel` and — when the row is disabled —
-- to the global GEMINI_MODEL. See modelOf() in features.service.ts.
ALTER TABLE "feature_flags" ADD COLUMN IF NOT EXISTS "model" text;
