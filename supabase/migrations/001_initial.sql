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
