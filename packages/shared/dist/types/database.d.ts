export type Theme = 'dark' | 'light' | 'premium';
export type Language = 'en' | 'hi' | 'ta' | 'te' | 'bn' | 'gu' | 'mr' | 'kn' | 'ml';
export type ChartStyleDB = 'north' | 'south';
export type Gender = 'male' | 'female' | 'other';
export type TobSource = 'hospital' | 'certificate' | 'family' | 'approximate' | 'unknown';
export type PredictionType = 'personality' | 'career' | 'health' | 'marriage' | 'wealth' | 'children' | 'education' | 'difficulty' | 'daily' | 'monthly' | 'yearly';
export type RemedyType = 'vedic' | 'lalkitab' | 'gemstone' | 'mantra' | 'puja' | 'fasting' | 'charity' | 'yantra' | 'rudraksha';
export type MatchSystem = 'ashtakoota' | 'dashakoota';
export type VideoType = 'quick' | 'standard' | 'detailed';
export type VideoStatus = 'pending' | 'generating' | 'ready' | 'failed';
export type CreditType = 'signup_bonus' | 'purchase' | 'video_debit' | 'report_debit' | 'referral';
export type HandType = 'left' | 'right';
export type AstroStatus = 'pending' | 'approved' | 'rejected';
export type AstroPlan = 'basic' | 'premium' | 'premium_plus';
export interface UserRow {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    credits: number;
    theme: Theme;
    language: Language;
    chart_style: ChartStyleDB;
    is_premium: boolean;
    is_admin: boolean;
    premium_until: string | null;
    roles: ('personal' | 'astrologer' | 'pandit' | 'admin')[];
    account_type: 'personal' | 'astrologer' | 'pandit' | null;
    astro_status: AstroStatus | null;
    astro_plan: AstroPlan | null;
    customer_limit: number;
    current_city: string | null;
    profession: string | null;
    marital_status: string | null;
    financial_status: string | null;
    life_context_updated_at: string | null;
    legal_accepted_at: string | null;
    legal_version: number | null;
    apollo_sector: string | null;
    apollo_seniority: string | null;
    apollo_state: string | null;
    apollo_country: string | null;
    apollo_years_experience: number | null;
    apollo_enriched_at: string | null;
    apollo_derived_at: string | null;
    apollo_reveal_at: string | null;
    voice_call_enabled: boolean;
    created_at: string;
}
export interface BirthProfileRow {
    id: string;
    user_id: string;
    name: string;
    dob: string;
    tob: string;
    tob_source: TobSource;
    pob: string;
    latitude: number;
    longitude: number;
    timezone: string;
    gender: Gender;
    is_primary: boolean;
    created_at: string;
}
export interface KundliChartRow {
    id: string;
    profile_id: string;
    user_id: string;
    ayanamsa: string;
    chart_data: Record<string, unknown>;
    divisional_charts: Record<string, unknown>;
    dasha_data: Record<string, unknown>;
    yoga_data: Record<string, unknown>;
    dosha_data: Record<string, unknown>;
    shadbala: Record<string, unknown>;
    ashtakavarga: Record<string, unknown>;
    panchang_at_birth: Record<string, unknown>;
    created_at: string;
}
export interface PredictionRow {
    id: string;
    chart_id: string;
    user_id: string;
    type: PredictionType;
    harsh_mode: boolean;
    content: Record<string, unknown>;
    follow_up_answers: Record<string, unknown> | null;
    language: string;
    created_at: string;
}
export interface RemedyRow {
    id: string;
    chart_id: string;
    user_id: string;
    type: RemedyType;
    planet: string | null;
    house: number | null;
    content: Record<string, unknown>;
    created_at: string;
}
export interface MatchReportRow {
    id: string;
    user_id: string;
    profile1_id: string;
    profile2_id: string;
    system: MatchSystem;
    gun_scores: Record<string, unknown>;
    total_score: number;
    detailed_analysis: Record<string, unknown>;
    created_at: string;
}
export interface LalKitabChartRow {
    id: string;
    chart_id: string;
    teva: Record<string, unknown>;
    debts: Record<string, unknown>;
    blind_planets: Record<string, unknown>;
    remedies: Record<string, unknown>;
    created_at: string;
}
export interface VideoReadingRow {
    id: string;
    user_id: string;
    chart_id: string;
    type: VideoType;
    language: string;
    script: Record<string, unknown> | null;
    audio_url: string | null;
    video_url: string | null;
    duration_seconds: number | null;
    credits_used: number;
    status: VideoStatus;
    created_at: string;
}
export interface CreditTransactionRow {
    id: string;
    user_id: string;
    amount: number;
    type: CreditType;
    description: string | null;
    razorpay_payment_id: string | null;
    created_at: string;
}
export interface VastuAnalysisRow {
    id: string;
    user_id: string;
    room_layout: Record<string, unknown>;
    room_details: Record<string, unknown>;
    analysis: Record<string, unknown>;
    created_at: string;
}
export interface PalmReadingRow {
    id: string;
    user_id: string;
    image_url: string;
    hand: HandType;
    analysis: Record<string, unknown>;
    created_at: string;
}
export interface FollowUpQuestionRow {
    id: string;
    chart_id: string;
    question: string;
    options: Record<string, unknown>;
    answer: string | null;
    dasha_period: string | null;
    created_at: string;
}
export interface DailyHoroscopeRow {
    id: string;
    rashi: string;
    date: string;
    language: string;
    content: Record<string, unknown>;
}
export interface PanchangCacheRow {
    id: string;
    date: string;
    location: string;
    data: Record<string, unknown>;
}
export interface AstrologerCustomerRow {
    id: string;
    astrologer_id: string;
    name: string;
    dob: string;
    birth_time: string | null;
    birth_place: string | null;
    gender: 'male' | 'female' | 'other' | null;
    notes: string | null;
    created_at: string;
}
//# sourceMappingURL=database.d.ts.map