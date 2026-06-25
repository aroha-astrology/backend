-- ============================================================================
-- JYOTISH AI - FULL RESET + APPLY ALL MIGRATIONS
-- ============================================================================
-- USAGE:
--   1. Open Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this entire file
--   3. Click "Run"
--   4. After success: Authentication -> Users -> Invite admin@jyotishai.com
--   5. Then run the one-liner at the bottom of this file (commented out)
-- ============================================================================
-- WARNING: This DROPS the entire public schema. All app data will be
-- destroyed. auth.users rows are preserved unless you uncomment the section
-- below.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RESET BLOCK
-- ----------------------------------------------------------------------------

-- Drop the auth trigger first (it lives in auth schema and survives schema drop)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Wipe the public schema
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO anon;
GRANT ALL ON SCHEMA public TO authenticated;
GRANT ALL ON SCHEMA public TO service_role;

-- CRITICAL: After DROP+CREATE SCHEMA, the ALTER DEFAULT PRIVILEGES that
-- Supabase normally has for anon/authenticated/service_role are GONE. Without
-- this, every table created by the migrations below has zero grants, and
-- PostgREST returns "permission denied for table users" on every API call.
-- (Migration 031 also re-asserts these as a backstop, but doing it here means
-- tables get grants the moment they're created, not retroactively.)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON ROUTINES  TO anon, authenticated, service_role;

-- Drop storage policies that the bucket migrations recreate.
-- (We do NOT delete the buckets themselves - Supabase blocks direct DELETE on
-- storage.buckets/objects. Migrations 004 + 006 are idempotent via ON CONFLICT
-- DO NOTHING, so existing buckets are reused.)
DROP POLICY IF EXISTS "palm_images_owner_read" ON storage.objects;
DROP POLICY IF EXISTS "reports_storage_user_access" ON storage.objects;

-- OPTIONAL: also wipe auth users (uncomment if you want a truly clean slate)
-- DELETE FROM auth.users;

-- ----------------------------------------------------------------------------
-- MIGRATIONS (applied in filename order - same as `supabase db push`)
-- ----------------------------------------------------------------------------

-- ============================================================================
-- >>> 001_initial.sql
-- ============================================================================

-- ============================================================================
-- Jyotish AI - Initial Database Migration
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. USERS
-- ============================================================================
CREATE TABLE users (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email       text UNIQUE NOT NULL,
    name        text,
    phone       text,
    credits     int DEFAULT 2,
    theme       text DEFAULT 'dark' CHECK (theme IN ('dark', 'light', 'premium')),
    language    text DEFAULT 'en' CHECK (language IN ('en', 'hi', 'ta', 'te', 'bn', 'gu', 'mr', 'kn', 'ml')),
    chart_style text DEFAULT 'north' CHECK (chart_style IN ('north', 'south')),
    is_premium  boolean DEFAULT false,
    premium_until timestamptz,
    created_at  timestamptz DEFAULT now()
);

-- ============================================================================
-- 2. BIRTH PROFILES
-- ============================================================================
CREATE TABLE birth_profiles (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        text NOT NULL,
    dob         date NOT NULL,
    tob         time NOT NULL,
    tob_source  text DEFAULT 'family' CHECK (tob_source IN ('hospital', 'certificate', 'family', 'approximate', 'unknown')),
    pob         text NOT NULL,
    latitude    decimal NOT NULL,
    longitude   decimal NOT NULL,
    timezone    text DEFAULT 'Asia/Kolkata',
    gender      text CHECK (gender IN ('male', 'female', 'other')),
    is_primary  boolean DEFAULT false,
    created_at  timestamptz DEFAULT now()
);

-- ============================================================================
-- 3. KUNDLI CHARTS
-- ============================================================================
CREATE TABLE kundli_charts (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id        uuid REFERENCES birth_profiles(id) ON DELETE CASCADE,
    user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ayanamsa          text DEFAULT 'lahiri',
    chart_data        jsonb,
    divisional_charts jsonb,
    dasha_data        jsonb,
    yoga_data         jsonb,
    dosha_data        jsonb,
    shadbala          jsonb,
    ashtakavarga      jsonb,
    panchang_at_birth jsonb,
    created_at        timestamptz DEFAULT now()
);

-- ============================================================================
-- 4. PREDICTIONS
-- ============================================================================
CREATE TABLE predictions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chart_id          uuid REFERENCES kundli_charts(id) ON DELETE CASCADE,
    user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type              text NOT NULL CHECK (type IN ('personality', 'career', 'health', 'marriage', 'wealth', 'children', 'education', 'difficulty', 'daily', 'monthly', 'yearly')),
    harsh_mode        boolean DEFAULT false,
    content           jsonb,
    follow_up_answers jsonb,
    language          text DEFAULT 'en',
    created_at        timestamptz DEFAULT now()
);

-- ============================================================================
-- 5. REMEDIES
-- ============================================================================
CREATE TABLE remedies (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chart_id    uuid REFERENCES kundli_charts(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        text CHECK (type IN ('vedic', 'lalkitab', 'gemstone', 'mantra', 'puja', 'fasting', 'charity', 'yantra', 'rudraksha')),
    planet      text,
    house       int,
    content     jsonb,
    created_at  timestamptz DEFAULT now()
);

-- ============================================================================
-- 6. MATCH REPORTS
-- ============================================================================
CREATE TABLE match_reports (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile1_id       uuid REFERENCES birth_profiles(id),
    profile2_id       uuid REFERENCES birth_profiles(id),
    system            text CHECK (system IN ('ashtakoota', 'dashakoota')),
    gun_scores        jsonb,
    total_score       int,
    detailed_analysis jsonb,
    created_at        timestamptz DEFAULT now()
);

-- ============================================================================
-- 7. LALKITAB CHARTS
-- ============================================================================
CREATE TABLE lalkitab_charts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chart_id        uuid REFERENCES kundli_charts(id) ON DELETE CASCADE,
    teva            jsonb,
    debts           jsonb,
    blind_planets   jsonb,
    remedies        jsonb,
    created_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 8. VIDEO READINGS
-- ============================================================================
CREATE TABLE video_readings (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chart_id         uuid REFERENCES kundli_charts(id) ON DELETE CASCADE,
    type             text CHECK (type IN ('quick', 'standard', 'detailed')),
    language         text DEFAULT 'en',
    script           jsonb,
    audio_url        text,
    video_url        text,
    duration_seconds int,
    credits_used     int NOT NULL,
    status           text DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'ready', 'failed')),
    created_at       timestamptz DEFAULT now()
);

-- ============================================================================
-- 9. CREDIT TRANSACTIONS
-- ============================================================================
CREATE TABLE credit_transactions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount              int NOT NULL,
    type                text CHECK (type IN ('signup_bonus', 'purchase', 'video_debit', 'report_debit', 'referral')),
    description         text,
    razorpay_payment_id text,
    created_at          timestamptz DEFAULT now()
);

-- ============================================================================
-- 10. VASTU ANALYSES
-- ============================================================================
CREATE TABLE vastu_analyses (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_layout  jsonb,
    room_details jsonb,
    analysis     jsonb,
    created_at   timestamptz DEFAULT now()
);

-- ============================================================================
-- 11. PALM READINGS
-- ============================================================================
CREATE TABLE palm_readings (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_url  text,
    hand       text CHECK (hand IN ('left', 'right')),
    analysis   jsonb,
    created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 12. FOLLOW-UP QUESTIONS
-- ============================================================================
CREATE TABLE follow_up_questions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chart_id     uuid REFERENCES kundli_charts(id) ON DELETE CASCADE,
    question     text NOT NULL,
    options      jsonb,
    answer       text,
    dasha_period text,
    created_at   timestamptz DEFAULT now()
);

-- ============================================================================
-- 13. DAILY HOROSCOPES
-- ============================================================================
CREATE TABLE daily_horoscopes (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rashi    text NOT NULL,
    date     date NOT NULL,
    language text DEFAULT 'en',
    content  jsonb,
    UNIQUE (rashi, date, language)
);

