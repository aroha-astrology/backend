-- 045_astrologer.sql
-- Adds B2B astrologer portal: plan tiers, customer quota, customer profiles

-- Extend users table with astrologer fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_type    text DEFAULT 'personal'
    CHECK (account_type IN ('personal', 'astrologer')),
  ADD COLUMN IF NOT EXISTS astro_status    text DEFAULT NULL
    CHECK (astro_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS astro_plan      text DEFAULT NULL
    CHECK (astro_plan IN ('basic', 'premium', 'premium_plus')),
  ADD COLUMN IF NOT EXISTS customer_limit  int  DEFAULT 0;

-- Customer profiles managed by each approved astrologer
CREATE TABLE IF NOT EXISTS astrologer_customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  dob             date NOT NULL,
  birth_time      time,
  birth_place     text,
  gender          text CHECK (gender IN ('male', 'female', 'other')),
  notes           text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE astrologer_customers ENABLE ROW LEVEL SECURITY;

-- Astrologer can only see/manage their own customers
DROP POLICY IF EXISTS "Astrologer manages own customers" ON astrologer_customers;
CREATE POLICY "Astrologer manages own customers"
  ON astrologer_customers FOR ALL
  USING (auth.uid() = astrologer_id)
  WITH CHECK (auth.uid() = astrologer_id);

-- Admins can read all customers
DROP POLICY IF EXISTS "Admin reads all customers" ON astrologer_customers;
CREATE POLICY "Admin reads all customers"
  ON astrologer_customers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Index for fast lookups by astrologer
CREATE INDEX IF NOT EXISTS idx_astrologer_customers_astrologer_id
  ON astrologer_customers (astrologer_id);
