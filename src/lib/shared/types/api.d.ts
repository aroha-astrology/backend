import type { Gender, TobSource, Language, PredictionType, VideoType } from './database';
export interface GenerateKundliRequest {
    name: string;
    dob: string;
    tob: string;
    tobSource: TobSource;
    pob: string;
    latitude: number;
    longitude: number;
    timezone: string;
    gender: Gender;
    isPrimary?: boolean;
    primaryConcern?: string;
    maritalStatus?: string;
    employment?: string;
    healthConcerns?: string;
    familyType?: string;
    birthOrder?: string;
    specificQuestion?: string;
    harshMode?: boolean;
}
export interface FollowUpAnswer {
    questionId: string;
    question: string;
    answer: string;
    dashaReference?: string;
}
export interface GeneratePredictionRequest {
    chartId: string;
    type: PredictionType;
    harshMode: boolean;
    language: Language;
    followUpAnswers?: FollowUpAnswer[];
}
export interface GenerateVideoRequest {
    chartId: string;
    type: VideoType;
    language: string;
    focusArea: string;
    specificQuestion?: string;
}
export interface MatchRequest {
    profile1: {
        name: string;
        dob: string;
        tob: string;
        pob: string;
        latitude: number;
        longitude: number;
        timezone: string;
        gender: Gender;
    };
    profile2: {
        name: string;
        dob: string;
        tob: string;
        pob: string;
        latitude: number;
        longitude: number;
        timezone: string;
        gender: Gender;
    };
    system: 'ashtakoota' | 'dashakoota';
    /** When false, the API skips persisting birth_profiles (used by the
     *  "New Matching" tab for one-off matches that shouldn't pollute the
     *  user's saved-kundli list). Defaults to true. */
    saveProfiles?: boolean;
}
export interface PalmReadingRequest {
    imageBase64: string;
    hand: 'left' | 'right';
}
export interface VastuRequest {
    roomLayout: Record<string, string[]>;
    roomDetails: Record<string, unknown>;
}
export interface MuhurtaRequest {
    type: string;
    startDate: string;
    endDate: string;
    latitude: number;
    longitude: number;
    timezone: string;
    chartId?: string;
}
export interface CreditPurchaseRequest {
    packId: string;
    amount: number;
}
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}
export interface PaginatedResponse<T = unknown> extends ApiResponse<T[]> {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
}
//# sourceMappingURL=api.d.ts.map