-- ============================================================================
-- 14. PANCHANG CACHE
-- ============================================================================
CREATE TABLE panchang_cache (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    date     date NOT NULL,
    location text NOT NULL,
    data     jsonb,
    UNIQUE (date, location)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- birth_profiles
CREATE INDEX idx_birth_profiles_user_id ON birth_profiles(user_id);

-- kundli_charts
CREATE INDEX idx_kundli_charts_user_id    ON kundli_charts(user_id);
CREATE INDEX idx_kundli_charts_profile_id ON kundli_charts(profile_id);

-- predictions
CREATE INDEX idx_predictions_user_id  ON predictions(user_id);
CREATE INDEX idx_predictions_chart_id ON predictions(chart_id);

-- remedies
CREATE INDEX idx_remedies_user_id  ON remedies(user_id);
CREATE INDEX idx_remedies_chart_id ON remedies(chart_id);

-- match_reports
CREATE INDEX idx_match_reports_user_id ON match_reports(user_id);

-- lalkitab_charts
CREATE INDEX idx_lalkitab_charts_chart_id ON lalkitab_charts(chart_id);

-- video_readings
CREATE INDEX idx_video_readings_user_id  ON video_readings(user_id);
CREATE INDEX idx_video_readings_chart_id ON video_readings(chart_id);
CREATE INDEX idx_video_readings_status   ON video_readings(status);

-- credit_transactions
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);

-- vastu_analyses
CREATE INDEX idx_vastu_analyses_user_id ON vastu_analyses(user_id);

-- palm_readings
CREATE INDEX idx_palm_readings_user_id ON palm_readings(user_id);

-- follow_up_questions
CREATE INDEX idx_follow_up_questions_chart_id ON follow_up_questions(chart_id);

-- daily_horoscopes
CREATE INDEX idx_daily_horoscopes_date ON daily_horoscopes(date);

-- panchang_cache
CREATE INDEX idx_panchang_cache_date ON panchang_cache(date);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE birth_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE kundli_charts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE remedies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lalkitab_charts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_readings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vastu_analyses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE palm_readings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_horoscopes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE panchang_cache       ENABLE ROW LEVEL SECURITY;

-- ---- users ----
CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_own" ON users
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ---- birth_profiles ----
CREATE POLICY "birth_profiles_select" ON birth_profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "birth_profiles_insert" ON birth_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "birth_profiles_update" ON birth_profiles
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "birth_profiles_delete" ON birth_profiles
    FOR DELETE USING (auth.uid() = user_id);

-- ---- kundli_charts ----
CREATE POLICY "kundli_charts_select" ON kundli_charts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "kundli_charts_insert" ON kundli_charts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "kundli_charts_update" ON kundli_charts
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "kundli_charts_delete" ON kundli_charts
    FOR DELETE USING (auth.uid() = user_id);

-- ---- predictions ----
CREATE POLICY "predictions_select" ON predictions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "predictions_insert" ON predictions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "predictions_update" ON predictions
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "predictions_delete" ON predictions
    FOR DELETE USING (auth.uid() = user_id);

-- ---- remedies ----
CREATE POLICY "remedies_select" ON remedies
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "remedies_insert" ON remedies
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "remedies_update" ON remedies
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "remedies_delete" ON remedies
    FOR DELETE USING (auth.uid() = user_id);

-- ---- match_reports ----
CREATE POLICY "match_reports_select" ON match_reports
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "match_reports_insert" ON match_reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "match_reports_update" ON match_reports
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "match_reports_delete" ON match_reports
    FOR DELETE USING (auth.uid() = user_id);

-- ---- lalkitab_charts (access via kundli_charts ownership) ----
CREATE POLICY "lalkitab_charts_select" ON lalkitab_charts
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM kundli_charts kc WHERE kc.id = chart_id AND kc.user_id = auth.uid())
    );

CREATE POLICY "lalkitab_charts_insert" ON lalkitab_charts
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM kundli_charts kc WHERE kc.id = chart_id AND kc.user_id = auth.uid())
    );

CREATE POLICY "lalkitab_charts_update" ON lalkitab_charts
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM kundli_charts kc WHERE kc.id = chart_id AND kc.user_id = auth.uid())
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM kundli_charts kc WHERE kc.id = chart_id AND kc.user_id = auth.uid())
    );

CREATE POLICY "lalkitab_charts_delete" ON lalkitab_charts
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM kundli_charts kc WHERE kc.id = chart_id AND kc.user_id = auth.uid())
    );

-- ---- video_readings ----
CREATE POLICY "video_readings_select" ON video_readings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "video_readings_insert" ON video_readings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "video_readings_update" ON video_readings
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "video_readings_delete" ON video_readings
    FOR DELETE USING (auth.uid() = user_id);

-- ---- credit_transactions ----
CREATE POLICY "credit_transactions_select" ON credit_transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "credit_transactions_insert" ON credit_transactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "credit_transactions_update" ON credit_transactions
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "credit_transactions_delete" ON credit_transactions
    FOR DELETE USING (auth.uid() = user_id);

-- ---- vastu_analyses ----
CREATE POLICY "vastu_analyses_select" ON vastu_analyses
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "vastu_analyses_insert" ON vastu_analyses
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "vastu_analyses_update" ON vastu_analyses
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "vastu_analyses_delete" ON vastu_analyses
    FOR DELETE USING (auth.uid() = user_id);

-- ---- palm_readings ----
CREATE POLICY "palm_readings_select" ON palm_readings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "palm_readings_insert" ON palm_readings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "palm_readings_update" ON palm_readings
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "palm_readings_delete" ON palm_readings
    FOR DELETE USING (auth.uid() = user_id);

-- ---- follow_up_questions (access via kundli_charts ownership) ----
CREATE POLICY "follow_up_questions_select" ON follow_up_questions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM kundli_charts kc WHERE kc.id = chart_id AND kc.user_id = auth.uid())
    );

CREATE POLICY "follow_up_questions_insert" ON follow_up_questions
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM kundli_charts kc WHERE kc.id = chart_id AND kc.user_id = auth.uid())
    );

CREATE POLICY "follow_up_questions_update" ON follow_up_questions
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM kundli_charts kc WHERE kc.id = chart_id AND kc.user_id = auth.uid())
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM kundli_charts kc WHERE kc.id = chart_id AND kc.user_id = auth.uid())
    );

CREATE POLICY "follow_up_questions_delete" ON follow_up_questions
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM kundli_charts kc WHERE kc.id = chart_id AND kc.user_id = auth.uid())
    );

-- ---- daily_horoscopes (read-only for all authenticated users) ----
CREATE POLICY "daily_horoscopes_select" ON daily_horoscopes
    FOR SELECT USING (auth.role() = 'authenticated');

-- ---- panchang_cache (read-only for all authenticated users) ----
CREATE POLICY "panchang_cache_select" ON panchang_cache
    FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================================
-- TRIGGER: Auto-create user row on Supabase auth signup
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, name, credits)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', ''),
        2
    );

    -- Record the signup bonus as a credit transaction
    INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (
        NEW.id,
        2,
        'signup_bonus',
        'Welcome bonus credits'
    );

    RETURN NEW;
END;
$$;

