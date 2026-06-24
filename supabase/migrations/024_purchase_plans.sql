-- ============================================================================
-- 024: purchase_plans — AI-powered Vedic purchase timing analysis
-- ============================================================================

CREATE TABLE IF NOT EXISTS purchase_plans (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart_id              uuid        REFERENCES kundli_charts(id) ON DELETE SET NULL,

  -- Purchase category & dynamic metadata
  category              text        NOT NULL CHECK (category IN ('vehicle','home','commercial','other')),
  metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- per-category fields
  cost_bracket          text,

  -- User-supplied dates (nullable = not provided)
  booking_date          date,
  delivery_date         date,

  -- Resolved dates after fallback logic (always set)
  resolved_booking_date  date       NOT NULL,
  resolved_delivery_date date       NOT NULL,

  -- The panchang page date context when submitted
  panchang_date         date        NOT NULL,

  -- Language for the AI response
  language              text        NOT NULL DEFAULT 'en',

  -- AI analysis lifecycle
  status                text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','processing','done','error')),
  analysis              jsonb,
  error_message         text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_purchase_plans_user
  ON purchase_plans (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_plans_status
  ON purchase_plans (status)
  WHERE status IN ('pending', 'processing');

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE purchase_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_purchase_plans"
  ON purchase_plans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can update analysis results without RLS interference
CREATE POLICY "service_role_update_purchase_plans"
  ON purchase_plans FOR UPDATE
  USING (true);
