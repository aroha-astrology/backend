-- ============================================================================
-- 047: Dual-role accounts + Astrologer B2B portal + Offline sync outbox
--
--   1. users.roles text[]  — replaces account_type as the source of truth.
--      account_type is kept (sync'd via trigger) so existing code paths keep
--      reading the "primary" role until they're refactored.
--   2. astrologer_customers extensions: phone, whatsapp, email, chart_data.
--   3. New B2B tables:
--        interaction_log     — Screen 3 timeline + Screen 10 ai_consultation log
--        consultation_slots  — Screen 6 calendar
--        astrologer_branding — Screen 5 reports + Screen 9 practice settings
--        astrologer_profiles — Screen 9 white-label multi-profile
--        sync_outbox         — offline write queue, idempotent by client_op_id
--   4. has_role() SECURITY DEFINER helper for layout role guards.
--   5. chat_conversations.ai_for_customer_id — premium AI chat routing.
-- ============================================================================

-- ── 1. Dual-role refactor — users.roles text[] ──────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{personal}';

-- Backfill from the existing single-value column. Each user gets exactly one
-- role, the one they had in account_type. Only touch rows still at the default.
UPDATE users
   SET roles = ARRAY[account_type]::text[]
 WHERE account_type IS NOT NULL
   AND roles = '{personal}';

-- Replace any existing CHECK on roles (idempotent migration support).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_known;
ALTER TABLE users
  ADD CONSTRAINT users_roles_known
  CHECK (roles <@ ARRAY['personal','astrologer','pandit','admin']::text[]);

CREATE INDEX IF NOT EXISTS users_roles_idx ON users USING gin(roles);

-- Trigger keeps users.account_type in sync with roles[1] so the existing
-- read sites (admin list, mobile register, etc.) keep functioning until they
-- are refactored to read roles directly.
CREATE OR REPLACE FUNCTION users_sync_account_type()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.account_type = COALESCE(NEW.roles[1], 'personal');
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS users_sync_account_type_trg ON users;
CREATE TRIGGER users_sync_account_type_trg
  BEFORE INSERT OR UPDATE OF roles ON users
  FOR EACH ROW EXECUTE FUNCTION users_sync_account_type();

-- ── 1.1. has_role() helper for RLS / layout role guards ─────────────────────
CREATE OR REPLACE FUNCTION public.has_role(p_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p_role = ANY(roles) FROM public.users WHERE id = auth.uid()),
    false
  );
$$;
GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated;