-- Drop trigger if it already exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- FUNCTION: Atomic credit deduction
-- ============================================================================
CREATE OR REPLACE FUNCTION public.deduct_credits(
    p_user_id uuid,
    p_amount int,
    p_type text,
    p_description text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_credits int;
BEGIN
    -- Lock the user row and check balance in one step
    SELECT credits INTO v_current_credits
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', p_user_id;
    END IF;

    IF v_current_credits < p_amount THEN
        RETURN false;
    END IF;

    -- Deduct credits
    UPDATE users
    SET credits = credits - p_amount
    WHERE id = p_user_id;

    -- Record the transaction (store amount as negative for debits)
    INSERT INTO credit_transactions (user_id, amount, type, description)
    VALUES (p_user_id, -p_amount, p_type, p_description);

    RETURN true;
END;
$$;

-- ============================================================================
-- >>> 002_reports_neural.sql
-- ============================================================================

-- ============================================================================
-- 002: Generated Reports + Neural Pathways
-- ============================================================================

-- ============================================================================
-- Fix trigger: handle empty string from Google OAuth metadata
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, name, credits)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
            NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), ''),
            ''
        ),
        2
    )
    ON CONFLICT (id) DO UPDATE
        SET
            email = EXCLUDED.email,
            name = CASE
                WHEN (users.name IS NULL OR TRIM(users.name) = '')
                    THEN EXCLUDED.name
                ELSE users.name
            END;

    -- Credit transaction only for fresh inserts
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.credit_transactions (user_id, amount, type, description)
        VALUES (NEW.id, 2, 'signup_bonus', 'Welcome bonus credits')
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

-- Re-attach the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- GENERATED REPORTS — stores every report generated by a user
-- ============================================================================
CREATE TABLE IF NOT EXISTS generated_reports (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_type     text NOT NULL CHECK (report_type IN ('numerology', 'kundli_basic', 'kundli_standard', 'kundli_premium')),
    subject_name    text NOT NULL,
    subject_dob     text,
    subject_gender  text,
    profile_id      uuid REFERENCES birth_profiles(id) ON DELETE SET NULL,
    -- Computed numbers / metadata (lightweight, always stored)
    metadata        jsonb,
    -- Full AI-generated content (for re-download without re-running AI)
    ai_content      jsonb,
    -- Optional: filename that was sent to client
    pdf_filename    text,
    neural_pathway_id uuid,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_reports_user_id    ON generated_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_reports_created_at ON generated_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_reports_subject    ON generated_reports(user_id, subject_name, subject_dob);

ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "generated_reports_select" ON generated_reports
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "generated_reports_insert" ON generated_reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "generated_reports_delete" ON generated_reports
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- NEURAL PATHWAYS — contextual profiles built over time for each subject
-- ============================================================================
CREATE TABLE IF NOT EXISTS neural_pathways (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Subject identity (used to match across reports)
    subject_name        text NOT NULL,
    subject_dob         text,
    subject_gender      text,
    -- Relationship context
    relationship        text CHECK (relationship IN (
        'self', 'spouse', 'child', 'parent', 'sibling',
        'friend', 'colleague', 'client', 'other'
    )),
    -- Life context collected via post-generation questions
    life_goals          text[],
    current_challenges  text[],
    career_profession   text,
    health_notes        text,
    personality_notes   text,
    additional_context  jsonb,
    -- Linked report IDs (updated when new reports are saved)
    report_ids          uuid[],
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now(),
    -- One pathway per (user, subject_name, subject_dob) triplet
    UNIQUE (user_id, subject_name, subject_dob)
);

CREATE INDEX IF NOT EXISTS idx_neural_pathways_user_id ON neural_pathways(user_id);
CREATE INDEX IF NOT EXISTS idx_neural_pathways_subject ON neural_pathways(user_id, subject_name, subject_dob);

ALTER TABLE neural_pathways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "neural_pathways_select" ON neural_pathways
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "neural_pathways_insert" ON neural_pathways
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "neural_pathways_update" ON neural_pathways
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "neural_pathways_delete" ON neural_pathways
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- Helper: auto-update updated_at on neural_pathways
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS neural_pathways_updated_at ON neural_pathways;
CREATE TRIGGER neural_pathways_updated_at
    BEFORE UPDATE ON neural_pathways
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- >>> 003_admin.sql
-- ============================================================================

-- ============================================================================
-- 003: Admin role
-- ============================================================================

-- Add is_admin column to users table
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- ============================================================================
-- Admin check helper — SECURITY DEFINER so the inner SELECT bypasses RLS
-- on the users table. Without this, an admin RLS policy that queries users
-- recursively triggers itself (Postgres error 42P17 "infinite recursion
-- detected in policy for relation \"users\"").
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false);
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ============================================================================
-- Admin RLS policies — service-role key bypasses RLS entirely,
-- but expose read-all policies for authenticated admins as well
-- ============================================================================

-- Allow admins to read ALL users
DROP POLICY IF EXISTS "admin_users_select_all" ON users;
CREATE POLICY "admin_users_select_all" ON users
    FOR SELECT USING (public.is_admin());

-- Allow admins to read ALL neural_pathways
DROP POLICY IF EXISTS "admin_neural_pathways_select_all" ON neural_pathways;
CREATE POLICY "admin_neural_pathways_select_all" ON neural_pathways
    FOR SELECT USING (public.is_admin());

-- Allow admins to read ALL generated_reports
DROP POLICY IF EXISTS "admin_generated_reports_select_all" ON generated_reports;
CREATE POLICY "admin_generated_reports_select_all" ON generated_reports
    FOR SELECT USING (public.is_admin());

-- ============================================================================
-- >>> 004_report_background.sql
-- ============================================================================

-- ============================================================================
-- 004: Background report processing + Supabase Storage setup
-- ============================================================================

-- Add status tracking columns to generated_reports
ALTER TABLE generated_reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Index for polling pending reports
CREATE INDEX IF NOT EXISTS idx_generated_reports_user_status
  ON generated_reports(user_id, status, created_at DESC);

