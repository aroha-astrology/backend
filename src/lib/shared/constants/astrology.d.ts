import type { Planet, ZodiacSign, Nakshatra, Rashi } from '../types/astrology';
export declare const ZODIAC_SIGNS: ZodiacSign[];
export declare const RASHI_NAMES: Rashi[];
export declare const ZODIAC_TO_RASHI: Record<ZodiacSign, Rashi>;
export declare const SIGN_LORDS: Record<ZodiacSign, Planet>;
export declare const PLANETS: Planet[];
export declare const PLANET_ABBREVIATIONS: Record<Planet, string>;
export declare const PLANET_HINDI: Record<Planet, string>;
export declare const NATURAL_BENEFICS: Planet[];
export declare const NATURAL_MALEFICS: Planet[];
export declare const PLANET_EXALTATION: Partial<Record<Planet, {
    sign: ZodiacSign;
    degree: number;
}>>;
export declare const PLANET_DEBILITATION: Partial<Record<Planet, {
    sign: ZodiacSign;
    degree: number;
}>>;
export declare const PLANET_OWN_SIGNS: Record<Planet, ZodiacSign[]>;
export declare const PLANET_FRIENDS: Record<Planet, Planet[]>;
export declare const PLANET_ENEMIES: Record<Planet, Planet[]>;
export declare const SWISSEPH_PLANETS: Record<Planet, number>;
export declare const NAKSHATRAS: Nakshatra[];
export declare const NAKSHATRA_LORDS: Planet[];
export declare const NAKSHATRA_SPAN: number;
export declare const VIMSHOTTARI_ORDER: Planet[];
export declare const VIMSHOTTARI_YEARS: Record<Planet, number>;
export declare const VIMSHOTTARI_TOTAL_YEARS = 120;
export declare const YOGINI_NAMES: string[];
export declare const YOGINI_YEARS: number[];
export declare const YOGINI_PLANETS: Planet[];
export declare const KOOTA_MAX_SCORES: {
    readonly Varna: 1;
    readonly Vashya: 2;
    readonly Tara: 3;
    readonly Yoni: 4;
    readonly GrahaMaitri: 5;
    readonly Gana: 6;
    readonly Bhakoot: 7;
    readonly Nadi: 8;
};
export declare const NAKSHATRA_GANA: Record<number, 'Deva' | 'Manushya' | 'Rakshasa'>;
export declare const NAKSHATRA_YONI: Record<number, {
    animal: string;
    type: 'male' | 'female';
}>;
export declare const NAKSHATRA_NADI: Record<number, 'Aadi' | 'Madhya' | 'Antya'>;
export declare const LALKITAB_PAKKA_GHAR: Record<Planet, number>;
export declare const RAHU_KAAL_PERIODS: Record<number, number>;
export declare const KAAL_SARP_TYPES: Record<string, string>;
export interface CityData {
    name: string;
    state: string;
    latitude: number;
    longitude: number;
    timezone: string;
}
export declare const INDIAN_CITIES: CityData[];
export declare const CREDIT_PACKS: readonly [{
    readonly id: "pack_10";
    readonly credits: 10;
    readonly price: 99;
    readonly label: "10 Credits";
}, {
    readonly id: "pack_30";
    readonly credits: 30;
    readonly price: 249;
    readonly label: "30 Credits";
}, {
    readonly id: "pack_100";
    readonly credits: 100;
    readonly price: 699;
    readonly label: "100 Credits";
}];
export declare const VIDEO_CREDIT_COSTS: Record<string, number>;
export declare const REPORT_PRICING: readonly [{
    readonly id: "basic";
    readonly pages: 15;
    readonly price: 99;
    readonly label: "Basic Report";
}, {
    readonly id: "standard";
    readonly pages: 50;
    readonly price: 299;
    readonly label: "Standard Report";
}, {
    readonly id: "premium";
    readonly pages: 100;
    readonly price: 499;
    readonly label: "Premium Report";
}];
export declare const LIFE_DECISION_CATEGORIES: readonly ["vehicle", "property", "business", "baby", "job", "education", "travel", "investment", "wedding", "naming", "phone", "diet", "daily", "surgery", "legal", "government", "event", "wardrobe", "jewelry", "food", "fitness", "meditation", "health_alert", "mobile_number", "wallpaper"];
export type LifeDecisionCategory = (typeof LIFE_DECISION_CATEGORIES)[number];
//# sourceMappingURL=astrology.d.ts.map