-- ── 2. astrologer_customers extensions ──────────────────────────────────────
ALTER TABLE astrologer_customers
  ADD COLUMN IF NOT EXISTS phone          text,
  ADD COLUMN IF NOT EXISTS whatsapp       text,
  ADD COLUMN IF NOT EXISTS email          text,
  ADD COLUMN IF NOT EXISTS chart_data     jsonb,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- ── 3. interaction_log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interaction_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES astrologer_customers(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('call','whatsapp','message','note','ai_consultation')),
  direction     text CHECK (direction IN ('outbound','inbound')),
  duration_sec  int,
  tag           text,
  body          text,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interaction_log_customer_idx
  ON interaction_log(customer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS interaction_log_astrologer_idx
  ON interaction_log(astrologer_id, occurred_at DESC);

ALTER TABLE interaction_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interactions_own" ON interaction_log;
DROP POLICY IF EXISTS "interactions_insert_own" ON interaction_log;
DROP POLICY IF EXISTS "interactions_update_own" ON interaction_log;
DROP POLICY IF EXISTS "interactions_delete_own" ON interaction_log;

CREATE POLICY "interactions_own"        ON interaction_log FOR SELECT USING (auth.uid() = astrologer_id);
CREATE POLICY "interactions_insert_own" ON interaction_log FOR INSERT WITH CHECK (auth.uid() = astrologer_id);
CREATE POLICY "interactions_update_own" ON interaction_log FOR UPDATE USING (auth.uid() = astrologer_id);
CREATE POLICY "interactions_delete_own" ON interaction_log FOR DELETE USING (auth.uid() = astrologer_id);

-- ── 4. consultation_slots ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consultation_slots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id   uuid REFERENCES astrologer_customers(id) ON DELETE SET NULL,
  start_at      timestamptz NOT NULL,
  end_at        timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','booked','completed','cancelled','no_show')),
  notes         text,
  fee_dhanam    int,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consultation_slots_astrologer_idx
  ON consultation_slots(astrologer_id, start_at);

ALTER TABLE consultation_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "slots_own"        ON consultation_slots;
DROP POLICY IF EXISTS "slots_insert_own" ON consultation_slots;
DROP POLICY IF EXISTS "slots_update_own" ON consultation_slots;
DROP POLICY IF EXISTS "slots_delete_own" ON consultation_slots;

CREATE POLICY "slots_own"        ON consultation_slots FOR SELECT USING (auth.uid() = astrologer_id);
CREATE POLICY "slots_insert_own" ON consultation_slots FOR INSERT WITH CHECK (auth.uid() = astrologer_id);
CREATE POLICY "slots_update_own" ON consultation_slots FOR UPDATE USING (auth.uid() = astrologer_id);
CREATE POLICY "slots_delete_own" ON consultation_slots FOR DELETE USING (auth.uid() = astrologer_id);

-- ── 5. astrologer_branding ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS astrologer_branding (
  astrologer_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  brand_name    text,
  logo_url      text,
  tagline       text,
  primary_color text,
  phone         text,
  email         text,
  address       text,
  website       text,
  pdf_footer    text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE astrologer_branding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branding_select_any" ON astrologer_branding;
DROP POLICY IF EXISTS "branding_mutate_own" ON astrologer_branding;

-- Public-readable (clients receiving a white-labelled PDF must be able to load
-- the brand details via a server endpoint that uses anon access).
CREATE POLICY "branding_select_any" ON astrologer_branding FOR SELECT USING (true);

CREATE POLICY "branding_mutate_own" ON astrologer_branding
  FOR ALL USING (auth.uid() = astrologer_id) WITH CHECK (auth.uid() = astrologer_id);

-- ── 6. astrologer_profiles (multi-profile white-label) ─────────────────────
CREATE TABLE IF NOT EXISTS astrologer_profiles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           text NOT NULL,
  caller_id      text,
  is_default     boolean NOT NULL DEFAULT false,
  branding_id    uuid REFERENCES astrologer_branding(astrologer_id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS astrologer_profiles_default_idx
  ON astrologer_profiles(astrologer_id) WHERE is_default;

ALTER TABLE astrologer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_own" ON astrologer_profiles;
CREATE POLICY "profiles_own" ON astrologer_profiles
  FOR ALL USING (auth.uid() = astrologer_id) WITH CHECK (auth.uid() = astrologer_id);

-- ── 7. sync_outbox (offline write queue) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_outbox (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_op_id  text NOT NULL,                  -- UUID v4 generated client-side
  table_name    text NOT NULL,                  -- 'astrologer_customers' | 'interaction_log' | ...
  op            text NOT NULL CHECK (op IN ('insert','update','delete')),
  payload       jsonb NOT NULL,
  client_ts     timestamptz NOT NULL,
  synced_at     timestamptz,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_op_id)
);

CREATE INDEX IF NOT EXISTS sync_outbox_pending_idx
  ON sync_outbox(user_id) WHERE synced_at IS NULL;

ALTER TABLE sync_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outbox_own" ON sync_outbox;
CREATE POLICY "outbox_own" ON sync_outbox
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 8. chat_conversations: premium-AI routing column ────────────────────────
-- Allows the existing /api/chat endpoint to attribute a conversation to a
-- specific astrologer-customer when astrologers use the premium AI tool.
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS ai_for_customer_id uuid REFERENCES astrologer_customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS chat_conversations_ai_customer_idx
  ON chat_conversations(ai_for_customer_id) WHERE ai_for_customer_id IS NOT NULL;