-- Create storage bucket for PDFs (run this in the dashboard Storage UI too)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('reports', 'reports', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can only access their own reports folder
CREATE POLICY "reports_storage_user_access" ON storage.objects
  FOR ALL USING (
    bucket_id = 'reports' AND
    auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'reports' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- >>> 004b_chat_conversations.sql
-- ============================================================================

-- Create chat_conversations table for storing user-Yogi Baba conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  response TEXT NOT NULL,
  chart_id UUID REFERENCES kundli_charts(id) ON DELETE SET NULL,
  language TEXT DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries by user_id and created_at
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_created ON chat_conversations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_chart_id ON chat_conversations(chart_id);

-- Enable RLS
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own conversations
CREATE POLICY "Users can view their own chat conversations" ON chat_conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat conversations" ON chat_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat conversations" ON chat_conversations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat conversations" ON chat_conversations
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- >>> 005_push_subscriptions.sql
-- ============================================================================

-- ============================================================================
-- 005: Web Push subscriptions (notify when reports are ready)
-- ============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owners can read/write their own subscriptions; service role bypasses RLS.
CREATE POLICY "push_subscriptions_owner" ON push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- >>> 006_palm_images_bucket.sql
-- ============================================================================

-- ============================================================================
-- 006: Palm images storage bucket
-- ============================================================================
-- Private bucket holding the original palm photo a user uploaded for analysis.
-- Files are written via the service role from the API route; users read them
-- through short-lived signed URLs returned by /api/palm/analyze.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('palm-images', 'palm-images', false)
ON CONFLICT (id) DO NOTHING;

-- Owners can read their own files (defence-in-depth — primary path is signed URLs).
DROP POLICY IF EXISTS "palm_images_owner_read" ON storage.objects;
CREATE POLICY "palm_images_owner_read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'palm-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- No client-side writes; service role bypasses RLS for INSERT/UPDATE/DELETE.

-- ----------------------------------------------------------------------------
-- palm_readings: track the storage path and a content hash so we can
-- (a) re-issue signed URLs without re-uploading and
-- (b) skip the AI call when the same user re-submits an identical photo.
-- ----------------------------------------------------------------------------
ALTER TABLE palm_readings
  ADD COLUMN IF NOT EXISTS image_path text,
  ADD COLUMN IF NOT EXISTS image_hash text;

CREATE INDEX IF NOT EXISTS idx_palm_readings_user_hash
  ON palm_readings (user_id, image_hash, hand);

-- ============================================================================
-- >>> 007_combined_reports.sql
-- ============================================================================

-- ============================================================================
-- 007: Combined palm + kundli reports
-- ============================================================================
-- After a user has both a palm reading and a kundli chart, we can generate a
-- single reconciled report that treats them as two views of the same soul.
-- This migration extends the generated_reports.report_type CHECK constraint
-- so we can persist that new report kind, and adds metadata columns for the
-- source palm_reading_id and chart_id.
-- ============================================================================

ALTER TABLE generated_reports
  DROP CONSTRAINT IF EXISTS generated_reports_report_type_check;

ALTER TABLE generated_reports
  ADD CONSTRAINT generated_reports_report_type_check
  CHECK (report_type IN (
    'numerology',
    'kundli_basic',
    'kundli_standard',
    'kundli_premium',
    'combined_palm_kundli'
  ));

ALTER TABLE generated_reports
  ADD COLUMN IF NOT EXISTS palm_reading_id uuid REFERENCES palm_readings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chart_id uuid REFERENCES kundli_charts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_generated_reports_palm
  ON generated_reports(user_id, palm_reading_id)
  WHERE palm_reading_id IS NOT NULL;

-- ============================================================================
-- >>> 008_coupons.sql
-- ============================================================================

-- ============================================================================
-- Jyotish AI - Migration 008: Coupon System & Token Costs
-- ============================================================================

-- 1. Coupons table
CREATE TABLE IF NOT EXISTS coupons (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code       text UNIQUE NOT NULL,
    token_amount int NOT NULL CHECK (token_amount > 0),
    is_used    boolean DEFAULT false,
    used_by    uuid REFERENCES users(id) ON DELETE SET NULL,
    used_at    timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_coupons_code    ON coupons(code);
CREATE INDEX idx_coupons_is_used ON coupons(is_used);

-- RLS for coupons (admin inserts, authenticated reads)
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view available coupons"
    ON coupons FOR SELECT
    USING (auth.role() = 'authenticated');

-- 2. Add chat_session_expires to users for 5-min token window
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_session_expires timestamptz;

-- 3. Extend credit_transactions type to include coupon + feature debits
ALTER TABLE credit_transactions
    DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE credit_transactions
    ADD CONSTRAINT credit_transactions_type_check
    CHECK (type IN (
        'signup_bonus', 'purchase', 'video_debit', 'report_debit',
        'referral', 'coupon_redeem', 'feature_debit', 'chat_debit'
    ));

-- 4. Atomic credit deduction RPC (returns new balance, raises if insufficient)
CREATE OR REPLACE FUNCTION deduct_credits(p_user_id uuid, p_amount int)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_credits int;
BEGIN
  UPDATE users
     SET credits = credits - p_amount
   WHERE id = p_user_id
     AND credits >= p_amount
  RETURNING credits INTO v_new_credits;

  IF v_new_credits IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_TOKENS: Not enough tokens to complete this action';
  END IF;

  RETURN v_new_credits;
END;
$$;

-- 5. Seed coupon codes
-- One master coupon (40 tokens)
INSERT INTO coupons (code, token_amount) VALUES ('JYOTISH40', 40)
ON CONFLICT (code) DO NOTHING;

-- 20 × 1-token coupons
INSERT INTO coupons (code, token_amount) VALUES
  ('JY1-ABCD', 1), ('JY1-EFGH', 1), ('JY1-IJKL', 1), ('JY1-MNOP', 1),
  ('JY1-QRST', 1), ('JY1-UVWX', 1), ('JY1-YZBC', 1), ('JY1-DEFG', 1),
  ('JY1-HIJK', 1), ('JY1-LMNO', 1), ('JY1-PQRS', 1), ('JY1-TUVW', 1),
  ('JY1-XYZA', 1), ('JY1-BCDE', 1), ('JY1-FGHI', 1), ('JY1-JKLM', 1),
  ('JY1-NOPQ', 1), ('JY1-RSTU', 1), ('JY1-VWXY', 1), ('JY1-ZABC', 1)
ON CONFLICT (code) DO NOTHING;

-- 20 × 2-token coupons
INSERT INTO coupons (code, token_amount) VALUES
  ('JY2-ABCD', 2), ('JY2-EFGH', 2), ('JY2-IJKL', 2), ('JY2-MNOP', 2),
  ('JY2-QRST', 2), ('JY2-UVWX', 2), ('JY2-YZBC', 2), ('JY2-DEFG', 2),
  ('JY2-HIJK', 2), ('JY2-LMNO', 2), ('JY2-PQRS', 2), ('JY2-TUVW', 2),
  ('JY2-XYZA', 2), ('JY2-BCDE', 2), ('JY2-FGHI', 2), ('JY2-JKLM', 2),
  ('JY2-NOPQ', 2), ('JY2-RSTU', 2), ('JY2-VWXY', 2), ('JY2-ZABC', 2)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- >>> 009_fix_deduct_credits.sql
-- ============================================================================

-- ============================================================================
-- Migration 009: Fix deduct_credits RPC
--
-- Problem: The 2-arg deduct_credits(uuid, int) function added in 008_coupons.sql
-- is missing SECURITY DEFINER. Without it, the inner UPDATE runs with the
-- caller's privileges and is filtered by RLS. Combined with the older 4-arg
-- overload from 001_initial.sql (which also takes uuid + int as the first two
-- positional params), PostgREST sometimes resolves the call ambiguously and
-- the UPDATE silently matches 0 rows → the function raises INSUFFICIENT_TOKENS
-- even when the user has plenty of credits.
--
-- Fix:
--   1. Drop both existing overloads to remove ambiguity.
--   2. Recreate a single canonical deduct_credits(uuid, int) RETURNS int with
--      SECURITY DEFINER + a fixed search_path.
-- ============================================================================

DROP FUNCTION IF EXISTS public.deduct_credits(uuid, int);
DROP FUNCTION IF EXISTS public.deduct_credits(uuid, int, text, text);

CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id uuid, p_amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_credits int;
BEGIN
  UPDATE users
     SET credits = credits - p_amount
   WHERE id = p_user_id
     AND credits >= p_amount
  RETURNING credits INTO v_new_credits;

  IF v_new_credits IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_TOKENS: Not enough tokens to complete this action';
  END IF;

  RETURN v_new_credits;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, int) TO authenticated;

-- ============================================================================
-- >>> 010_credit_rpcs.sql
-- ============================================================================

-- ============================================================================
-- Migration 010: Add increment_credits RPC + credits-balance helpers
--
-- Problem: /api/credits/redeem calls supabase.rpc('increment_credits', ...)
-- but no migration ever created that function. The call always errored, the
-- fallback direct UPDATE then ran with the user's RLS context, and any
-- silent RLS denial left the row unchanged → user saw their balance bump
-- locally (frontend setCredits) but on reload the DB still held the old
-- value, so the navbar reverted to 0.
--
-- Fix: Create increment_credits with SECURITY DEFINER so coupons and
-- purchases reliably credit the user.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_credits(p_user_id uuid, p_amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_credits int;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Amount must be positive';
  END IF;

  UPDATE users
     SET credits = COALESCE(credits, 0) + p_amount
   WHERE id = p_user_id
  RETURNING credits INTO v_new_credits;

  IF v_new_credits IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: No users row for id %', p_user_id;
  END IF;

  RETURN v_new_credits;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_credits(uuid, int) TO authenticated;

-- ============================================================================
-- >>> 011_notifications.sql
-- ============================================================================

-- ============================================================================
-- 011: In-app notifications (bell icon feed)
--
-- Each user gets their own notifications scoped by user_id with RLS, so
-- concurrent report generation by multiple users never crosses streams.
-- The /api/reports/render route inserts a row when status flips to 'ready';
-- the navbar bell subscribes via Supabase realtime to surface it instantly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                -- 'report_ready' | 'kundli_ready' | 'system' | ...
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,                         -- where bell click should navigate
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Owners can read their notifications; service role bypasses RLS for inserts.
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Owners can mark their own notifications read.
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Owners can clear their own (used for "dismiss" / "clear all").
CREATE POLICY "notifications_delete_own" ON notifications
  FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime broadcast on this table so the bell can subscribe live.
-- (Idempotent: ignores any error — publication may not exist on local dev,
-- or the table may already be added on re-runs.)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

-- ============================================================================
-- >>> 012_divisional_chart_analyses.sql
-- ============================================================================

-- ============================================================================
-- 012: Divisional chart AI analyses
--
-- Stores Yogi Baba's narrative interpretation of each varga (divisional chart)
-- for a user's kundli. The raw planet-sign data already lives in
-- kundli_charts.divisional_charts; this table adds the AI layer on top.
--
-- Generation is triggered three ways:
--   1. User clicks "Generate Analysis" on /vargas (explicit request)
--   2. Background auto-generation after a report render finishes (idle LLM)
--   3. Any future scheduled / webhook trigger
-- ============================================================================

CREATE TABLE IF NOT EXISTS divisional_chart_analyses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kundli_chart_id  UUID NOT NULL REFERENCES kundli_charts(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart_type       TEXT NOT NULL,                        -- 'D1','D2','D9','D10', etc.
  analysis         TEXT,                                 -- Yogi Baba narrative (3 paragraphs)
  key_findings     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- string[] of 5 bullet points
  status           TEXT NOT NULL DEFAULT 'pending',      -- pending|generating|ready|error
  error_message    TEXT,
  generated_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One analysis per (kundli, chart type) pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_dca_kundli_type
  ON divisional_chart_analyses(kundli_chart_id, chart_type);

-- Fast lookup of all analyses for a user in a given status
CREATE INDEX IF NOT EXISTS idx_dca_user_status
  ON divisional_chart_analyses(user_id, status);

-- Queue order for background processing (oldest pending first)
CREATE INDEX IF NOT EXISTS idx_dca_pending_queue
  ON divisional_chart_analyses(created_at ASC)
  WHERE status = 'pending';

ALTER TABLE divisional_chart_analyses ENABLE ROW LEVEL SECURITY;

-- Users can read their own analyses (service role handles inserts/updates).
CREATE POLICY "dca_select_own" ON divisional_chart_analyses
  FOR SELECT USING (auth.uid() = user_id);

-- Users can delete their own (e.g. "regenerate" flow deletes then re-inserts).
CREATE POLICY "dca_delete_own" ON divisional_chart_analyses
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- >>> 013_seed_admin.sql
-- ============================================================================

-- Create dedicated admin account and grant admin access.
-- The auth user must be created first via Supabase dashboard or CLI
-- (Authentication → Users → Invite user: admin@jyotishai.com).
-- This migration then ensures the users row has is_admin = TRUE.
INSERT INTO users (id, email, name, credits, is_admin)
SELECT id, email, 'Admin', 0, TRUE
FROM auth.users
WHERE email = 'admin@jyotishai.com'
ON CONFLICT (id) DO UPDATE SET is_admin = TRUE, email = EXCLUDED.email;

-- Remove admin flag from personal account
UPDATE users SET is_admin = FALSE WHERE email = 's9575220017@gmail.com';

-- ============================================================================
-- >>> 014_activity_log.sql
-- ============================================================================

-- ============================================================================
-- 014: User activity log
--
-- Tracks page views and discrete user actions so the admin panel can show
-- a per-user timeline of what they visited, used, and did.
-- Inserts are performed by the service-role client in /api/activity/log so
-- users cannot forge their own events. Users can only read their own rows.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_activity_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   TEXT,                    -- random UUID from browser sessionStorage, groups a visit
  event_type   TEXT        NOT NULL,    -- page_view | feature_used | report_generated | credit_spent | chat_message | error
  page         TEXT,                    -- URL path, e.g. /kundli/abc123
  action       TEXT,                    -- specific action within page, e.g. generate_report
  label        TEXT,                    -- human-readable label, e.g. "Vedic Kundli Report"
  metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ip           TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_user_created
  ON user_activity_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_created
  ON user_activity_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_event_type
  ON user_activity_log(event_type);

CREATE INDEX IF NOT EXISTS idx_activity_session
  ON user_activity_log(session_id);

ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own activity
CREATE POLICY "activity_select_own" ON user_activity_log
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- >>> 014_summer_coupons_2026.sql
-- ============================================================================

-- ============================================================================
-- Migration 014: Replace all coupons with Summer 2026 batch
-- Format: SUMMER-XXXXXXXX-2026 (8 random alphanumeric chars, no O/0/I/1)
-- ============================================================================

-- Remove all existing coupons (unused and used)
TRUNCATE TABLE coupons RESTART IDENTITY CASCADE;

-- ── 20 × 1-token coupons ────────────────────────────────────────────────────
INSERT INTO coupons (code, token_amount) VALUES
  ('SUMMER-UR5HFPYA-2026', 1),
  ('SUMMER-974L8QLD-2026', 1),
  ('SUMMER-VXP6ES7Y-2026', 1),
  ('SUMMER-E2RKYLJT-2026', 1),
  ('SUMMER-4HM5AULU-2026', 1),
  ('SUMMER-U539PX3N-2026', 1),
  ('SUMMER-2UWDKWBH-2026', 1),
  ('SUMMER-MVDGXCPR-2026', 1),
  ('SUMMER-7D2ANWCT-2026', 1),
  ('SUMMER-5YCUPQHM-2026', 1),
  ('SUMMER-36MJ36XE-2026', 1),
  ('SUMMER-S59E2K9E-2026', 1),
  ('SUMMER-KWCV5HGW-2026', 1),
  ('SUMMER-ANH85U4Y-2026', 1),
  ('SUMMER-TF2DXT5U-2026', 1),
  ('SUMMER-UZ7JXAYP-2026', 1),
  ('SUMMER-5BP6AGAU-2026', 1),
  ('SUMMER-GMQQ698Z-2026', 1),
  ('SUMMER-U3PS4EXZ-2026', 1),
  ('SUMMER-9ACJ3LJJ-2026', 1);

-- ── 20 × 2-token coupons ────────────────────────────────────────────────────
INSERT INTO coupons (code, token_amount) VALUES
  ('SUMMER-6TCAJKZD-2026', 2),
  ('SUMMER-GS7GQ9ZC-2026', 2),
  ('SUMMER-GZ4TEJDN-2026', 2),
  ('SUMMER-S9FFUHW8-2026', 2),
  ('SUMMER-YYQYUNFU-2026', 2),
  ('SUMMER-V975UFVS-2026', 2),
  ('SUMMER-YMJ2BNHC-2026', 2),
  ('SUMMER-VRDH38N8-2026', 2),
  ('SUMMER-6CQJYVQP-2026', 2),
  ('SUMMER-RWBTWTU5-2026', 2),
  ('SUMMER-GVBK3H5A-2026', 2),
  ('SUMMER-ZNPRAAW2-2026', 2),
  ('SUMMER-GTA3HJHG-2026', 2),
  ('SUMMER-RJ45KWMV-2026', 2),
  ('SUMMER-EHDAN434-2026', 2),
  ('SUMMER-6ZBUPKVW-2026', 2),
  ('SUMMER-WSS75LM9-2026', 2),
  ('SUMMER-FCEV9UEC-2026', 2),
  ('SUMMER-GAV753AD-2026', 2),
  ('SUMMER-MC5J8ZGU-2026', 2);

-- ── 5 × 10-token coupons ────────────────────────────────────────────────────
INSERT INTO coupons (code, token_amount) VALUES
  ('SUMMER-96AWA6T7-2026', 10),
  ('SUMMER-M68LV85Z-2026', 10),
  ('SUMMER-BSWFZ9KE-2026', 10),
  ('SUMMER-B7BK8V38-2026', 10),
  ('SUMMER-ZY5L6LQW-2026', 10);

-- ============================================================================
-- >>> 015_chat_sessions.sql
-- ============================================================================

-- Chat sessions (like ChatGPT conversations)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Chat with Yogi Baba',
  chart_id UUID REFERENCES kundli_charts(id) ON DELETE SET NULL,
  language TEXT DEFAULT 'en',
  message_count INT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, last_message_at DESC);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own chat sessions" ON chat_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Extend chat_conversations with session support
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_voice BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_chat_conv_session ON chat_conversations(session_id, created_at);

-- ============================================================================
-- >>> 016_life_journey_events.sql
-- ============================================================================

-- Life journey AI-generated events with feedback persistence
-- Events are generated once per (chart, phase) and reused on subsequent visits.
-- On 'disagree' the row is deactivated (kept as blacklist) and a fresh row inserted.
-- On 'maybe' the same row is updated in-place with refined storytelling.
-- On 'agree' only the feedback column updates.

CREATE TABLE IF NOT EXISTS life_journey_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart_id UUID NOT NULL REFERENCES kundli_charts(id) ON DELETE CASCADE,
  phase_index INTEGER NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 4),
  short_text TEXT NOT NULL,
  story_text TEXT NOT NULL,
  feedback TEXT CHECK (feedback IN ('agree', 'maybe', 'disagree')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  parent_event_id UUID REFERENCES life_journey_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active event per slot
CREATE UNIQUE INDEX IF NOT EXISTS life_journey_events_active_uniq
  ON life_journey_events (chart_id, phase_index, slot)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS life_journey_events_user_chart_idx
  ON life_journey_events (user_id, chart_id, phase_index);

CREATE INDEX IF NOT EXISTS life_journey_events_blacklist_idx
  ON life_journey_events (chart_id, phase_index, slot)
  WHERE feedback = 'disagree' AND is_active = false;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION life_journey_events_touch() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS life_journey_events_touch_trg ON life_journey_events;
CREATE TRIGGER life_journey_events_touch_trg
  BEFORE UPDATE ON life_journey_events
  FOR EACH ROW EXECUTE FUNCTION life_journey_events_touch();

ALTER TABLE life_journey_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lje_select_own"
  ON life_journey_events FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "lje_insert_own"
  ON life_journey_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lje_update_own"
  ON life_journey_events FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lje_delete_own"
  ON life_journey_events FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- >>> 017_generation_queue.sql
-- ============================================================================

-- Background generation queue
-- After onboarding (or any chart creation) we enqueue heavy AI/computation jobs.
-- A client-side worker (QueueProcessor) picks pending rows, fires the matching
-- API, then marks them done. If a user opens a feature manually, that endpoint
-- also dequeues the matching row so we never double-generate.

CREATE TABLE IF NOT EXISTS generation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  -- payload holds chart_id + any per-job args (phase_index, sign, etc).
  -- Querying by payload uses jsonb operators.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'skipped')),
  priority INT NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Worker pickup index: pending jobs by priority then age
CREATE INDEX IF NOT EXISTS generation_queue_pickup_idx
  ON generation_queue (status, priority DESC, created_at)
  WHERE status IN ('pending', 'processing');

-- Per-user listing
CREATE INDEX IF NOT EXISTS generation_queue_user_idx
  ON generation_queue (user_id, status, created_at DESC);

-- Dedupe: at most one open (pending/processing) job per
-- (user, type, chart_id, phase_index). NULLs treated as equal via COALESCE.
CREATE UNIQUE INDEX IF NOT EXISTS generation_queue_dedupe
  ON generation_queue (
    user_id,
    job_type,
    (COALESCE(payload->>'chart_id', '')),
    (COALESCE(payload->>'phase_index', ''))
  )
  WHERE status IN ('pending', 'processing');

ALTER TABLE generation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "queue_select_own" ON generation_queue
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "queue_insert_own" ON generation_queue
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "queue_update_own" ON generation_queue
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "queue_delete_own" ON generation_queue
  FOR DELETE USING (user_id = auth.uid());

-- Atomic claim: pick the next pending job for this user, mark it 'processing',
-- and return it. SKIP LOCKED ensures two concurrent workers never grab the
-- same row. Used by /api/queue/claim.
CREATE OR REPLACE FUNCTION claim_next_queue_job(p_user_id UUID)
RETURNS SETOF generation_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE generation_queue q
  SET status = 'processing',
      started_at = now(),
      attempts = q.attempts + 1
  WHERE q.id = (
    SELECT id FROM generation_queue
    WHERE user_id = p_user_id
      AND status = 'pending'
    ORDER BY priority DESC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING q.*;
END;
$$;

-- ============================================================================
-- >>> 018_claim_any_job.sql
-- ============================================================================

-- Server-side queue drainer support.
-- Companion to 017_generation_queue.sql. The original claim_next_queue_job(p_user_id)
-- is for the old client-side worker; this variant drains across all users for the
-- service-role drain endpoint (apps/web/src/app/api/queue/drain/route.ts).
-- SKIP LOCKED makes it safe under concurrent invocations (cron + on-demand kick).

CREATE OR REPLACE FUNCTION claim_any_pending_job()
RETURNS SETOF generation_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE generation_queue q
  SET status = 'processing',
      started_at = now(),
      attempts = q.attempts + 1
  WHERE q.id = (
    SELECT id FROM generation_queue
    WHERE status = 'pending'
    ORDER BY priority DESC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING q.*;
END;
$$;

-- Restrict execute to service_role only — anon/authenticated should never call this.
REVOKE ALL ON FUNCTION claim_any_pending_job() FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_any_pending_job() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_any_pending_job() TO service_role;

-- ============================================================================
-- >>> 018_life_area_insights.sql
-- ============================================================================

-- Storytelling life-area insights for the My Life present-chapter view.
-- One row per (chart, phase, area). Generated once, reused on revisit, and
-- pre-built by the background queue after onboarding.

CREATE TABLE IF NOT EXISTS life_area_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart_id UUID NOT NULL REFERENCES kundli_charts(id) ON DELETE CASCADE,
  phase_index INTEGER NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('Career', 'Love', 'Money', 'Health')),
  status TEXT NOT NULL CHECK (status IN ('good', 'neutral', 'challenging')),
  brief TEXT NOT NULL,           -- one-line headline shown on the collapsed card
  story TEXT NOT NULL,           -- 3-4 sentence narrative shown when expanded
  key_insights JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of practical bullet points
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS life_area_insights_uniq
  ON life_area_insights (chart_id, phase_index, area);

CREATE INDEX IF NOT EXISTS life_area_insights_user_idx
  ON life_area_insights (user_id, chart_id, phase_index);

ALTER TABLE life_area_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lai_select_own" ON life_area_insights
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "lai_insert_own" ON life_area_insights
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "lai_update_own" ON life_area_insights
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "lai_delete_own" ON life_area_insights
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- >>> 018_life_journey_insights.sql
-- ============================================================================

-- Life journey AI-generated per-area insights (title, story, do/avoid)
-- Cached per (chart, mahadasha_planet, antardasha_planet, area)

CREATE TABLE IF NOT EXISTS life_journey_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart_id UUID NOT NULL REFERENCES kundli_charts(id) ON DELETE CASCADE,
  mahadasha_planet TEXT NOT NULL,
  antardasha_planet TEXT NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('Career', 'Love', 'Money', 'Health')),
  title TEXT NOT NULL,
  story TEXT NOT NULL,
  do_items JSONB NOT NULL DEFAULT '[]',
  avoid_items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS life_journey_insights_uniq
  ON life_journey_insights (chart_id, mahadasha_planet, antardasha_planet, area);

CREATE INDEX IF NOT EXISTS life_journey_insights_chart_idx
  ON life_journey_insights (user_id, chart_id);

ALTER TABLE life_journey_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lji_select_own"
  ON life_journey_insights FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "lji_insert_own"
  ON life_journey_insights FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lji_delete_own"
  ON life_journey_insights FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- >>> 019_chat_ready.sql
-- ============================================================================

-- Chat readiness gate: chat is locked until all background generation jobs complete.
ALTER TABLE kundli_charts
  ADD COLUMN IF NOT EXISTS chat_ready BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark existing charts (pre-migration) as ready so old users aren't locked out.
UPDATE kundli_charts SET chat_ready = TRUE
WHERE id NOT IN (
  SELECT DISTINCT (payload->>'chart_id')::UUID
  FROM generation_queue
  WHERE status IN ('pending', 'processing')
    AND payload->>'chart_id' IS NOT NULL
);

-- ============================================================================
-- >>> 020_chat_ready_trigger.sql
-- ============================================================================

-- Auto-unlock chat when all queue jobs for a user finish.
-- Replaces the external webhook with an in-database trigger — no HTTP call needed.

CREATE OR REPLACE FUNCTION unlock_chat_if_queue_clear()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pending INT;
  v_generating INT;
BEGIN
  -- Only act when a job moves into a terminal state
  IF NEW.status NOT IN ('done', 'failed', 'skipped') THEN
    RETURN NEW;
  END IF;

  -- Any other open jobs for this user?
  SELECT COUNT(*) INTO v_pending
  FROM generation_queue
  WHERE user_id = NEW.user_id
    AND status IN ('pending', 'processing')
    AND id <> NEW.id;

  IF v_pending > 0 THEN
    RETURN NEW;
  END IF;

  -- Any reports still mid-generation?
  SELECT COUNT(*) INTO v_generating
  FROM generated_reports
  WHERE user_id = NEW.user_id
    AND status = 'generating';

  IF v_generating > 0 THEN
    RETURN NEW;
  END IF;

  -- All clear — unlock chat for every chart owned by this user
  UPDATE kundli_charts
  SET chat_ready = TRUE
  WHERE user_id = NEW.user_id
    AND chat_ready = FALSE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unlock_chat_on_queue_complete ON generation_queue;
CREATE TRIGGER trg_unlock_chat_on_queue_complete
AFTER UPDATE OF status ON generation_queue
FOR EACH ROW
WHEN (NEW.status IN ('done', 'failed', 'skipped'))
EXECUTE FUNCTION unlock_chat_if_queue_clear();

-- Mirror trigger: a report finishing should also unlock chat if queue is empty
CREATE OR REPLACE FUNCTION unlock_chat_on_report_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pending INT;
  v_other_generating INT;
BEGIN
  IF NEW.status = 'generating' OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_pending
  FROM generation_queue
  WHERE user_id = NEW.user_id
    AND status IN ('pending', 'processing');

  SELECT COUNT(*) INTO v_other_generating
  FROM generated_reports
  WHERE user_id = NEW.user_id
    AND status = 'generating'
    AND id <> NEW.id;

  IF v_pending = 0 AND v_other_generating = 0 THEN
    UPDATE kundli_charts
    SET chat_ready = TRUE
    WHERE user_id = NEW.user_id
      AND chat_ready = FALSE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unlock_chat_on_report_complete ON generated_reports;
CREATE TRIGGER trg_unlock_chat_on_report_complete
AFTER UPDATE OF status ON generated_reports
FOR EACH ROW
EXECUTE FUNCTION unlock_chat_on_report_complete();

-- ============================================================================
-- >>> 021_feature_insights.sql
-- ============================================================================

-- ============================================================================
-- 021: feature_insights — per-feature AI content cache
-- Single source of truth for every feature surface's rendered content.
-- Keyed by (user_id, chart_id, feature_key, params_hash, language).
-- source column drives precedence: report_enriched > lite_ai > deterministic.
-- ============================================================================

CREATE TABLE IF NOT EXISTS feature_insights (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart_id        uuid REFERENCES kundli_charts(id) ON DELETE CASCADE,
  profile_id      uuid REFERENCES birth_profiles(id) ON DELETE SET NULL,
  feature_key     text NOT NULL,
  params_hash     text NOT NULL DEFAULT '',
  language        text NOT NULL DEFAULT 'en',
  source          text NOT NULL CHECK (source IN ('lite_ai', 'report_enriched', 'deterministic')),
  source_version  int  NOT NULL DEFAULT 1,
  report_id       uuid REFERENCES generated_reports(id) ON DELETE SET NULL,
  content         jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,

  UNIQUE (user_id, chart_id, feature_key, params_hash, language)
);

CREATE INDEX IF NOT EXISTS idx_feature_insights_user_chart
  ON feature_insights (user_id, chart_id);

CREATE INDEX IF NOT EXISTS idx_feature_insights_report
  ON feature_insights (report_id)
  WHERE report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feature_insights_expires
  ON feature_insights (expires_at)
  WHERE expires_at IS NOT NULL;

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE feature_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_insights"
  ON feature_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_insights"
  ON feature_insights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role (used by the queue worker) can update rows regardless of user.
-- This policy is intentionally permissive for UPDATE — the queue worker runs
-- with service_role which bypasses RLS, but we define it for completeness.
CREATE POLICY "service_role_update_insights"
  ON feature_insights FOR UPDATE
  USING (true);

-- ── Conditional upsert function ───────────────────────────────────────────────
-- Enforces precedence: report_enriched always wins; lite_ai wins over
-- deterministic; same source refreshes. Race-losers are silently dropped.
-- SECURITY DEFINER so the queue worker (service_role) can call it safely.

CREATE OR REPLACE FUNCTION upsert_feature_insight(
  p_user_id        uuid,
  p_chart_id       uuid,
  p_feature_key    text,
  p_params_hash    text,
  p_language       text,
  p_source         text,
  p_source_version int,
  p_content        jsonb,
  p_report_id      uuid,
  p_expires_at     timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO feature_insights (
    user_id, chart_id, feature_key, params_hash, language,
    source, source_version, content, report_id, expires_at
  ) VALUES (
    p_user_id, p_chart_id, p_feature_key, p_params_hash, p_language,
    p_source, p_source_version, p_content, p_report_id, p_expires_at
  )
  ON CONFLICT (user_id, chart_id, feature_key, params_hash, language)
  DO UPDATE SET
    content         = EXCLUDED.content,
    source          = EXCLUDED.source,
    source_version  = EXCLUDED.source_version,
    report_id       = EXCLUDED.report_id,
    generated_at    = now(),
    expires_at      = EXCLUDED.expires_at
  WHERE
    -- report_enriched always overwrites anything
    (EXCLUDED.source = 'report_enriched')
    -- lite_ai overwrites only deterministic
    OR (EXCLUDED.source = 'lite_ai'
        AND feature_insights.source = 'deterministic')
    -- same source: refresh (handles report re-generation & cache refresh)
    OR (EXCLUDED.source = feature_insights.source);
END;
$$;

-- ── Cascade-clear trigger: invalidate cache when chart recalculated ───────────
-- When chart_data changes (e.g., dob correction), all cached insights for
-- that chart become stale and must be rebuilt on next read.

CREATE OR REPLACE FUNCTION fn_invalidate_chart_insights()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM feature_insights WHERE chart_id = NEW.id;
  -- Also clear open lite/enrich queue jobs for this chart
  UPDATE generation_queue
    SET status = 'skipped', completed_at = now()
  WHERE payload->>'chart_id' = NEW.id::text
    AND job_type IN ('feature_lite', 'feature_enrich')
    AND status IN ('pending', 'processing');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_invalidate_chart_insights
AFTER UPDATE ON kundli_charts
FOR EACH ROW
WHEN (OLD.chart_data IS DISTINCT FROM NEW.chart_data)
EXECUTE FUNCTION fn_invalidate_chart_insights();

-- ============================================================================
-- >>> 022_delete_account.sql
-- ============================================================================

-- Allows a signed-in user to permanently delete their own account.
-- SECURITY DEFINER lets the function run as the owning role (postgres),
-- which has permission to delete from auth.users.
-- Deleting from auth.users cascades to our public.users row (and all
-- child tables that reference it via ON DELETE CASCADE).

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard: only allow a signed-in user to delete themselves.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Only signed-in users may call this function.
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ============================================================================
-- >>> 023_palm_client_polylines.sql
-- ============================================================================

-- 023_palm_client_polylines.sql
--
-- Store client-computed hand-landmark polylines on palm_readings rows.
-- These are produced by MediaPipe Hand Landmarker on the user's device
-- (apps/web/src/lib/palm/handLandmarks.ts) at upload time, then merged
-- into the final analysis JSON by the server when the LLM stages finish.
--
-- Replaces the previous (unreliable) approach of asking the vision LLM
-- to output normalized polyline coordinates inline.

ALTER TABLE palm_readings
  ADD COLUMN IF NOT EXISTS client_polylines JSONB NULL;

COMMENT ON COLUMN palm_readings.client_polylines IS
  'MediaPipe-derived line traces from upload time. Shape: { heart, head, life, fate: Array<[number, number]> | null } in normalized 0-1 image coordinates. Server merges these into analysis.majorLines.*.polyline at persist time.';

-- ============================================================================
-- >>> 024_purchase_plans.sql
-- ============================================================================

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

-- ============================================================================
-- >>> 025_purge_reports.sql
-- ============================================================================

-- ============================================================================
-- 025: purge_reports — delete all report data, no table drops (re-enable safe)
-- ============================================================================
-- Clears every row from report-related tables so the app runs clean with no
-- report data. Tables are kept so re-enabling reports requires only a code
-- change (no new migrations). Run: supabase db push

TRUNCATE TABLE generated_reports  RESTART IDENTITY CASCADE;
TRUNCATE TABLE neural_pathways     RESTART IDENTITY CASCADE;

-- Also clear any pending generation queue jobs tied to reports
DELETE FROM generation_queue
  WHERE job_type IN (
    'kundli_insights',
    'numerology',
    'feature_enrich',
    'feature_lite',
    'life_journey_phase'
  );

-- ============================================================================
-- >>> 026_language_and_translations_cache.sql
-- ============================================================================

-- ============================================================================
-- 026: language_and_translations_cache
-- 1. Relax users.language CHECK to cover all 20 supported UI language codes
-- 2. New translations_cache table — shared UI string cache across all users
--    so /api/translate returns DB hits instead of calling NIM for known strings
-- ============================================================================

-- ── 1. Expand users.language constraint ──────────────────────────────────────
-- Previous constraint only covered 9 codes; LanguageSwitcher offers 20.
-- Existing rows are all valid under the new constraint — no backfill needed.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_language_check;
ALTER TABLE users ADD CONSTRAINT users_language_check
  CHECK (language IN (
    'en','hi','bn','ta','te','mr','gu','kn','ml',
    'pa','or','ur','ne','sa','es','fr','de','ar','zh','ja'
  ));

-- ── 2. Shared UI string translation cache ────────────────────────────────────
-- Keyed by (source_text, target_lang). Populated by /api/translate on NIM
-- miss; read before calling NIM on subsequent requests from any user.
-- Admin-only writes (service role); no RLS required.
CREATE TABLE IF NOT EXISTS translations_cache (
  source_text     text        NOT NULL,
  target_lang     text        NOT NULL,
  translated_text text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_text, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_translations_cache_lang
  ON translations_cache (target_lang);

-- ============================================================================
-- >>> 027_signup_bonus_100_tokens.sql
-- ============================================================================

-- ============================================================================
-- 027: signup_bonus_100_tokens
-- Increase new-user welcome bonus from 2 → 100 credits.
-- Updates the handle_new_user trigger function and the column default.
-- ============================================================================

-- Update column default so any direct INSERT without specifying credits
-- also gets 100 (belt-and-suspenders alongside the trigger).
ALTER TABLE public.users ALTER COLUMN credits SET DEFAULT 100;

-- Replace the trigger function with 100-credit signup bonus.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, name, credits)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', ''),
        100
    )
    ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            name  = CASE WHEN public.users.name = '' OR public.users.name IS NULL
                         THEN EXCLUDED.name ELSE public.users.name END;

    INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (
        NEW.id,
        100,
        'signup_bonus',
        'Welcome bonus — 100 free tokens'
    );

    RETURN NEW;
END;
$$;

-- ============================================================================
-- >>> 028_user_location.sql
-- ============================================================================

-- ============================================================================
-- 028: User current location
-- Stores the device's last-known location on the users row.
-- Distinct from birth_profiles.latitude/longitude (birth place — never touched).
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_latitude    decimal,
  ADD COLUMN IF NOT EXISTS current_longitude   decimal,
  ADD COLUMN IF NOT EXISTS current_city        text,
  ADD COLUMN IF NOT EXISTS current_country     text,
  ADD COLUMN IF NOT EXISTS location_source     text
    CHECK (location_source IN ('device', 'manual', 'ip')),
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;

-- ============================================================================
-- >>> 029_push_subscriptions_native.sql
-- ============================================================================

-- ============================================================================
-- 029: Push subscriptions — native platform discriminator
-- Extends push_subscriptions to hold FCM tokens alongside web-push keys.
-- Web rows: endpoint/p256dh/auth populated, platform='web' (default).
-- Android rows: fcm_token populated, platform='android-fcm'.
-- ============================================================================

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS platform  text NOT NULL DEFAULT 'web'
    CHECK (platform IN ('web', 'android-fcm', 'ios-apns')),
  ADD COLUMN IF NOT EXISTS fcm_token text;

-- Relax the NOT NULL constraints so native rows don't need web-push fields.
ALTER TABLE push_subscriptions ALTER COLUMN endpoint DROP NOT NULL;
ALTER TABLE push_subscriptions ALTER COLUMN p256dh   DROP NOT NULL;
ALTER TABLE push_subscriptions ALTER COLUMN auth     DROP NOT NULL;

-- Unique index so we can upsert on (user_id, fcm_token) without duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subs_fcm_token
  ON push_subscriptions (user_id, fcm_token)
  WHERE fcm_token IS NOT NULL;

-- ============================================================================
-- >>> 030_user_life_context.sql
-- ============================================================================

-- Add life-context fields to users for personalised AI readings
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profession             text,
  ADD COLUMN IF NOT EXISTS marital_status         text,
  ADD COLUMN IF NOT EXISTS financial_status       text,
  ADD COLUMN IF NOT EXISTS life_context_updated_at timestamptz;

COMMENT ON COLUMN users.profession             IS 'Free-text: e.g. "software engineer", "homemaker"';
COMMENT ON COLUMN users.marital_status         IS 'single | dating | engaged | married | separated_divorced | widowed';
COMMENT ON COLUMN users.financial_status       IS 'tight | stable | comfortable | prefer_not_to_say';

-- ============================================================================
-- BACKFILL: create public.users rows for any pre-existing auth.users
-- ----------------------------------------------------------------------------
-- The handle_new_user trigger only fires on INSERT into auth.users. After a
-- schema reset, existing auth.users rows have no matching public.users row,
-- so /api/user/settings PATCH (and any UPDATE on users) returns
-- "Cannot coerce the result to a single JSON object". This backfill closes
-- that gap. Safe on a clean DB - SELECT returns 0 rows.
-- ============================================================================
INSERT INTO public.users (id, email, name, credits)
SELECT
  id,
  email,
  COALESCE(
    NULLIF(TRIM(raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(TRIM(raw_user_meta_data ->> 'name'),      ''),
    ''
  ),
  100
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- POST-RUN STEPS (do these AFTER the SQL above succeeds)
-- ============================================================================
-- 1. In Supabase Dashboard -> Authentication -> Users -> "Invite user"
--    Email: admin@jyotishai.com
--
-- 2. Then run this in a fresh SQL Editor query to flip the admin flag.
--    The backfill above already created the row if the auth user existed,
--    but the admin flag still needs to be set:
--
-- UPDATE public.users SET is_admin = TRUE  WHERE email = 'admin@jyotishai.com';
-- UPDATE public.users SET is_admin = FALSE WHERE email = 's9575220017@gmail.com';
-- ============================================================================