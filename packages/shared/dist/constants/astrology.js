"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIFE_DECISION_CATEGORIES = exports.REPORT_PRICING = exports.VIDEO_CREDIT_COSTS = exports.CREDIT_PACKS = exports.INDIAN_CITIES = exports.KAAL_SARP_TYPES = exports.RAHU_KAAL_PERIODS = exports.LALKITAB_PAKKA_GHAR = exports.NAKSHATRA_NADI = exports.NAKSHATRA_YONI = exports.NAKSHATRA_GANA = exports.KOOTA_MAX_SCORES = exports.YOGINI_PLANETS = exports.YOGINI_YEARS = exports.YOGINI_NAMES = exports.VIMSHOTTARI_TOTAL_YEARS = exports.VIMSHOTTARI_YEARS = exports.VIMSHOTTARI_ORDER = exports.NAKSHATRA_SPAN = exports.NAKSHATRA_LORDS = exports.NAKSHATRAS = exports.SWISSEPH_PLANETS = exports.PLANET_ENEMIES = exports.PLANET_FRIENDS = exports.PLANET_OWN_SIGNS = exports.PLANET_DEBILITATION = exports.PLANET_EXALTATION = exports.NATURAL_MALEFICS = exports.NATURAL_BENEFICS = exports.PLANET_HINDI = exports.PLANET_ABBREVIATIONS = exports.PLANETS = exports.SIGN_LORDS = exports.ZODIAC_TO_RASHI = exports.RASHI_NAMES = exports.ZODIAC_SIGNS = void 0;
// ============================================================
// Zodiac Signs
// ============================================================
exports.ZODIAC_SIGNS = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];
exports.RASHI_NAMES = [
    'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
    'Tula', 'Vrischika', 'Dhanu', 'Makara', 'Kumbha', 'Meena',
];
exports.ZODIAC_TO_RASHI = {
    Aries: 'Mesha', Taurus: 'Vrishabha', Gemini: 'Mithuna', Cancer: 'Karka',
    Leo: 'Simha', Virgo: 'Kanya', Libra: 'Tula', Scorpio: 'Vrischika',
    Sagittarius: 'Dhanu', Capricorn: 'Makara', Aquarius: 'Kumbha', Pisces: 'Meena',
};
exports.SIGN_LORDS = {
    Aries: 'Mars', Taurus: 'Venus', Gemini: 'Mercury', Cancer: 'Moon',
    Leo: 'Sun', Virgo: 'Mercury', Libra: 'Venus', Scorpio: 'Mars',
    Sagittarius: 'Jupiter', Capricorn: 'Saturn', Aquarius: 'Saturn', Pisces: 'Jupiter',
};
// ============================================================
// Planets
// ============================================================
exports.PLANETS = [
    'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu',
];
exports.PLANET_ABBREVIATIONS = {
    Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me',
    Jupiter: 'Ju', Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke',
};
exports.PLANET_HINDI = {
    Sun: 'सूर्य', Moon: 'चंद्र', Mars: 'मंगल', Mercury: 'बुध',
    Jupiter: 'गुरु', Venus: 'शुक्र', Saturn: 'शनि', Rahu: 'राहु', Ketu: 'केतु',
};
exports.NATURAL_BENEFICS = ['Jupiter', 'Venus', 'Moon', 'Mercury'];
exports.NATURAL_MALEFICS = ['Sun', 'Mars', 'Saturn', 'Rahu', 'Ketu'];
exports.PLANET_EXALTATION = {
    Sun: { sign: 'Aries', degree: 10 },
    Moon: { sign: 'Taurus', degree: 3 },
    Mars: { sign: 'Capricorn', degree: 28 },
    Mercury: { sign: 'Virgo', degree: 15 },
    Jupiter: { sign: 'Cancer', degree: 5 },
    Venus: { sign: 'Pisces', degree: 27 },
    Saturn: { sign: 'Libra', degree: 20 },
    Rahu: { sign: 'Taurus', degree: 20 },
    Ketu: { sign: 'Scorpio', degree: 20 },
};
exports.PLANET_DEBILITATION = {
    Sun: { sign: 'Libra', degree: 10 },
    Moon: { sign: 'Scorpio', degree: 3 },
    Mars: { sign: 'Cancer', degree: 28 },
    Mercury: { sign: 'Pisces', degree: 15 },
    Jupiter: { sign: 'Capricorn', degree: 5 },
    Venus: { sign: 'Virgo', degree: 27 },
    Saturn: { sign: 'Aries', degree: 20 },
    Rahu: { sign: 'Scorpio', degree: 20 },
    Ketu: { sign: 'Taurus', degree: 20 },
};
exports.PLANET_OWN_SIGNS = {
    Sun: ['Leo'],
    Moon: ['Cancer'],
    Mars: ['Aries', 'Scorpio'],
    Mercury: ['Gemini', 'Virgo'],
    Jupiter: ['Sagittarius', 'Pisces'],
    Venus: ['Taurus', 'Libra'],
    Saturn: ['Capricorn', 'Aquarius'],
    Rahu: ['Aquarius'],
    Ketu: ['Scorpio'],
};
exports.PLANET_FRIENDS = {
    Sun: ['Moon', 'Mars', 'Jupiter'],
    Moon: ['Sun', 'Mercury'],
    Mars: ['Sun', 'Moon', 'Jupiter'],
    Mercury: ['Sun', 'Venus'],
    Jupiter: ['Sun', 'Moon', 'Mars'],
    Venus: ['Mercury', 'Saturn'],
    Saturn: ['Mercury', 'Venus'],
    Rahu: ['Mercury', 'Venus', 'Saturn'],
    Ketu: ['Mars', 'Venus', 'Saturn'],
};
exports.PLANET_ENEMIES = {
    Sun: ['Venus', 'Saturn'],
    Moon: [],
    Mars: ['Mercury'],
    Mercury: ['Moon'],
    Jupiter: ['Mercury', 'Venus'],
    Venus: ['Sun', 'Moon'],
    Saturn: ['Sun', 'Moon', 'Mars'],
    Rahu: ['Sun', 'Moon', 'Mars'],
    Ketu: ['Sun', 'Moon'],
};
// Swiss Ephemeris planet IDs
exports.SWISSEPH_PLANETS = {
    Sun: 0, Moon: 1, Mars: 4, Mercury: 2,
    Jupiter: 5, Venus: 3, Saturn: 6, Rahu: 11, Ketu: -1, // Ketu = Rahu + 180
};
// ============================================================
// Nakshatras
// ============================================================
exports.NAKSHATRAS = [
    'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
    'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'PurvaPhalguni', 'UttaraPhalguni',
    'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
    'Moola', 'PurvaAshadha', 'UttaraAshadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
    'PurvaBhadrapada', 'UttaraBhadrapada', 'Revati',
];
exports.NAKSHATRA_LORDS = [
    'Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu',
    'Jupiter', 'Saturn', 'Mercury', 'Ketu', 'Venus', 'Sun',
    'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury',
    'Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu',
    'Jupiter', 'Saturn', 'Mercury',
];
exports.NAKSHATRA_SPAN = 13 + 1 / 3; // 13°20' in degrees
// ============================================================
// Vimshottari Dasha
// ============================================================
exports.VIMSHOTTARI_ORDER = [
    'Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury',
];
exports.VIMSHOTTARI_YEARS = {
    Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7,
    Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
};
exports.VIMSHOTTARI_TOTAL_YEARS = 120;
// ============================================================
// Yogini Dasha
// ============================================================
exports.YOGINI_NAMES = [
    'Mangala', 'Pingala', 'Dhanya', 'Bhramari', 'Bhadrika', 'Ulka', 'Siddha', 'Sankata',
];
exports.YOGINI_YEARS = [1, 2, 3, 4, 5, 6, 7, 8]; // Total 36
exports.YOGINI_PLANETS = [
    'Moon', 'Sun', 'Jupiter', 'Mars', 'Mercury', 'Saturn', 'Venus', 'Rahu',
];
// ============================================================
// Ashtakoota Matching
// ============================================================
exports.KOOTA_MAX_SCORES = {
    Varna: 1,
    Vashya: 2,
    Tara: 3,
    Yoni: 4,
    GrahaMaitri: 5,
    Gana: 6,
    Bhakoot: 7,
    Nadi: 8,
};
exports.NAKSHATRA_GANA = {
    0: 'Deva', 1: 'Manushya', 2: 'Deva', 3: 'Manushya', 4: 'Deva', 5: 'Manushya',
    6: 'Deva', 7: 'Deva', 8: 'Rakshasa', 9: 'Rakshasa', 10: 'Manushya', 11: 'Manushya',
    12: 'Deva', 13: 'Rakshasa', 14: 'Deva', 15: 'Rakshasa', 16: 'Deva', 17: 'Rakshasa',
    18: 'Rakshasa', 19: 'Manushya', 20: 'Manushya', 21: 'Deva', 22: 'Rakshasa', 23: 'Rakshasa',
    24: 'Manushya', 25: 'Manushya', 26: 'Deva',
};
exports.NAKSHATRA_YONI = {
    0: { animal: 'Horse', type: 'male' }, 1: { animal: 'Elephant', type: 'male' },
    2: { animal: 'Goat', type: 'female' }, 3: { animal: 'Serpent', type: 'male' },
    4: { animal: 'Serpent', type: 'female' }, 5: { animal: 'Dog', type: 'female' },
    6: { animal: 'Cat', type: 'female' }, 7: { animal: 'Goat', type: 'male' },
    8: { animal: 'Cat', type: 'male' }, 9: { animal: 'Rat', type: 'male' },
    10: { animal: 'Rat', type: 'female' }, 11: { animal: 'Cow', type: 'male' },
    12: { animal: 'Buffalo', type: 'female' }, 13: { animal: 'Tiger', type: 'female' },
    14: { animal: 'Buffalo', type: 'male' }, 15: { animal: 'Tiger', type: 'male' },
    16: { animal: 'Deer', type: 'female' }, 17: { animal: 'Deer', type: 'male' },
    18: { animal: 'Dog', type: 'male' }, 19: { animal: 'Monkey', type: 'male' },
    20: { animal: 'Mongoose', type: 'male' }, 21: { animal: 'Monkey', type: 'female' },
    22: { animal: 'Lion', type: 'female' }, 23: { animal: 'Horse', type: 'female' },
    24: { animal: 'Lion', type: 'male' }, 25: { animal: 'Cow', type: 'female' },
    26: { animal: 'Elephant', type: 'female' },
};
exports.NAKSHATRA_NADI = {
    0: 'Aadi', 1: 'Madhya', 2: 'Antya', 3: 'Antya', 4: 'Madhya', 5: 'Aadi',
    6: 'Aadi', 7: 'Madhya', 8: 'Antya', 9: 'Aadi', 10: 'Madhya', 11: 'Antya',
    12: 'Antya', 13: 'Madhya', 14: 'Aadi', 15: 'Aadi', 16: 'Madhya', 17: 'Antya',
    18: 'Aadi', 19: 'Madhya', 20: 'Antya', 21: 'Antya', 22: 'Madhya', 23: 'Aadi',
    24: 'Aadi', 25: 'Madhya', 26: 'Antya',
};
// ============================================================
// Lal Kitab
// ============================================================
exports.LALKITAB_PAKKA_GHAR = {
    Sun: 1, Moon: 4, Mars: 3, Mercury: 7,
    Jupiter: 2, Venus: 7, Saturn: 8, Rahu: 12, Ketu: 6,
};
// ============================================================
// Rahu Kaal by Day (0=Sunday)
// ============================================================
exports.RAHU_KAAL_PERIODS = {
    0: 8, // Sunday: 8th period
    1: 2, // Monday: 2nd
    2: 7, // Tuesday: 7th
    3: 5, // Wednesday: 5th
    4: 6, // Thursday: 6th
    5: 4, // Friday: 4th
    6: 3, // Saturday: 3rd
};
// ============================================================
// Kaal Sarp Types
// ============================================================
exports.KAAL_SARP_TYPES = {
    '1-7': 'Anant', '2-8': 'Kulik', '3-9': 'Vasuki',
    '4-10': 'Shankhpal', '5-11': 'Padma', '6-12': 'MahaPadma',
    '7-1': 'Takshak', '8-2': 'Karkotak', '9-3': 'Shankhnaad',
    '10-4': 'Ghatak', '11-5': 'Vishdhar', '12-6': 'Sheshnaag',
};
exports.INDIAN_CITIES = [
    { name: 'Mumbai', state: 'Maharashtra', latitude: 19.076, longitude: 72.8777, timezone: 'Asia/Kolkata' },
    { name: 'Delhi', state: 'Delhi', latitude: 28.6139, longitude: 77.209, timezone: 'Asia/Kolkata' },
    { name: 'Bangalore', state: 'Karnataka', latitude: 12.9716, longitude: 77.5946, timezone: 'Asia/Kolkata' },
    { name: 'Hyderabad', state: 'Telangana', latitude: 17.385, longitude: 78.4867, timezone: 'Asia/Kolkata' },
    { name: 'Ahmedabad', state: 'Gujarat', latitude: 23.0225, longitude: 72.5714, timezone: 'Asia/Kolkata' },
    { name: 'Chennai', state: 'Tamil Nadu', latitude: 13.0827, longitude: 80.2707, timezone: 'Asia/Kolkata' },
    { name: 'Kolkata', state: 'West Bengal', latitude: 22.5726, longitude: 88.3639, timezone: 'Asia/Kolkata' },
    { name: 'Pune', state: 'Maharashtra', latitude: 18.5204, longitude: 73.8567, timezone: 'Asia/Kolkata' },
    { name: 'Jaipur', state: 'Rajasthan', latitude: 26.9124, longitude: 75.7873, timezone: 'Asia/Kolkata' },
    { name: 'Lucknow', state: 'Uttar Pradesh', latitude: 26.8467, longitude: 80.9462, timezone: 'Asia/Kolkata' },
    { name: 'Kanpur', state: 'Uttar Pradesh', latitude: 26.4499, longitude: 80.3319, timezone: 'Asia/Kolkata' },
    { name: 'Nagpur', state: 'Maharashtra', latitude: 21.1458, longitude: 79.0882, timezone: 'Asia/Kolkata' },
    { name: 'Indore', state: 'Madhya Pradesh', latitude: 22.7196, longitude: 75.8577, timezone: 'Asia/Kolkata' },
    { name: 'Thane', state: 'Maharashtra', latitude: 19.2183, longitude: 72.9781, timezone: 'Asia/Kolkata' },
    { name: 'Bhopal', state: 'Madhya Pradesh', latitude: 23.2599, longitude: 77.4126, timezone: 'Asia/Kolkata' },
    { name: 'Visakhapatnam', state: 'Andhra Pradesh', latitude: 17.6868, longitude: 83.2185, timezone: 'Asia/Kolkata' },
    { name: 'Patna', state: 'Bihar', latitude: 25.6093, longitude: 85.1376, timezone: 'Asia/Kolkata' },
    { name: 'Vadodara', state: 'Gujarat', latitude: 22.3072, longitude: 73.1812, timezone: 'Asia/Kolkata' },
    { name: 'Ghaziabad', state: 'Uttar Pradesh', latitude: 28.6692, longitude: 77.4538, timezone: 'Asia/Kolkata' },
    { name: 'Ludhiana', state: 'Punjab', latitude: 30.901, longitude: 75.8573, timezone: 'Asia/Kolkata' },
    { name: 'Agra', state: 'Uttar Pradesh', latitude: 27.1767, longitude: 78.0081, timezone: 'Asia/Kolkata' },
    { name: 'Nashik', state: 'Maharashtra', latitude: 19.9975, longitude: 73.7898, timezone: 'Asia/Kolkata' },
    { name: 'Varanasi', state: 'Uttar Pradesh', latitude: 25.3176, longitude: 82.9739, timezone: 'Asia/Kolkata' },
    { name: 'Meerut', state: 'Uttar Pradesh', latitude: 28.9845, longitude: 77.7064, timezone: 'Asia/Kolkata' },
    { name: 'Rajkot', state: 'Gujarat', latitude: 22.3039, longitude: 70.8022, timezone: 'Asia/Kolkata' },
    { name: 'Srinagar', state: 'Jammu & Kashmir', latitude: 34.0837, longitude: 74.7973, timezone: 'Asia/Kolkata' },
    { name: 'Aurangabad', state: 'Maharashtra', latitude: 19.8762, longitude: 75.3433, timezone: 'Asia/Kolkata' },
    { name: 'Dhanbad', state: 'Jharkhand', latitude: 23.7957, longitude: 86.4304, timezone: 'Asia/Kolkata' },
    { name: 'Amritsar', state: 'Punjab', latitude: 31.634, longitude: 74.8723, timezone: 'Asia/Kolkata' },
    { name: 'Allahabad', state: 'Uttar Pradesh', latitude: 25.4358, longitude: 81.8463, timezone: 'Asia/Kolkata' },
    { name: 'Ranchi', state: 'Jharkhand', latitude: 23.3441, longitude: 85.3096, timezone: 'Asia/Kolkata' },
    { name: 'Coimbatore', state: 'Tamil Nadu', latitude: 11.0168, longitude: 76.9558, timezone: 'Asia/Kolkata' },
    { name: 'Jabalpur', state: 'Madhya Pradesh', latitude: 23.1815, longitude: 79.9864, timezone: 'Asia/Kolkata' },
    { name: 'Gwalior', state: 'Madhya Pradesh', latitude: 26.2183, longitude: 78.1828, timezone: 'Asia/Kolkata' },
    { name: 'Vijayawada', state: 'Andhra Pradesh', latitude: 16.5062, longitude: 80.648, timezone: 'Asia/Kolkata' },
    { name: 'Madurai', state: 'Tamil Nadu', latitude: 9.9252, longitude: 78.1198, timezone: 'Asia/Kolkata' },
    { name: 'Guwahati', state: 'Assam', latitude: 26.1445, longitude: 91.7362, timezone: 'Asia/Kolkata' },
    { name: 'Chandigarh', state: 'Chandigarh', latitude: 30.7333, longitude: 76.7794, timezone: 'Asia/Kolkata' },
    { name: 'Hubli', state: 'Karnataka', latitude: 15.3647, longitude: 75.124, timezone: 'Asia/Kolkata' },
    { name: 'Mysore', state: 'Karnataka', latitude: 12.2958, longitude: 76.6394, timezone: 'Asia/Kolkata' },
    { name: 'Trivandrum', state: 'Kerala', latitude: 8.5241, longitude: 76.9366, timezone: 'Asia/Kolkata' },
    { name: 'Kochi', state: 'Kerala', latitude: 9.9312, longitude: 76.2673, timezone: 'Asia/Kolkata' },
    { name: 'Jodhpur', state: 'Rajasthan', latitude: 26.2389, longitude: 73.0243, timezone: 'Asia/Kolkata' },
    { name: 'Raipur', state: 'Chhattisgarh', latitude: 21.2514, longitude: 81.6296, timezone: 'Asia/Kolkata' },
    { name: 'Kota', state: 'Rajasthan', latitude: 25.2138, longitude: 75.8648, timezone: 'Asia/Kolkata' },
    { name: 'Dehradun', state: 'Uttarakhand', latitude: 30.3165, longitude: 78.0322, timezone: 'Asia/Kolkata' },
    { name: 'Bhubaneswar', state: 'Odisha', latitude: 20.2961, longitude: 85.8245, timezone: 'Asia/Kolkata' },
    { name: 'Tiruchirappalli', state: 'Tamil Nadu', latitude: 10.7905, longitude: 78.7047, timezone: 'Asia/Kolkata' },
    { name: 'Surat', state: 'Gujarat', latitude: 21.1702, longitude: 72.8311, timezone: 'Asia/Kolkata' },
    { name: 'Noida', state: 'Uttar Pradesh', latitude: 28.5355, longitude: 77.391, timezone: 'Asia/Kolkata' },
    // --- Additional Indian cities (1 lakh+ population) ---
    { name: 'Jamshedpur', state: 'Jharkhand', latitude: 22.8046, longitude: 86.2029, timezone: 'Asia/Kolkata' },
    { name: 'Bokaro', state: 'Jharkhand', latitude: 23.6693, longitude: 86.1511, timezone: 'Asia/Kolkata' },
    { name: 'Gaya', state: 'Bihar', latitude: 24.7955, longitude: 84.9994, timezone: 'Asia/Kolkata' },
    { name: 'Muzaffarpur', state: 'Bihar', latitude: 26.1209, longitude: 85.3647, timezone: 'Asia/Kolkata' },
    { name: 'Bhagalpur', state: 'Bihar', latitude: 25.2425, longitude: 86.9842, timezone: 'Asia/Kolkata' },
    { name: 'Darbhanga', state: 'Bihar', latitude: 26.1542, longitude: 85.8918, timezone: 'Asia/Kolkata' },
    { name: 'Purnia', state: 'Bihar', latitude: 25.7771, longitude: 87.4753, timezone: 'Asia/Kolkata' },
    { name: 'Siliguri', state: 'West Bengal', latitude: 26.7271, longitude: 88.3953, timezone: 'Asia/Kolkata' },
    { name: 'Asansol', state: 'West Bengal', latitude: 23.6739, longitude: 86.9524, timezone: 'Asia/Kolkata' },
    { name: 'Durgapur', state: 'West Bengal', latitude: 23.5204, longitude: 87.3119, timezone: 'Asia/Kolkata' },
    { name: 'Howrah', state: 'West Bengal', latitude: 22.5958, longitude: 88.2636, timezone: 'Asia/Kolkata' },
    { name: 'Cuttack', state: 'Odisha', latitude: 20.4625, longitude: 85.8828, timezone: 'Asia/Kolkata' },
    { name: 'Rourkela', state: 'Odisha', latitude: 22.2604, longitude: 84.8536, timezone: 'Asia/Kolkata' },
    { name: 'Berhampur', state: 'Odisha', latitude: 19.3149, longitude: 84.794, timezone: 'Asia/Kolkata' },
    { name: 'Sambalpur', state: 'Odisha', latitude: 21.4669, longitude: 83.9812, timezone: 'Asia/Kolkata' },
    { name: 'Bilaspur', state: 'Chhattisgarh', latitude: 22.0797, longitude: 82.1391, timezone: 'Asia/Kolkata' },
    { name: 'Bhilai', state: 'Chhattisgarh', latitude: 21.2094, longitude: 81.378, timezone: 'Asia/Kolkata' },
    { name: 'Korba', state: 'Chhattisgarh', latitude: 22.3595, longitude: 82.7501, timezone: 'Asia/Kolkata' },
    { name: 'Dibrugarh', state: 'Assam', latitude: 27.4728, longitude: 94.9119, timezone: 'Asia/Kolkata' },
    { name: 'Jorhat', state: 'Assam', latitude: 26.7509, longitude: 94.2037, timezone: 'Asia/Kolkata' },
    { name: 'Tezpur', state: 'Assam', latitude: 26.6338, longitude: 92.7926, timezone: 'Asia/Kolkata' },
    { name: 'Silchar', state: 'Assam', latitude: 24.8333, longitude: 92.7789, timezone: 'Asia/Kolkata' },
    { name: 'Imphal', state: 'Manipur', latitude: 24.817, longitude: 93.9368, timezone: 'Asia/Kolkata' },
    { name: 'Shillong', state: 'Meghalaya', latitude: 25.5788, longitude: 91.8933, timezone: 'Asia/Kolkata' },
    { name: 'Agartala', state: 'Tripura', latitude: 23.8315, longitude: 91.2868, timezone: 'Asia/Kolkata' },
    { name: 'Aizawl', state: 'Mizoram', latitude: 23.7271, longitude: 92.7176, timezone: 'Asia/Kolkata' },
    { name: 'Kohima', state: 'Nagaland', latitude: 25.6751, longitude: 94.1086, timezone: 'Asia/Kolkata' },
    { name: 'Itanagar', state: 'Arunachal Pradesh', latitude: 27.0844, longitude: 93.6053, timezone: 'Asia/Kolkata' },
    { name: 'Gangtok', state: 'Sikkim', latitude: 27.3389, longitude: 88.6065, timezone: 'Asia/Kolkata' },
    { name: 'Shimla', state: 'Himachal Pradesh', latitude: 31.1048, longitude: 77.1734, timezone: 'Asia/Kolkata' },
    { name: 'Manali', state: 'Himachal Pradesh', latitude: 32.2396, longitude: 77.1887, timezone: 'Asia/Kolkata' },
    { name: 'Dharamshala', state: 'Himachal Pradesh', latitude: 32.219, longitude: 76.3234, timezone: 'Asia/Kolkata' },
    { name: 'Jammu', state: 'Jammu & Kashmir', latitude: 32.7266, longitude: 74.857, timezone: 'Asia/Kolkata' },
    { name: 'Leh', state: 'Ladakh', latitude: 34.1526, longitude: 77.5771, timezone: 'Asia/Kolkata' },
    { name: 'Panaji', state: 'Goa', latitude: 15.4909, longitude: 73.8278, timezone: 'Asia/Kolkata' },
    { name: 'Margao', state: 'Goa', latitude: 15.2832, longitude: 73.9862, timezone: 'Asia/Kolkata' },
    { name: 'Pondicherry', state: 'Puducherry', latitude: 11.9416, longitude: 79.8083, timezone: 'Asia/Kolkata' },
    { name: 'Port Blair', state: 'Andaman & Nicobar', latitude: 11.6234, longitude: 92.7265, timezone: 'Asia/Kolkata' },
    { name: 'Udaipur', state: 'Rajasthan', latitude: 24.5854, longitude: 73.7125, timezone: 'Asia/Kolkata' },
    { name: 'Ajmer', state: 'Rajasthan', latitude: 26.4499, longitude: 74.6399, timezone: 'Asia/Kolkata' },
    { name: 'Bikaner', state: 'Rajasthan', latitude: 28.0229, longitude: 73.3119, timezone: 'Asia/Kolkata' },
    { name: 'Alwar', state: 'Rajasthan', latitude: 27.5529, longitude: 76.6346, timezone: 'Asia/Kolkata' },
    { name: 'Bharatpur', state: 'Rajasthan', latitude: 27.2152, longitude: 77.5, timezone: 'Asia/Kolkata' },
    { name: 'Pali', state: 'Rajasthan', latitude: 25.7711, longitude: 73.3234, timezone: 'Asia/Kolkata' },
    { name: 'Gorakhpur', state: 'Uttar Pradesh', latitude: 26.7606, longitude: 83.3732, timezone: 'Asia/Kolkata' },
    { name: 'Bareilly', state: 'Uttar Pradesh', latitude: 28.367, longitude: 79.4304, timezone: 'Asia/Kolkata' },
    { name: 'Moradabad', state: 'Uttar Pradesh', latitude: 28.8389, longitude: 78.7768, timezone: 'Asia/Kolkata' },
    { name: 'Aligarh', state: 'Uttar Pradesh', latitude: 27.8974, longitude: 78.088, timezone: 'Asia/Kolkata' },
    { name: 'Saharanpur', state: 'Uttar Pradesh', latitude: 29.964, longitude: 77.5452, timezone: 'Asia/Kolkata' },
    { name: 'Mathura', state: 'Uttar Pradesh', latitude: 27.4924, longitude: 77.6737, timezone: 'Asia/Kolkata' },
    { name: 'Firozabad', state: 'Uttar Pradesh', latitude: 27.1591, longitude: 78.3957, timezone: 'Asia/Kolkata' },
    { name: 'Jhansi', state: 'Uttar Pradesh', latitude: 25.4484, longitude: 78.5685, timezone: 'Asia/Kolkata' },
    { name: 'Ayodhya', state: 'Uttar Pradesh', latitude: 26.7922, longitude: 82.1998, timezone: 'Asia/Kolkata' },
    { name: 'Prayagraj', state: 'Uttar Pradesh', latitude: 25.4358, longitude: 81.8463, timezone: 'Asia/Kolkata' },
    { name: 'Haridwar', state: 'Uttarakhand', latitude: 29.9457, longitude: 78.1642, timezone: 'Asia/Kolkata' },
    { name: 'Rishikesh', state: 'Uttarakhand', latitude: 30.0869, longitude: 78.2676, timezone: 'Asia/Kolkata' },
    { name: 'Nainital', state: 'Uttarakhand', latitude: 29.3803, longitude: 79.4636, timezone: 'Asia/Kolkata' },
    { name: 'Haldwani', state: 'Uttarakhand', latitude: 29.2183, longitude: 79.513, timezone: 'Asia/Kolkata' },
    { name: 'Faridabad', state: 'Haryana', latitude: 28.4089, longitude: 77.3178, timezone: 'Asia/Kolkata' },
    { name: 'Gurugram', state: 'Haryana', latitude: 28.4595, longitude: 77.0266, timezone: 'Asia/Kolkata' },
    { name: 'Karnal', state: 'Haryana', latitude: 29.6857, longitude: 76.9905, timezone: 'Asia/Kolkata' },
    { name: 'Panipat', state: 'Haryana', latitude: 29.3909, longitude: 76.9635, timezone: 'Asia/Kolkata' },
    { name: 'Hisar', state: 'Haryana', latitude: 29.1492, longitude: 75.7217, timezone: 'Asia/Kolkata' },
    { name: 'Rohtak', state: 'Haryana', latitude: 28.8955, longitude: 76.6066, timezone: 'Asia/Kolkata' },
    { name: 'Jalandhar', state: 'Punjab', latitude: 31.326, longitude: 75.5762, timezone: 'Asia/Kolkata' },
    { name: 'Patiala', state: 'Punjab', latitude: 30.3398, longitude: 76.3869, timezone: 'Asia/Kolkata' },
    { name: 'Bathinda', state: 'Punjab', latitude: 30.2109, longitude: 74.9455, timezone: 'Asia/Kolkata' },
    { name: 'Mohali', state: 'Punjab', latitude: 30.7046, longitude: 76.7179, timezone: 'Asia/Kolkata' },
    { name: 'Belgaum', state: 'Karnataka', latitude: 15.8497, longitude: 74.4977, timezone: 'Asia/Kolkata' },
    { name: 'Mangalore', state: 'Karnataka', latitude: 12.9141, longitude: 74.856, timezone: 'Asia/Kolkata' },
    { name: 'Gulbarga', state: 'Karnataka', latitude: 17.3297, longitude: 76.8343, timezone: 'Asia/Kolkata' },
    { name: 'Davangere', state: 'Karnataka', latitude: 14.4644, longitude: 75.9218, timezone: 'Asia/Kolkata' },
    { name: 'Bellary', state: 'Karnataka', latitude: 15.1394, longitude: 76.9214, timezone: 'Asia/Kolkata' },
    { name: 'Shimoga', state: 'Karnataka', latitude: 13.9299, longitude: 75.5681, timezone: 'Asia/Kolkata' },
    { name: 'Salem', state: 'Tamil Nadu', latitude: 11.6643, longitude: 78.146, timezone: 'Asia/Kolkata' },
    { name: 'Tirunelveli', state: 'Tamil Nadu', latitude: 8.7139, longitude: 77.7567, timezone: 'Asia/Kolkata' },
    { name: 'Erode', state: 'Tamil Nadu', latitude: 11.341, longitude: 77.7172, timezone: 'Asia/Kolkata' },
    { name: 'Vellore', state: 'Tamil Nadu', latitude: 12.9165, longitude: 79.1325, timezone: 'Asia/Kolkata' },
    { name: 'Thoothukudi', state: 'Tamil Nadu', latitude: 8.7642, longitude: 78.1348, timezone: 'Asia/Kolkata' },
    { name: 'Warangal', state: 'Telangana', latitude: 17.9784, longitude: 79.5941, timezone: 'Asia/Kolkata' },
    { name: 'Nizamabad', state: 'Telangana', latitude: 18.6725, longitude: 78.0941, timezone: 'Asia/Kolkata' },
    { name: 'Karimnagar', state: 'Telangana', latitude: 18.4386, longitude: 79.1288, timezone: 'Asia/Kolkata' },
    { name: 'Guntur', state: 'Andhra Pradesh', latitude: 16.3067, longitude: 80.4365, timezone: 'Asia/Kolkata' },
    { name: 'Nellore', state: 'Andhra Pradesh', latitude: 14.4426, longitude: 79.9865, timezone: 'Asia/Kolkata' },
    { name: 'Kurnool', state: 'Andhra Pradesh', latitude: 15.8281, longitude: 78.0373, timezone: 'Asia/Kolkata' },
    { name: 'Rajahmundry', state: 'Andhra Pradesh', latitude: 17.0005, longitude: 81.8040, timezone: 'Asia/Kolkata' },
    { name: 'Tirupati', state: 'Andhra Pradesh', latitude: 13.6288, longitude: 79.4192, timezone: 'Asia/Kolkata' },
    { name: 'Kakinada', state: 'Andhra Pradesh', latitude: 16.9891, longitude: 82.2475, timezone: 'Asia/Kolkata' },
    { name: 'Thrissur', state: 'Kerala', latitude: 10.5276, longitude: 76.2144, timezone: 'Asia/Kolkata' },
    { name: 'Kozhikode', state: 'Kerala', latitude: 11.2588, longitude: 75.7804, timezone: 'Asia/Kolkata' },
    { name: 'Kollam', state: 'Kerala', latitude: 8.8932, longitude: 76.6141, timezone: 'Asia/Kolkata' },
    { name: 'Kannur', state: 'Kerala', latitude: 11.8745, longitude: 75.3704, timezone: 'Asia/Kolkata' },
    { name: 'Malappuram', state: 'Kerala', latitude: 11.0733, longitude: 76.0739, timezone: 'Asia/Kolkata' },
    { name: 'Solapur', state: 'Maharashtra', latitude: 17.6599, longitude: 75.9064, timezone: 'Asia/Kolkata' },
    { name: 'Kolhapur', state: 'Maharashtra', latitude: 16.705, longitude: 74.2433, timezone: 'Asia/Kolkata' },
    { name: 'Navi Mumbai', state: 'Maharashtra', latitude: 19.033, longitude: 73.0297, timezone: 'Asia/Kolkata' },
    { name: 'Sangli', state: 'Maharashtra', latitude: 16.8524, longitude: 74.5815, timezone: 'Asia/Kolkata' },
    { name: 'Jalgaon', state: 'Maharashtra', latitude: 21.0077, longitude: 75.5626, timezone: 'Asia/Kolkata' },
    { name: 'Akola', state: 'Maharashtra', latitude: 20.7059, longitude: 77.0049, timezone: 'Asia/Kolkata' },
    { name: 'Amravati', state: 'Maharashtra', latitude: 20.932, longitude: 77.7523, timezone: 'Asia/Kolkata' },
    { name: 'Latur', state: 'Maharashtra', latitude: 18.4088, longitude: 76.5604, timezone: 'Asia/Kolkata' },
    { name: 'Nanded', state: 'Maharashtra', latitude: 19.1383, longitude: 77.321, timezone: 'Asia/Kolkata' },
    { name: 'Ujjain', state: 'Madhya Pradesh', latitude: 23.1793, longitude: 75.7849, timezone: 'Asia/Kolkata' },
    { name: 'Sagar', state: 'Madhya Pradesh', latitude: 23.8388, longitude: 78.7378, timezone: 'Asia/Kolkata' },
    { name: 'Satna', state: 'Madhya Pradesh', latitude: 24.5004, longitude: 80.8322, timezone: 'Asia/Kolkata' },
    { name: 'Rewa', state: 'Madhya Pradesh', latitude: 24.5373, longitude: 81.3042, timezone: 'Asia/Kolkata' },
    { name: 'Dewas', state: 'Madhya Pradesh', latitude: 22.9676, longitude: 76.0534, timezone: 'Asia/Kolkata' },
    { name: 'Bhavnagar', state: 'Gujarat', latitude: 21.7645, longitude: 72.1519, timezone: 'Asia/Kolkata' },
    { name: 'Jamnagar', state: 'Gujarat', latitude: 22.4707, longitude: 70.0577, timezone: 'Asia/Kolkata' },
    { name: 'Junagadh', state: 'Gujarat', latitude: 21.5222, longitude: 70.4579, timezone: 'Asia/Kolkata' },
    { name: 'Gandhinagar', state: 'Gujarat', latitude: 23.2156, longitude: 72.6369, timezone: 'Asia/Kolkata' },
    { name: 'Anand', state: 'Gujarat', latitude: 22.5645, longitude: 72.928, timezone: 'Asia/Kolkata' },
    { name: 'Navsari', state: 'Gujarat', latitude: 20.9467, longitude: 72.952, timezone: 'Asia/Kolkata' },
    { name: 'Morbi', state: 'Gujarat', latitude: 22.8173, longitude: 70.8370, timezone: 'Asia/Kolkata' },
    // International cities
    { name: 'London', state: 'UK', latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London' },
    { name: 'New York', state: 'USA', latitude: 40.7128, longitude: -74.006, timezone: 'America/New_York' },
    { name: 'San Francisco', state: 'USA', latitude: 37.7749, longitude: -122.4194, timezone: 'America/Los_Angeles' },
    { name: 'Dubai', state: 'UAE', latitude: 25.2048, longitude: 55.2708, timezone: 'Asia/Dubai' },
    { name: 'Singapore', state: 'Singapore', latitude: 1.3521, longitude: 103.8198, timezone: 'Asia/Singapore' },
    { name: 'Sydney', state: 'Australia', latitude: -33.8688, longitude: 151.2093, timezone: 'Australia/Sydney' },
    { name: 'Toronto', state: 'Canada', latitude: 43.6532, longitude: -79.3832, timezone: 'America/Toronto' },
    { name: 'Kathmandu', state: 'Nepal', latitude: 27.7172, longitude: 85.324, timezone: 'Asia/Kathmandu' },
    { name: 'Colombo', state: 'Sri Lanka', latitude: 6.9271, longitude: 79.8612, timezone: 'Asia/Colombo' },
    { name: 'Dhaka', state: 'Bangladesh', latitude: 23.8103, longitude: 90.4125, timezone: 'Asia/Dhaka' },
    { name: 'Los Angeles', state: 'USA', latitude: 34.0522, longitude: -118.2437, timezone: 'America/Los_Angeles' },
    { name: 'Chicago', state: 'USA', latitude: 41.8781, longitude: -87.6298, timezone: 'America/Chicago' },
    { name: 'Houston', state: 'USA', latitude: 29.7604, longitude: -95.3698, timezone: 'America/Chicago' },
    { name: 'Melbourne', state: 'Australia', latitude: -37.8136, longitude: 144.9631, timezone: 'Australia/Melbourne' },
    { name: 'Auckland', state: 'New Zealand', latitude: -36.8485, longitude: 174.7633, timezone: 'Pacific/Auckland' },
    { name: 'Muscat', state: 'Oman', latitude: 23.588, longitude: 58.3829, timezone: 'Asia/Muscat' },
    { name: 'Doha', state: 'Qatar', latitude: 25.2854, longitude: 51.531, timezone: 'Asia/Qatar' },
    { name: 'Kuwait City', state: 'Kuwait', latitude: 29.3759, longitude: 47.9774, timezone: 'Asia/Kuwait' },
    { name: 'Riyadh', state: 'Saudi Arabia', latitude: 24.7136, longitude: 46.6753, timezone: 'Asia/Riyadh' },
    { name: 'Jeddah', state: 'Saudi Arabia', latitude: 21.4858, longitude: 39.1925, timezone: 'Asia/Riyadh' },
    { name: 'Bahrain', state: 'Bahrain', latitude: 26.0667, longitude: 50.5577, timezone: 'Asia/Bahrain' },
    { name: 'Kuala Lumpur', state: 'Malaysia', latitude: 3.139, longitude: 101.6869, timezone: 'Asia/Kuala_Lumpur' },
    { name: 'Bangkok', state: 'Thailand', latitude: 13.7563, longitude: 100.5018, timezone: 'Asia/Bangkok' },
    { name: 'Hong Kong', state: 'China', latitude: 22.3193, longitude: 114.1694, timezone: 'Asia/Hong_Kong' },
    { name: 'Tokyo', state: 'Japan', latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo' },
    { name: 'Seoul', state: 'South Korea', latitude: 37.5665, longitude: 126.978, timezone: 'Asia/Seoul' },
    { name: 'Berlin', state: 'Germany', latitude: 52.52, longitude: 13.405, timezone: 'Europe/Berlin' },
    { name: 'Paris', state: 'France', latitude: 48.8566, longitude: 2.3522, timezone: 'Europe/Paris' },
    { name: 'Amsterdam', state: 'Netherlands', latitude: 52.3676, longitude: 4.9041, timezone: 'Europe/Amsterdam' },
    { name: 'Nairobi', state: 'Kenya', latitude: -1.2921, longitude: 36.8219, timezone: 'Africa/Nairobi' },
    { name: 'Johannesburg', state: 'South Africa', latitude: -26.2041, longitude: 28.0473, timezone: 'Africa/Johannesburg' },
    { name: 'Lagos', state: 'Nigeria', latitude: 6.5244, longitude: 3.3792, timezone: 'Africa/Lagos' },
    { name: 'Mauritius', state: 'Mauritius', latitude: -20.1609, longitude: 57.5012, timezone: 'Indian/Mauritius' },
    { name: 'Fiji', state: 'Fiji', latitude: -17.7134, longitude: 178.065, timezone: 'Pacific/Fiji' },
];
// ============================================================
// Credit Packs
// ============================================================
exports.CREDIT_PACKS = [
    { id: 'pack_10', credits: 10, price: 99, label: '10 Credits' },
    { id: 'pack_30', credits: 30, price: 249, label: '30 Credits' },
    { id: 'pack_100', credits: 100, price: 699, label: '100 Credits' },
];
exports.VIDEO_CREDIT_COSTS = {
    quick: 1,
    standard: 2,
    detailed: 3,
};
exports.REPORT_PRICING = [
    { id: 'basic', pages: 15, price: 99, label: 'Basic Report' },
    { id: 'standard', pages: 50, price: 299, label: 'Standard Report' },
    { id: 'premium', pages: 100, price: 499, label: 'Premium Report' },
];
// ============================================================
// Life Decision Categories
// ============================================================
exports.LIFE_DECISION_CATEGORIES = [
    'vehicle', 'property', 'business', 'baby', 'job', 'education', 'travel',
    'investment', 'wedding', 'naming', 'phone', 'diet', 'daily', 'surgery',
    'legal', 'government', 'event', 'wardrobe', 'jewelry', 'food', 'fitness',
    'meditation', 'health_alert', 'mobile_number', 'wallpaper',
];
//# sourceMappingURL=astrology.js.map