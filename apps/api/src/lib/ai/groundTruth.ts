// =============================================================================
// Ground Truth Builder — 100% deterministic, NO AI
// Produces a comprehensive structured object from chart data for the Kundli PDF.
// =============================================================================

// ---------------------------------------------------------------------------
// Input type (matches what the process route has available)
// ---------------------------------------------------------------------------

export interface GroundTruthInput {
  name: string;
  dob: string;
  tob: string;
  pob: string;
  gender: string;
  chartData: {
    planets: Array<{
      name: string;
      sign: string;
      degree: number;
      nakshatra: string;
      pada: number;
      house: number;
      isRetrograde: boolean;
    }>;
    houses: Array<{ house: number; sign: string; lord: string }>;
    ascendant: { sign: string; degree: number; lord: string };
  };
  dashaData: Record<string, unknown>;
  yogaData: Array<Record<string, unknown>>;
  doshaData: Record<string, unknown>;
  shadbala: Record<string, unknown>;
  ashtakavarga: Record<string, unknown>;
  panchangAtBirth?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface QuickAnalysis {
  lagnaLord: {
    planet: string;
    house: number;
    sign: string;
    degree: string;
    nakshatra: string;
    isRetrograde: boolean;
    dignity: string;
    summary: string;
  };
  moonInfluence: {
    sign: string;
    house: number;
    nakshatra: string;
    pada: number;
    paksha: string;
    isWaxing: boolean;
    nakshatraLord: string;
    summary: string;
  };
}

export interface GroundTruthData {
  planetDignities: Record<string, { status: string; description: string }>;
  houseAnalysis: Record<number, { sign: string; lord: string; lordHouse: number; planets: string[]; significance: string }>;
  detectedYogas: Array<{ name: string; type: string; planets: string; meaning: string; strength: string }>;
  detectedDoshas: Array<{ name: string; present: boolean; severity: string; description: string; remedies: string[]; timeline?: string }>;
  careerIndicators: { professions: string[]; businessVsService: string; peakPeriods: string };
  healthIndicators: { constitution: string; vulnerableSystems: string[]; dietaryElement: string };
  marriageIndicators: { partnerSign: string; timing: string; sevenThLord: string };
  luckyFactors: { numbers: number[]; colors: string[]; days: string[]; directions: string[]; gemstone: string; metal: string };
  remedies: {
    mantras: Array<{ planet: string; mantra: string; deity: string; count: string; day: string }>;
    gemstones: Array<{ stone: string; planet: string; finger: string; metal: string; day: string }>;
    fasting: Array<{ day: string; planet: string }>;
    charity: Array<{ item: string; day: string; toWhom: string; planet: string }>;
  };
  personalityKeywords: string[];
  ascendantTraits: { appearance: string[]; nature: string[]; element: string; quality: string; qualityMeaning: string; rulingPlanet: string };
  planetSignifications: Record<string, string[]>;
  planetAspects: Record<string, string[]>;
  planetRemediesNeeded: string[]; // planets that are weak/afflicted
  ashtakavargaStrengths: Record<string, string>; // sign -> 'Strong'|'Average'|'Weak'
  shadbalaRanking: string[]; // strongest to weakest
  shadbalaDetails: Array<{ planet: string; total: number; required: number; ratio: number; isStrong: boolean }>;
  currentDasha: { mahadasha: string; antardasha: string; pratyantardasha: string; mahaStart: string; mahaEnd: string; antarStart: string; antarEnd: string };
  planetFullData: Record<string, { color: string; number: number; day: string; direction: string; metal: string; grain: string; bodyPart: string; element: string; favorableTime: string; season: string }>;
  dashaTimeline: Array<{ planet: string; start: string; end: string; isCurrent: boolean }>;
  quickAnalysis: QuickAnalysis;
}

// ---------------------------------------------------------------------------
// Lookup Tables
// ---------------------------------------------------------------------------

const PLANET_DIGNITY: Record<string, { exalted: string; debilitated: string; own: string[]; mooltrikona: string }> = {
  Sun:     { exalted: 'Aries',       debilitated: 'Libra',      own: ['Leo'],                  mooltrikona: 'Leo'         },
  Moon:    { exalted: 'Taurus',      debilitated: 'Scorpio',    own: ['Cancer'],               mooltrikona: 'Taurus'      },
  Mars:    { exalted: 'Capricorn',   debilitated: 'Cancer',     own: ['Aries', 'Scorpio'],     mooltrikona: 'Aries'       },
  Mercury: { exalted: 'Virgo',       debilitated: 'Pisces',     own: ['Gemini', 'Virgo'],      mooltrikona: 'Virgo'       },
  Jupiter: { exalted: 'Cancer',      debilitated: 'Capricorn',  own: ['Sagittarius', 'Pisces'],mooltrikona: 'Sagittarius' },
  Venus:   { exalted: 'Pisces',      debilitated: 'Virgo',      own: ['Taurus', 'Libra'],      mooltrikona: 'Libra'       },
  Saturn:  { exalted: 'Libra',       debilitated: 'Aries',      own: ['Capricorn', 'Aquarius'],mooltrikona: 'Aquarius'    },
  Rahu:    { exalted: 'Taurus',      debilitated: 'Scorpio',    own: ['Aquarius'],             mooltrikona: 'Aquarius'    },
  Ketu:    { exalted: 'Scorpio',     debilitated: 'Taurus',     own: ['Scorpio'],              mooltrikona: 'Scorpio'     },
};

const PLANET_FRIENDS: Record<string, string[]> = {
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

const PLANET_ENEMIES: Record<string, string[]> = {
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

const SIGN_LORDS: Record<string, string> = {
  Aries: 'Mars', Taurus: 'Venus', Gemini: 'Mercury', Cancer: 'Moon',
  Leo: 'Sun', Virgo: 'Mercury', Libra: 'Venus', Scorpio: 'Mars',
  Sagittarius: 'Jupiter', Capricorn: 'Saturn', Aquarius: 'Saturn', Pisces: 'Jupiter',
};

const SIGN_ELEMENT: Record<string, string> = {
  Aries: 'Fire', Taurus: 'Earth', Gemini: 'Air', Cancer: 'Water',
  Leo: 'Fire', Virgo: 'Earth', Libra: 'Air', Scorpio: 'Water',
  Sagittarius: 'Fire', Capricorn: 'Earth', Aquarius: 'Air', Pisces: 'Water',
};

const SIGN_QUALITY: Record<string, string> = {
  Aries: 'Cardinal', Taurus: 'Fixed', Gemini: 'Mutable', Cancer: 'Cardinal',
  Leo: 'Fixed', Virgo: 'Mutable', Libra: 'Cardinal', Scorpio: 'Fixed',
  Sagittarius: 'Mutable', Capricorn: 'Cardinal', Aquarius: 'Fixed', Pisces: 'Mutable',
};

const QUALITY_MEANING: Record<string, string> = {
  Cardinal: 'Initiator — takes charge, starts things',
  Fixed:    'Determined — persistent, steady, reliable',
  Mutable:  'Adaptable — flexible, open to change',
};

const SIGN_CAREERS: Record<string, string[]> = {
  Aries:       ['Military', 'Sports', 'Surgery', 'Engineering', 'Entrepreneurship'],
  Taurus:      ['Banking', 'Agriculture', 'Music', 'Fashion', 'Real Estate'],
  Gemini:      ['Writing', 'Journalism', 'Trading', 'Marketing', 'IT'],
  Cancer:      ['Nursing', 'Hotel Management', 'Childcare', 'Food Industry', 'Interior Design'],
  Leo:         ['Government', 'Politics', 'Acting', 'Management', 'Gold Business'],
  Virgo:       ['Accounting', 'Medicine', 'Research', 'Data Analysis', 'Quality Control'],
  Libra:       ['Law', 'Diplomacy', 'Fashion Design', 'Art Curation', 'Public Relations'],
  Scorpio:     ['Investigation', 'Psychology', 'Occult Sciences', 'Insurance', 'Mining'],
  Sagittarius: ['Teaching', 'Philosophy', 'Travel Industry', 'Publishing', 'Religion'],
  Capricorn:   ['Administration', 'Construction', 'Mining', 'Agriculture', 'Corporate Leadership'],
  Aquarius:    ['Technology', 'Social Work', 'Aviation', 'Electronics', 'Innovation'],
  Pisces:      ['Spirituality', 'Film Making', 'Fishing', 'Pharmaceuticals', 'Charity Work'],
};

const SIGN_PERSONALITY: Record<string, string[]> = {
  Aries:       ['Bold', 'Courageous', 'Pioneering', 'Impulsive', 'Competitive', 'Dynamic'],
  Taurus:      ['Patient', 'Reliable', 'Sensual', 'Stubborn', 'Materialistic', 'Artistic'],
  Gemini:      ['Versatile', 'Communicative', 'Curious', 'Restless', 'Witty', 'Adaptable'],
  Cancer:      ['Nurturing', 'Emotional', 'Protective', 'Intuitive', 'Domestic', 'Sensitive'],
  Leo:         ['Confident', 'Generous', 'Royal', 'Proud', 'Creative', 'Charismatic'],
  Virgo:       ['Analytical', 'Practical', 'Perfectionist', 'Modest', 'Methodical', 'Health-conscious'],
  Libra:       ['Diplomatic', 'Charming', 'Balanced', 'Indecisive', 'Artistic', 'Social'],
  Scorpio:     ['Intense', 'Mysterious', 'Passionate', 'Determined', 'Secretive', 'Transformative'],
  Sagittarius: ['Philosophical', 'Adventurous', 'Optimistic', 'Freedom-loving', 'Honest', 'Expansive'],
  Capricorn:   ['Disciplined', 'Ambitious', 'Practical', 'Cautious', 'Hardworking', 'Traditional'],
  Aquarius:    ['Innovative', 'Humanitarian', 'Eccentric', 'Detached', 'Progressive', 'Independent'],
  Pisces:      ['Compassionate', 'Imaginative', 'Spiritual', 'Dreamy', 'Empathic', 'Selfless'],
};

// Only permanent physical traits that do not change with environment/age/lifestyle
// Excluded: hair, nails, eyesight, skin tone, weight, complexion
const SIGN_APPEARANCE: Record<string, string[]> = {
  Aries:       ['Athletic bone structure', 'Sharp facial features', 'Prominent forehead', 'Medium to tall height', 'Broad shoulders relative to hips'],
  Taurus:      ['Sturdy skeletal frame', 'Wide neck', 'Square jaw', 'Short to medium height', 'Large hands and feet'],
  Gemini:      ['Tall and lean frame', 'Long arms and fingers', 'Narrow shoulders', 'Above-average height', 'Small bone structure'],
  Cancer:      ['Round face shape', 'Prominent chest cavity', 'Medium height', 'Wide hips', 'Short limbs relative to torso'],
  Leo:         ['Broad shoulders', 'Large head', 'Wide chest', 'Above-average height', 'Strong bone density'],
  Virgo:       ['Slim skeletal frame', 'Oval face shape', 'Medium height', 'Long fingers', 'Narrow waist'],
  Libra:       ['Symmetrical facial bone structure', 'Medium build', 'Proportionate limbs', 'Average to tall height', 'Oval face'],
  Scorpio:     ['Strong jawline', 'Deep-set eye sockets', 'Muscular bone frame', 'Medium height', 'Broad forehead'],
  Sagittarius: ['Tall stature', 'Long face and forehead', 'Large feet', 'Long thighs', 'Wide pelvis'],
  Capricorn:   ['Lean bone structure', 'Prominent cheekbones', 'Narrow frame', 'Bony knees and joints', 'Medium to short height in youth'],
  Aquarius:    ['Tall frame', 'Broad forehead', 'Strong calves and ankles', 'Long torso', 'Square shoulders'],
  Pisces:      ['Soft rounded face shape', 'Medium height', 'Wide feet', 'Short neck', 'Rounded shoulders'],
};

const HOUSE_SIGNIFICANCE: Record<number, string> = {
  1: 'This is the house of YOU — your physical body, how you come across to people on first meeting, and your overall health and vitality. It sets the tone for everything else in the chart.',
  2: 'This house governs your financial life, the family you were born into, your voice and communication style, and the material resources you accumulate early in life.',
  3: 'This is the house of effort and initiative — your relationship with siblings, your courage to act, how you communicate day-to-day, and short trips or tasks that require hands-on work.',
  4: 'This house is about your inner world: your home, your emotional roots, your mother, the sense of security and happiness you carry inside, and the property or vehicles you own.',
  5: 'This house covers creative self-expression, children, romance, past-life merit (luck that seems unearned), intelligence, and any pursuit done purely for joy — arts, performance, speculation.',
  6: 'This house is where you meet obstacles: health challenges, debts, enemies, competition, and the daily grind of service or routine work. How you handle difficulty and keep your body fit lives here.',
  7: 'This is the house of significant others — your life partner, business partners, and how you show up in one-on-one relationships. It also governs public dealing, contracts, and your visible persona in partnerships.',
  8: 'This house covers deep transformation — how you handle crisis, sudden change, inherited wealth, hidden knowledge, the occult, and the big transitions of life including regeneration and rebirth of identity.',
  9: 'This is the house of luck, wisdom, and higher purpose. It governs your father figure, long journeys, higher education, philosophical and spiritual beliefs, and the fortune that comes through righteous living.',
  10: 'Your career, public reputation, social status, and relationship with authority figures all live here. This is the most visible house — what you are known for and remembered by.',
  11: 'This house governs what you gain: income, desires fulfilled, elder siblings, friends and your social network, and the collective outcomes of your efforts. It shows where gains naturally flow.',
  12: 'This house is about release and dissolution — foreign lands, spiritual retreat, sleep and dreams, hidden expenses, and letting go. It can indicate isolation or transcendence depending on how it is used.',
};

// Categorized significations — each entry is "Category: Item" so the UI can group/color them
// Categories: Life (people/relationships), Career (work), Body (health), Trait (personality), Remedy (gem/metal)
const PLANET_SIGNIFICATIONS: Record<string, string[]> = {
  Sun:     ['Life: Father figure', 'Career: Government & authority roles', 'Body: Heart & spine', 'Body: Right eye', 'Trait: Leadership & confidence', 'Trait: Self-respect & ego', 'Remedy: Wear Ruby in Gold'],
  Moon:    ['Life: Mother figure', 'Life: Public & social connections', 'Body: Mind & mental health', 'Body: Blood & fluids', 'Trait: Emotional sensitivity', 'Trait: Imagination & intuition', 'Remedy: Wear Pearl in Silver'],
  Mars:    ['Life: Siblings & brothers', 'Career: Land & property dealings', 'Career: Surgery & military', 'Body: Muscles & bone marrow', 'Body: Blood & immune system', 'Trait: Courage & physical energy', 'Trait: Aggression & competitiveness', 'Remedy: Wear Red Coral in Copper'],
  Mercury: ['Life: Maternal uncle', 'Career: Trade & business', 'Career: Writing & communication', 'Body: Nervous system & skin', 'Body: Lungs & speech organs', 'Trait: Intellect & analytical mind', 'Trait: Humor & adaptability', 'Remedy: Wear Emerald in Gold'],
  Jupiter: ['Life: Children & teachers', 'Career: Education & law', 'Career: Finance & banking', 'Body: Liver & fat tissue', 'Body: Thighs & hips', 'Trait: Wisdom & optimism', 'Trait: Generosity & dharma', 'Remedy: Wear Yellow Sapphire in Gold'],
  Venus:   ['Life: Spouse & romantic partner', 'Career: Arts & entertainment', 'Career: Luxury brands & hospitality', 'Body: Reproductive system', 'Body: Face & kidneys', 'Trait: Love & beauty', 'Trait: Comfort & refinement', 'Remedy: Wear Diamond in Platinum'],
  Saturn:  ['Life: Servants & elderly people', 'Career: Labour & manual work', 'Career: Mining & oil industry', 'Body: Bones & joints', 'Body: Teeth & knees', 'Trait: Discipline & patience', 'Trait: Karma & life lessons', 'Remedy: Wear Blue Sapphire in Iron/Silver'],
  Rahu:    ['Life: Paternal grandparents', 'Career: Technology & foreign affairs', 'Career: Aviation & research', 'Body: Skin diseases & breathing', 'Trait: Obsession & ambition', 'Trait: Unconventional & rebellious', 'Remedy: Wear Hessonite (Gomed) in Silver'],
  Ketu:    ['Life: Maternal grandparents', 'Career: Occult & spiritual healing', 'Career: Research & investigation', 'Body: Nervous disorders & spine', 'Trait: Detachment & liberation (Moksha)', 'Trait: Psychic ability & past-life wisdom', "Remedy: Wear Cat's Eye in Silver"],
};

const PLANET_ASPECTS: Record<string, number[]> = {
  Sun: [7], Moon: [7], Mercury: [7], Venus: [7],
  Mars: [4, 7, 8],
  Jupiter: [5, 7, 9],
  Saturn: [3, 7, 10],
  Rahu: [5, 7, 9],
  Ketu: [5, 7, 9],
};

const PLANET_HEALTH: Record<string, string[]> = {
  Sun:     ['Heart', 'Eyes', 'Bones (spine)', 'Head', 'Vitality'],
  Moon:    ['Mind', 'Lungs', 'Blood', 'Left Eye', 'Sleep Disorders', 'Fluid Balance'],
  Mars:    ['Blood Pressure', 'Accidents', 'Burns', 'Inflammation', 'Surgery', 'Muscles'],
  Mercury: ['Nervous System', 'Skin Disorders', 'Speech Issues', 'Respiratory', 'Intestines'],
  Jupiter: ['Liver', 'Diabetes', 'Obesity', 'Ear Problems', 'Tumors'],
  Venus:   ['Kidneys', 'Reproductive Organs', 'Throat', 'Diabetes', 'Urinary Tract'],
  Saturn:  ['Bones', 'Joints', 'Teeth', 'Chronic Disease', 'Depression', 'Arthritis'],
  Rahu:    ['Mysterious Diseases', 'Phobias', 'Poisoning', 'Hallucinations', 'Skin Allergies'],
  Ketu:    ['Neurological Issues', 'Immunity', 'Wounds', 'Epidemics', 'Stomach Worms'],
};

const ELEMENT_DIET: Record<string, string> = {
  Fire: 'Cooling foods, moderate spices, hydrating fruits and vegetables. Avoid excessive heat-producing foods.',
  Earth: 'Light and warm foods, less heavy/oily items. Include ginger, pepper, and digestive spices.',
  Air: 'Grounding and nourishing foods, warm soups, root vegetables. Avoid raw and cold foods.',
  Water: 'Warm, dry, and spiced foods. Reduce dairy, sugar, and cold beverages.',
};

// Complete planet attributes — used across reports, remedies, lucky factors
const PLANET_DATA: Record<string, {
  color: string; number: number; day: string; direction: string;
  metal: string; grain: string; bodyPart: string; element: string;
  favorableTime: string; season: string;
}> = {
  Sun:     { color: 'Copper Red / Dark Orange', number: 1, day: 'Sunday',    direction: 'East',       metal: 'Gold',     grain: 'Wheat',       bodyPart: 'Heart, Spine, Right Eye',    element: 'Fire',  favorableTime: 'Morning (Sunrise)', season: 'Summer' },
  Moon:    { color: 'White / Silver / Cream',   number: 2, day: 'Monday',    direction: 'North-West', metal: 'Silver',   grain: 'Rice',        bodyPart: 'Mind, Blood, Left Eye',      element: 'Water', favorableTime: 'Evening',           season: 'Monsoon' },
  Mars:    { color: 'Red / Scarlet / Crimson',  number: 9, day: 'Tuesday',   direction: 'South',      metal: 'Copper',   grain: 'Red Lentil (Masoor)', bodyPart: 'Muscles, Bone Marrow, Head', element: 'Fire',  favorableTime: 'Morning',           season: 'Summer' },
  Mercury: { color: 'Green / Emerald Green',    number: 5, day: 'Wednesday', direction: 'North',      metal: 'Bronze',   grain: 'Moong Dal',   bodyPart: 'Nervous System, Skin, Lungs', element: 'Earth', favorableTime: 'Midday',            season: 'Autumn' },
  Jupiter: { color: 'Yellow / Golden / Saffron',number: 3, day: 'Thursday',  direction: 'North-East', metal: 'Gold',     grain: 'Chana Dal',   bodyPart: 'Liver, Fat, Thighs',         element: 'Ether', favorableTime: 'Morning',           season: 'Winter' },
  Venus:   { color: 'White / Bright White / Pastel Pink', number: 6, day: 'Friday', direction: 'South-East', metal: 'Platinum / Silver', grain: 'Basmati Rice', bodyPart: 'Reproductive System, Face, Kidneys', element: 'Water', favorableTime: 'Afternoon', season: 'Spring' },
  Saturn:  { color: 'Black / Dark Blue / Navy', number: 8, day: 'Saturday',  direction: 'West',       metal: 'Iron',     grain: 'Sesame (Til)',bodyPart: 'Bones, Teeth, Knees, Joints', element: 'Air',   favorableTime: 'Evening',           season: 'Winter' },
  Rahu:    { color: 'Smoky Grey / Lead Blue',   number: 4, day: 'Saturday',  direction: 'South-West', metal: 'Lead',     grain: 'Urad Dal',    bodyPart: 'Feet, Breathing, Skin Diseases', element: 'Air', favorableTime: 'Night',             season: 'Monsoon' },
  Ketu:    { color: 'Grey / Earthy Brown / Ash',number: 7, day: 'Tuesday',   direction: 'North-West', metal: 'Iron',     grain: 'Horse Gram (Kulthi)', bodyPart: 'Spine, Nervous System, Claws', element: 'Fire', favorableTime: 'Night',           season: 'Monsoon' },
};

const PLANET_MANTRAS: Record<string, { mantra: string; deity: string; count: string; day: string }> = {
  Sun:     { mantra: 'Om Hraam Hreem Hraum Sah Suryaya Namah',       deity: 'Lord Surya',     count: '108 times daily (or 7 malas of 108 on Sunday)', day: 'Sunday' },
  Moon:    { mantra: 'Om Shraam Shreem Shraum Sah Chandramase Namah', deity: 'Lord Shiva',     count: '108 times daily (or 11 malas on Monday)',      day: 'Monday' },
  Mars:    { mantra: 'Om Kraam Kreem Kraum Sah Bhaumaya Namah',       deity: 'Lord Hanuman',   count: '108 times daily (or 7 malas on Tuesday)',      day: 'Tuesday' },
  Mercury: { mantra: 'Om Braam Breem Braum Sah Budhaya Namah',        deity: 'Lord Vishnu',    count: '108 times daily (or 9 malas on Wednesday)',    day: 'Wednesday' },
  Jupiter: { mantra: 'Om Graam Greem Graum Sah Gurave Namah',         deity: 'Lord Brihaspati',count: '108 times daily (or 16 malas on Thursday)',    day: 'Thursday' },
  Venus:   { mantra: 'Om Draam Dreem Draum Sah Shukraya Namah',       deity: 'Goddess Lakshmi',count: '108 times daily (or 16 malas on Friday)',     day: 'Friday' },
  Saturn:  { mantra: 'Om Praam Preem Praum Sah Shanaischaraya Namah', deity: 'Lord Shani',     count: '108 times daily (or 23 malas on Saturday)',    day: 'Saturday' },
  Rahu:    { mantra: 'Om Bhram Bhreem Bhraum Sah Rahave Namah',       deity: 'Goddess Durga',  count: '108 times daily (or 18 malas on Saturday)',    day: 'Saturday' },
  Ketu:    { mantra: 'Om Sraam Sreem Sraum Sah Ketave Namah',         deity: 'Lord Ganesha',   count: '108 times daily (or 7 malas on Tuesday)',      day: 'Tuesday' },
};

const PLANET_GEMSTONES: Record<string, { stone: string; finger: string; metal: string; day: string }> = {
  Sun:     { stone: 'Ruby (Manik)',              finger: 'Ring Finger',   metal: 'Gold',   day: 'Sunday' },
  Moon:    { stone: 'Pearl (Moti)',              finger: 'Little Finger', metal: 'Silver', day: 'Monday' },
  Mars:    { stone: 'Red Coral (Moonga)',        finger: 'Ring Finger',   metal: 'Gold',   day: 'Tuesday' },
  Mercury: { stone: 'Emerald (Panna)',           finger: 'Little Finger', metal: 'Gold',   day: 'Wednesday' },
  Jupiter: { stone: 'Yellow Sapphire (Pukhraj)', finger: 'Index Finger',  metal: 'Gold',   day: 'Thursday' },
  Venus:   { stone: 'Diamond (Heera)',           finger: 'Middle Finger', metal: 'Platinum', day: 'Friday' },
  Saturn:  { stone: 'Blue Sapphire (Neelam)',    finger: 'Middle Finger', metal: 'Silver', day: 'Saturday' },
  Rahu:    { stone: 'Hessonite (Gomed)',         finger: 'Middle Finger', metal: 'Silver', day: 'Saturday' },
  Ketu:    { stone: "Cat's Eye (Lahsuniya)",     finger: 'Little Finger', metal: 'Silver', day: 'Tuesday' },
};

const PLANET_FASTING: Record<string, string> = {
  Sun: 'Sunday', Moon: 'Monday', Mars: 'Tuesday', Mercury: 'Wednesday',
  Jupiter: 'Thursday', Venus: 'Friday', Saturn: 'Saturday', Rahu: 'Saturday', Ketu: 'Tuesday',
};

const PLANET_CHARITY: Record<string, { item: string; toWhom: string }> = {
  Sun:     { item: 'Wheat, Jaggery, Copper',             toWhom: 'Father figure, Temple priest' },
  Moon:    { item: 'Rice, Milk, White cloth, Silver',     toWhom: 'Mother figure, Elderly woman' },
  Mars:    { item: 'Red lentils, Jaggery, Copper',       toWhom: 'Younger brother, Soldiers' },
  Mercury: { item: 'Green moong, Green cloth, Emerald',   toWhom: 'Young students, Orphans' },
  Jupiter: { item: 'Yellow cloth, Turmeric, Chana dal',   toWhom: 'Brahmins, Teachers, Priests' },
  Venus:   { item: 'White rice, White cloth, Camphor',    toWhom: 'Young women, Artists' },
  Saturn:  { item: 'Black sesame, Mustard oil, Iron',     toWhom: 'Servants, Disabled persons, Elderly' },
  Rahu:    { item: 'Black blanket, Coconut, Blue cloth',  toWhom: 'Outcasts, Sweepers, Leprosy patients' },
  Ketu:    { item: 'Multi-colored blanket, Dog food, Sesame', toWhom: 'Spiritual persons, Dogs' },
};

const SIGN_LUCKY_NUMBERS: Record<string, number[]> = {
  Aries: [1, 9], Taurus: [2, 6], Gemini: [3, 5], Cancer: [2, 7],
  Leo: [1, 4], Virgo: [3, 5], Libra: [2, 6], Scorpio: [9, 8],
  Sagittarius: [3, 7], Capricorn: [8, 6], Aquarius: [4, 8], Pisces: [3, 7],
};

const SIGN_LUCKY_COLORS: Record<string, string[]> = {
  Aries: ['Red', 'Scarlet', 'Saffron'], Taurus: ['White', 'Green', 'Pink'],
  Gemini: ['Green', 'Yellow', 'Light Blue'], Cancer: ['White', 'Silver', 'Cream'],
  Leo: ['Gold', 'Orange', 'Royal Blue'], Virgo: ['Green', 'Brown', 'Earthy tones'],
  Libra: ['White', 'Light Blue', 'Pastel'], Scorpio: ['Red', 'Maroon', 'Black'],
  Sagittarius: ['Yellow', 'Orange', 'Golden'], Capricorn: ['Black', 'Dark Blue', 'Brown'],
  Aquarius: ['Blue', 'Electric Blue', 'Violet'], Pisces: ['Yellow', 'Sea Green', 'Lavender'],
};

const SIGN_LUCKY_DAYS: Record<string, string[]> = {
  Aries: ['Tuesday', 'Thursday'], Taurus: ['Friday', 'Monday'], Gemini: ['Wednesday', 'Friday'],
  Cancer: ['Monday', 'Thursday'], Leo: ['Sunday', 'Tuesday'], Virgo: ['Wednesday', 'Friday'],
  Libra: ['Friday', 'Wednesday'], Scorpio: ['Tuesday', 'Thursday'], Sagittarius: ['Thursday', 'Tuesday'],
  Capricorn: ['Saturday', 'Wednesday'], Aquarius: ['Saturday', 'Friday'], Pisces: ['Thursday', 'Monday'],
};

const SIGN_DIRECTIONS: Record<string, string[]> = {
  Aries: ['East'], Taurus: ['South'], Gemini: ['West'], Cancer: ['North'],
  Leo: ['East'], Virgo: ['South'], Libra: ['West'], Scorpio: ['North'],
  Sagittarius: ['East'], Capricorn: ['South'], Aquarius: ['West'], Pisces: ['North'],
};

const SIGN_METAL: Record<string, string> = {
  Aries: 'Copper', Taurus: 'Silver', Gemini: 'Gold', Cancer: 'Silver',
  Leo: 'Gold', Virgo: 'Bronze', Libra: 'Platinum', Scorpio: 'Iron',
  Sagittarius: 'Gold', Capricorn: 'Iron', Aquarius: 'Lead', Pisces: 'Gold',
};

const PLANET_PRIMARY_METAL: Record<string, string> = {
  Sun: 'Gold', Moon: 'Silver', Mars: 'Copper', Mercury: 'Bronze',
  Jupiter: 'Yellow Gold', Venus: 'Platinum', Saturn: 'Iron',
  Rahu: 'Lead', Ketu: 'Panchdhatu',
};

const SIGN_DEITY: Record<string, string> = {
  Aries: 'Lord Hanuman', Taurus: 'Goddess Lakshmi', Gemini: 'Lord Vishnu', Cancer: 'Goddess Parvati',
  Leo: 'Lord Surya', Virgo: 'Lord Vishnu', Libra: 'Goddess Lakshmi', Scorpio: 'Lord Shiva',
  Sagittarius: 'Lord Brihaspati', Capricorn: 'Lord Shani', Aquarius: 'Lord Shani', Pisces: 'Lord Vishnu',
};

const YOGA_MEANINGS: Record<string, string> = {
  'Gaja Kesari': 'Your mind and emotions reinforce each other — you think clearly under stress and your reputation grows steadily over time. People come to see you as wise rather than merely clever.',
  'Budhaditya': 'You pick up ideas fast and communicate them even faster — writing, speaking, or teaching comes to you more naturally than most. Great for any work that runs on sharp thinking and persuasion.',
  'Dhana': 'Financial prosperity is written into your chart through well-placed wealth indicators. Gains tend to accumulate steadily, especially when you back your instincts with discipline.',
  'Raja': 'You are built for leadership and authority — people naturally defer to you when decisions matter. Positions of real influence are within reach; the question is which path you choose to get there.',
  'Pancha Mahapurusha': 'One of five rare personality-defining patterns that mark you out from the crowd in a specific way — courage, intellect, wisdom, charm, or discipline — depending on which planet forms it.',
  'Hamsa': 'You earn respect through wisdom and integrity, not force or ambition. People come to you for sound judgment, and teaching or guiding others feels like second nature.',
  'Malavya': 'You carry an aesthetic ease — beauty, comfort, and harmony come naturally to you, and others feel it. Relationships and creative pursuits are among your strongest areas.',
  'Ruchaka': 'You bring rare physical courage and decisive command — the kind people follow into hard tasks. Strongest in fields demanding bold action under pressure.',
  'Bhadra': 'Sharp intellect and clear expression give you an edge in any work that involves thinking, writing, or negotiating. Business and communication are natural territory for you.',
  'Sasa': 'Your power is built through persistence, not shortcuts — and that makes it lasting. Over time you become the person others turn to for structure, discipline, and long-view thinking.',
  'Viparita Raja': 'Where others see obstacles, you find unexpected openings. Setbacks tend to reverse into opportunities — your resilience is one of your most underrated strengths.',
  'Neecha Bhanga Raja': 'A weakness in your chart gets cancelled and flips into a strength. You are likely to rise from a difficult starting point and outperform expectations significantly over your lifetime.',
  'Chandra-Mangal': 'Emotional drive and bold instinct combine in you to create strong financial acumen. When you act on gut feeling backed by effort, results follow.',
  'Saraswati': 'Mastery in learning, arts, or knowledge fields is a natural outcome for you — this combination gives exceptional ability in any field demanding deep expertise or creative expression.',
  'Lakshmi': 'Fortune and prosperity flow toward you through righteous effort — the more you act with integrity, the more life seems to align in your favor.',
  'Amala': 'Your reputation stays clean even in messy environments. You build career and social standing through ethical means, and that trust becomes one of your most durable assets.',
  'Sunapha': 'Wealth you earn by your own effort has special significance in your chart — self-reliance and financial independence are central themes in your story.',
  'Anapha': 'A spiritual undercurrent runs through your life — you are drawn toward meaning over material accumulation, and this brings a quiet inner stability most people spend a lifetime chasing.',
  'Durudhara': 'Emotional stability and financial balance reinforce each other in you. You rarely swing to extremes — a consistent, grounded presence that others find reassuring.',
  'Kemadruma': 'The chart shows a pattern where emotional or material support may feel thin at times. The good news: many of its effects are softened when other planets cancel it out — check for those.',
  'Adhi': 'A strong protective pattern sits around your emotional world — challenges that would break others tend to become fuel for you. Inner resilience and vitality are marked.',
  'Shakata': 'Fortune in your chart moves in waves rather than a straight line — periods of abundance follow periods of struggle. Patience through the dips is the key that unlocks the upswings.',
  'Veshi': 'Drive and determination fill the space between desire and action for you — when you want something, you pursue it with unusual focus and tend to build status in the process.',
  'Voshi': 'A generous, giving quality shows up naturally in you — charity and spiritual inclinations come without effort, and what you give tends to come back in unexpected ways.',
  'Ubhayachari': 'Planets on both sides of the Sun give you a charismatic, well-rounded presence — you project confidence and attract people who want to orbit your energy.',
};

const JARGON_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bkendra(?:\s+houses?)?\b/gi, 'key life-foundation areas (career, home, relationships, public role)'],
  [/\btrikona(?:\s+houses?)?\b/gi, 'fortune areas (self, wealth, dharma)'],
  [/\bdusthana(?:s)?\b/gi, 'challenging life areas'],
  [/\bnative\b/gi, 'you'],
  [/\bbestows\b/gi, 'gives you'],
  [/\bdebilitated\b/gi, 'weakened by placement'],
  [/\bexalted\b/gi, 'at its strongest'],
  [/\blagna\b/gi, 'your rising sign'],
];

function humanizeYogaMeaning(s: string): string {
  let out = s;
  for (const [re, rep] of JARGON_REPLACEMENTS) out = out.replace(re, rep);
  return out;
}

const DOSHA_DESCRIPTIONS: Record<string, { description: string; remedies: string[] }> = {
  mangal: {
    description: 'Mangal Dosha occurs when Mars is placed in 1st, 2nd, 4th, 7th, 8th, or 12th house from Lagna, Moon, or Venus. It affects marriage prospects and married life, creating conflicts and delays.',
    remedies: ['Recite Mangal Mantra on Tuesdays', 'Wear Red Coral after consultation', 'Offer red flowers to Lord Hanuman', 'Fast on Tuesdays', 'Donate red lentils and jaggery', 'Perform Mangal Shanti Puja'],
  },
  kaalSarp: {
    description: 'Kaal Sarp Dosha forms when all seven planets are hemmed between Rahu and Ketu. It creates obstacles, delays, and sudden reversals in life. The native faces struggles before achieving success.',
    remedies: ['Perform Kaal Sarp Dosha Nivaran Puja at Trimbakeshwar', 'Recite Rahu-Ketu mantras', 'Offer milk to Shivling on Mondays', 'Wear Gomed or Cat\'s Eye after consultation', 'Feed birds daily'],
  },
  sadeSati: {
    description: 'Sade Sati is the 7.5-year transit of Saturn over natal Moon sign and its adjacent signs. It tests patience, brings karmic lessons, and forces transformation. It occurs 2-3 times in a lifetime.',
    remedies: ['Recite Shani Chalisa on Saturdays', 'Donate black sesame and mustard oil', 'Wear Blue Sapphire only after trial', 'Feed crows on Saturdays', 'Light sesame oil lamp under Peepal tree'],
  },
  pitra: {
    description: 'Pitra Dosha indicates unresolved ancestral karma. It is indicated by Sun-Rahu conjunction, afflicted 9th house, or Saturn\'s aspect on Sun. It creates obstacles in progeny and career.',
    remedies: ['Perform Pitra Tarpan on Amavasya', 'Feed Brahmins on father\'s death anniversary', 'Offer water to Sun at sunrise', 'Plant a Peepal tree', 'Donate food to the poor on Amavasya'],
  },
  kemDruma: {
    description: 'Kem Druma Dosha forms when there are no planets in 2nd or 12th from Moon. The native lacks support, faces financial hardship, and emotional loneliness. Cancellation conditions should be checked.',
    remedies: ['Worship Goddess Lakshmi on Fridays', 'Recite Chandra Mantra', 'Wear Pearl on Monday', 'Donate white rice and milk', 'Keep fast on Mondays'],
  },
  grahan: {
    description: 'Grahan Dosha occurs when Sun or Moon conjuncts Rahu or Ketu. It affects health, mental peace, and creates confusion. Solar eclipse dosha affects father/career; Lunar eclipse dosha affects mother/mind.',
    remedies: ['Perform Grahan Dosha Shanti Puja', 'Recite Surya/Chandra mantra', 'Donate to blind or mentally challenged', 'Observe fasts during eclipses', 'Feed cows on Sundays/Mondays'],
  },
  guruChandal: {
    description: 'Guru Chandal Dosha forms when Jupiter conjuncts Rahu. It clouds judgment, reduces the benefic effect of Jupiter, and may lead the native towards unorthodox or immoral paths.',
    remedies: ['Recite Jupiter and Rahu mantras', 'Worship Lord Vishnu on Thursdays', 'Donate yellow items to Brahmins', 'Wear Yellow Sapphire after consultation', 'Plant Banana tree in temple'],
  },
};

const ZODIAC_SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

const NAKSHATRA_LORDS_MAP: Record<string, string> = {
  'Ashwini': 'Ketu',    'Bharani': 'Venus',   'Krittika': 'Sun',
  'Rohini': 'Moon',     'Mrigashira': 'Mars',  'Ardra': 'Rahu',
  'Punarvasu': 'Jupiter','Pushya': 'Saturn',   'Ashlesha': 'Mercury',
  'Magha': 'Ketu',      'Purva Phalguni': 'Venus', 'Uttara Phalguni': 'Sun',
  'Hasta': 'Moon',      'Chitra': 'Mars',      'Swati': 'Rahu',
  'Vishakha': 'Jupiter','Anuradha': 'Saturn',  'Jyeshtha': 'Mercury',
  'Moola': 'Ketu',      'Purva Ashadha': 'Venus', 'Uttara Ashadha': 'Sun',
  'Shravana': 'Moon',   'Dhanishta': 'Mars',   'Shatabhisha': 'Rahu',
  'Purva Bhadrapada': 'Jupiter', 'Uttara Bhadrapada': 'Saturn', 'Revati': 'Mercury',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeObj(val: unknown): Record<string, unknown> {
  return (val && typeof val === 'object' && !Array.isArray(val)) ? val as Record<string, unknown> : {};
}

function safeArr(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [];
}

function safe(val: unknown, fallback = ''): string {
  if (val === null || val === undefined || val === '') return fallback;
  return String(val) || fallback;
}

// ---------------------------------------------------------------------------
// Planet dignity assessment
// ---------------------------------------------------------------------------

// Detailed dignity descriptions per planet — explains real-life impact, not just terminology
const DIGNITY_DETAILS: Record<string, Record<string, string>> = {
  Sun: {
    Exalted: 'Sun exalted in Aries gives powerful self-confidence, natural authority, and success in government or leadership roles. Father figure is likely influential and supportive. Strong vitality and heart health.',
    Debilitated: 'Sun debilitated in Libra weakens self-confidence and authority. You may struggle to assert yourself or find your identity overshadowed by others. Father relationship may be distant or challenging. Watch heart and spine health.',
    Own: 'Sun in Leo is like a king on his throne — natural authority, strong personality, and leadership ability. Excellent for government roles, politics, and executive positions.',
    Friendly: 'Sun in a friendly sign gives moderate confidence and decent recognition. Authority comes through consistent effort rather than natural command.',
    Enemy: 'Sun in an enemy sign creates friction with authority figures, ego conflicts at work, and challenges in gaining recognition. Extra effort needed to establish identity.',
  },
  Moon: {
    Exalted: 'Moon exalted in Taurus gives exceptional emotional stability, a beautiful mind, and strong connection with mother. Excellent memory, love of comfort, and natural wealth attraction.',
    Debilitated: 'Moon debilitated in Scorpio creates emotional turbulence, anxiety, and intense inner struggles. Relationship with mother may be complex. Sleep disturbances and mental health need attention. Practice meditation.',
    Own: 'Moon in Cancer is deeply nurturing, intuitive, and emotionally rich. Strong bond with mother and family. Excellent for careers in hospitality, nursing, and caregiving.',
    Friendly: 'Moon in a friendly sign gives generally positive emotional health and good maternal relationships. Mind is stable with occasional fluctuations.',
    Enemy: 'Moon in an enemy sign brings emotional unease, difficulty trusting others, and strained relationship with mother. Mental peace comes through spiritual practice.',
  },
  Mars: {
    Exalted: 'Mars exalted in Capricorn gives disciplined energy, strategic aggression, and success in military, sports, engineering, or real estate. Excellent physical strength and courage. Brothers may be successful.',
    Debilitated: 'Mars debilitated in Cancer makes your assertive energy indirect and emotionally driven. You may avoid confrontation, struggle with anger management, or channel aggression passively. Property matters face delays. Physical stamina needs conscious building through exercise. Sibling relationships may have emotional complexity.',
    Own: 'Mars in Aries or Scorpio gives raw courage, fearless action, and physical dominance. Natural athlete or warrior energy. Success in competitive fields.',
    Friendly: 'Mars in a friendly sign gives adequate energy and courage. You can assert yourself when needed but prefer diplomatic approaches. Physical health is generally good.',
    Enemy: 'Mars in an enemy sign creates frustration in taking action, property disputes, and conflicts with siblings. Channel anger into sports or physical activity.',
  },
  Mercury: {
    Exalted: 'Mercury exalted in Virgo gives exceptional analytical ability, business acumen, and communication skills. Success in IT, accounting, writing, or trading. Sharp intellect with attention to detail.',
    Debilitated: 'Mercury debilitated in Pisces makes logical thinking dreamy and unfocused. Business decisions may lack clarity. Communication can be misunderstood. Focus on creative fields rather than pure analytics. Skin and nervous system need care.',
    Own: 'Mercury in Gemini or Virgo gives strong intellect, quick learning, and versatile communication. Natural success in trade, media, and education.',
    Friendly: 'Mercury in a friendly sign gives good communication skills and reasonable intellect. Learning ability is solid with proper effort.',
    Enemy: 'Mercury in an enemy sign creates misunderstandings in communication, poor financial decisions, and difficulty in studies. Practice mindful speech.',
  },
  Jupiter: {
    Exalted: 'Jupiter exalted in Cancer gives tremendous wisdom, wealth, and spiritual grace. Children bring great joy. Excellent for teaching, law, finance, and advisory roles. Natural abundance and generosity.',
    Debilitated: 'Jupiter debilitated in Capricorn restricts wisdom and optimism. Financial growth is slow and methodical rather than expansive. Children may come late. Traditional knowledge may feel constraining. Build faith through service.',
    Own: 'Jupiter in Sagittarius or Pisces gives natural wisdom, philosophical depth, and spiritual inclination. Wealth comes through knowledge and dharmic action.',
    Friendly: 'Jupiter in a friendly sign gives good fortune, moderate wisdom, and reasonable wealth. Children and education are generally positive areas.',
    Enemy: 'Jupiter in an enemy sign creates conflicts between material desires and spiritual growth. Financial ups and downs. Seek a balanced approach to wealth.',
  },
  Venus: {
    Exalted: 'Venus exalted in Pisces gives extraordinary love life, artistic talent, and refined taste. Marriage is deeply spiritual and loving. Success in arts, fashion, luxury brands, and entertainment.',
    Debilitated: 'Venus debilitated in Virgo creates over-analysis in relationships, difficulty expressing love, and high standards that strain partnerships. Marriage may feel transactional. Beauty is appreciated intellectually rather than emotionally. Focus on accepting imperfection.',
    Own: 'Venus in Taurus or Libra gives natural charm, beautiful relationships, and love of luxury. Marriage is harmonious and aesthetically enriching.',
    Friendly: 'Venus in a friendly sign gives pleasant relationships, reasonable comfort, and artistic appreciation. Marriage life is generally stable.',
    Enemy: 'Venus in an enemy sign creates dissatisfaction in relationships, conflicts over luxury/lifestyle, and challenges in marriage. Practice gratitude and contentment.',
  },
  Saturn: {
    Exalted: 'Saturn exalted in Libra gives exceptional discipline, fair judgment, and long-term success through justice and balance. Career builds steadily to great heights. Strong bones and durable health.',
    Debilitated: 'Saturn debilitated in Aries makes discipline erratic and patience thin. Quick temper undermines long-term plans. Career success comes in bursts rather than steadily. Joint pain and bone issues may appear early. Practice patience as a deliberate virtue.',
    Own: 'Saturn in Capricorn or Aquarius gives structured ambition, organizational skill, and success through persistent effort. Best for administration, engineering, and social reform.',
    Friendly: 'Saturn in a friendly sign gives reasonable discipline and steady career progress. Hard work is rewarded with moderate delays.',
    Enemy: 'Saturn in an enemy sign creates obstacles in career, chronic dissatisfaction, and struggles with authority. Success comes only through extreme perseverance.',
  },
  Rahu: {
    Exalted: 'Rahu in Taurus or Gemini gives extraordinary material success, foreign connections, and unconventional wealth. Success in technology, aviation, and international business.',
    Debilitated: 'Rahu in Scorpio or Sagittarius creates obsessive behaviors, confused ambitions, and struggles with foreign matters. Beware of deception and hidden enemies. Spiritual practice grounds this energy.',
    Own: 'Rahu has no own sign but functions well in Mercury and Venus signs. Strong material drive and innovative thinking.',
    Friendly: 'Rahu in a supportive placement gives ambitious drive channeled through proper means. Technology and foreign connections bring gains.',
    Enemy: 'Rahu in a challenging placement creates illusions, addictive tendencies, and betrayal in partnerships. Maintain ethical boundaries strictly.',
  },
  Ketu: {
    Exalted: 'Ketu in Scorpio or Sagittarius gives deep spiritual insight, psychic abilities, and mastery over occult sciences. Past-life wisdom surfaces naturally. Excellent for research and healing.',
    Debilitated: 'Ketu in Taurus or Gemini creates confusion about material vs spiritual goals. Difficulty in communication and relationships. Financial instability from detachment. Ground yourself in practical routines.',
    Own: 'Ketu has no own sign but functions well in Mars and Jupiter signs. Strong intuition and spiritual inclination.',
    Friendly: 'Ketu in a supportive placement gives controlled detachment and spiritual progress without losing worldly balance.',
    Enemy: 'Ketu in a challenging placement creates sudden losses, confusion, and identity crisis. Anchor yourself through meditation and routine.',
  },
};

function assessDignity(planet: string, sign: string): { status: string; description: string } {
  const info = PLANET_DIGNITY[planet];
  const details = DIGNITY_DETAILS[planet] ?? {};
  if (!info) return { status: 'Neutral', description: `${planet} is placed in ${sign}. Its effects depend on the overall chart configuration and aspects received.` };

  if (sign === info.exalted) return { status: 'Exalted', description: details.Exalted ?? `${planet} is exalted in ${sign}, giving maximum strength.` };
  if (sign === info.debilitated) return { status: 'Debilitated', description: details.Debilitated ?? `${planet} is debilitated in ${sign}, weakening its significations.` };
  if (info.own.includes(sign)) return { status: 'Own Sign', description: details.Own ?? `${planet} is in its own sign ${sign}, functioning comfortably.` };
  if (sign === info.mooltrikona) return { status: 'Mooltrikona', description: details.Own ?? `${planet} is in its mooltrikona sign ${sign}, giving excellent results.` };

  const signLord = SIGN_LORDS[sign];
  if (signLord) {
    const friends = PLANET_FRIENDS[planet] ?? [];
    const enemies = PLANET_ENEMIES[planet] ?? [];
    if (friends.includes(signLord)) return { status: 'Friendly', description: details.Friendly ?? `${planet} in ${sign} (ruled by friend ${signLord}) gives generally positive results.` };
    if (enemies.includes(signLord)) return { status: 'Enemy Sign', description: details.Enemy ?? `${planet} in ${sign} (ruled by enemy ${signLord}) creates challenges.` };
  }

  return { status: 'Neutral', description: `${planet} is placed in ${sign} in a neutral position. Results are mixed — strengthened by benefic aspects and weakened by malefic ones. Look at the aspects and conjunctions to understand its full expression.` };
}

// ---------------------------------------------------------------------------
// Detect aspects received by each planet
// ---------------------------------------------------------------------------

function computeAspects(planets: Array<{ name: string; house: number }>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const p of planets) result[p.name] = [];

  for (const aspecting of planets) {
    const aspects = PLANET_ASPECTS[aspecting.name] ?? [7];
    for (const offset of aspects) {
      const targetHouse = ((aspecting.house - 1 + offset) % 12) + 1;
      for (const target of planets) {
        if (target.name !== aspecting.name && target.house === targetHouse) {
          result[target.name].push(aspecting.name);
        }
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Quick Analysis builder
// ---------------------------------------------------------------------------

function buildQuickAnalysis(
  chartData: GroundTruthInput['chartData'],
  panchangAtBirth?: Record<string, unknown>,
): QuickAnalysis {
  const planets = chartData.planets.map(p => ({
    ...p,
    name: (p as unknown as { planet?: string }).planet ?? p.name,
  }));
  const ascSign = chartData.ascendant.sign;
  const ascLord = SIGN_LORDS[ascSign] ?? '';

  // --- Lagna Lord ---
  const lagnaLordPlanet = planets.find((p) => p.name === ascLord);
  const lagnaHouse = lagnaLordPlanet?.house ?? 0;
  const lagnaSign = lagnaLordPlanet?.sign ?? '';
  const lagnaDeg = lagnaLordPlanet?.degree ?? 0;
  const lagnaRetro = lagnaLordPlanet?.isRetrograde ?? false;
  const lagnaNakshatra = lagnaLordPlanet?.nakshatra ?? '';
  const lagnaDignity = lagnaLordPlanet ? assessDignity(ascLord, lagnaSign).status : 'Unknown';
  const lagnaRetroStr = lagnaRetro ? ' (retrograde)' : '';

  const degInt = Math.floor(lagnaDeg);
  const degMin = Math.round((lagnaDeg - degInt) * 60);
  const lagnaLordDegree = `${degInt}°${String(degMin).padStart(2, '0')}'`;

  const lagnaSummary = lagnaLordPlanet
    ? `${ascLord} (Lagna Lord) is in ${lagnaSign} in house ${lagnaHouse}${lagnaRetroStr} — ${lagnaDignity}.`
    : `${ascLord} (Lagna Lord) position unavailable.`;

  // --- Moon Influence ---
  const moon = planets.find((p) => p.name === 'Moon');
  const moonSign = moon?.sign ?? '';
  const moonHouse = moon?.house ?? 0;
  const moonNakshatra = moon?.nakshatra ?? '';
  const moonPada = moon?.pada ?? 1;
  const moonNakshatraLord = NAKSHATRA_LORDS_MAP[moonNakshatra] ?? '';

  // Derive paksha from panchang if available, else from Moon–Sun angle
  let paksha = 'Shukla';
  let isWaxing = true;
  const panchangTithi = (panchangAtBirth as { tithi?: { paksha?: string } } | undefined)?.tithi;
  if (panchangTithi?.paksha) {
    paksha = panchangTithi.paksha;
    isWaxing = paksha === 'Shukla';
  } else {
    const sun = planets.find((p) => p.name === 'Sun');
    if (sun && moon) {
      const moonLong = ZODIAC_SIGNS.indexOf(moonSign) * 30 + (moon.degree ?? 0);
      const sunLong = ZODIAC_SIGNS.indexOf(sun.sign) * 30 + (sun.degree ?? 0);
      const angle = ((moonLong - sunLong) + 360) % 360;
      isWaxing = angle < 180;
      paksha = isWaxing ? 'Shukla' : 'Krishna';
    }
  }

  const moonDignity = moon ? assessDignity('Moon', moonSign).status : '';
  const pakshaLabel = isWaxing ? 'Shukla (Waxing)' : 'Krishna (Waning)';
  const moonSummary = moon
    ? `Moon in ${moonNakshatra} (${moonNakshatraLord}) pada ${moonPada} in ${moonSign}, house ${moonHouse} — ${pakshaLabel}, ${moonDignity}.`
    : 'Moon position unavailable.';

  return {
    lagnaLord: {
      planet: ascLord,
      house: lagnaHouse,
      sign: lagnaSign,
      degree: lagnaLordDegree,
      nakshatra: lagnaNakshatra,
      isRetrograde: lagnaRetro,
      dignity: lagnaDignity,
      summary: lagnaSummary,
    },
    moonInfluence: {
      sign: moonSign,
      house: moonHouse,
      nakshatra: moonNakshatra,
      pada: moonPada,
      paksha,
      isWaxing,
      nakshatraLord: moonNakshatraLord,
      summary: moonSummary,
    },
  };
}

// ---------------------------------------------------------------------------
// Main builder function
// ---------------------------------------------------------------------------

export function buildGroundTruth(input: GroundTruthInput): GroundTruthData {
  const { chartData, dashaData, yogaData, doshaData, shadbala, ashtakavarga, panchangAtBirth } = input;
  // DB stores planets as PlanetPosition ({ planet, sign, ... }) but GroundTruthInput typed with { name }.
  // Normalize so downstream code can safely use p.name.
  const planets = chartData.planets.map(p => ({
    ...p,
    name: (p as unknown as { planet?: string }).planet ?? p.name,
  }));
  const houses = chartData.houses;
  const ascSign = chartData.ascendant.sign;

  // ---- Planet dignities ----
  const planetDignities: Record<string, { status: string; description: string }> = {};
  for (const p of planets) {
    planetDignities[p.name] = assessDignity(p.name, p.sign);
  }

  // ---- House analysis ----
  const houseAnalysis: Record<number, { sign: string; lord: string; lordHouse: number; planets: string[]; significance: string }> = {};
  for (const h of houses) {
    const lordPlanet = planets.find(p => p.name === h.lord);
    const planetsInHouse = planets.filter(p => p.house === h.house).map(p => p.name);
    houseAnalysis[h.house] = {
      sign: h.sign,
      lord: h.lord,
      lordHouse: lordPlanet?.house ?? 0,
      planets: planetsInHouse,
      significance: HOUSE_SIGNIFICANCE[h.house] ?? '',
    };
  }

  // ---- Detected Yogas ----
  const detectedYogas: GroundTruthData['detectedYogas'] = [];
  for (const y of yogaData) {
    if (y.present === false && y.isPresent === false) continue;
    const name = safe(y.name);
    const meaning = humanizeYogaMeaning(YOGA_MEANINGS[name] ?? safe(y.description, `${name} yoga is present in this chart.`));
    detectedYogas.push({
      name,
      type: safe(y.type, 'Benefic'),
      planets: Array.isArray(y.planets) ? (y.planets as string[]).join(', ') : safe(y.planets),
      meaning,
      strength: typeof y.strength === 'number' ? (y.strength >= 70 ? 'Strong' : y.strength >= 40 ? 'Medium' : 'Weak') : safe(y.strength, 'Medium'),
    });
  }

  // ---- Detected Doshas ----
  const doshaObj = safeObj(doshaData);
  const detectedDoshas: GroundTruthData['detectedDoshas'] = [];
  const doshaKeys: Array<{ key: string; name: string; lookup: string }> = [
    { key: 'mangalDosha', name: 'Mangal Dosha (Kuja Dosha)', lookup: 'mangal' },
    { key: 'mangal', name: 'Mangal Dosha (Kuja Dosha)', lookup: 'mangal' },
    { key: 'kaalSarpDosha', name: 'Kaal Sarp Dosha', lookup: 'kaalSarp' },
    { key: 'kaalSarp', name: 'Kaal Sarp Dosha', lookup: 'kaalSarp' },
    { key: 'sadeSati', name: 'Sade Sati', lookup: 'sadeSati' },
    { key: 'pitraDosha', name: 'Pitra Dosha', lookup: 'pitra' },
    { key: 'pitra', name: 'Pitra Dosha', lookup: 'pitra' },
    { key: 'kemDrumaDosha', name: 'Kem Druma Dosha', lookup: 'kemDruma' },
    { key: 'kemDruma', name: 'Kem Druma Dosha', lookup: 'kemDruma' },
    { key: 'grahanDosha', name: 'Grahan Dosha', lookup: 'grahan' },
    { key: 'grahan', name: 'Grahan Dosha', lookup: 'grahan' },
    { key: 'guruChandalDosha', name: 'Guru Chandal Dosha', lookup: 'guruChandal' },
    { key: 'guruChandal', name: 'Guru Chandal Dosha', lookup: 'guruChandal' },
  ];
  const addedDoshas = new Set<string>();
  for (const dk of doshaKeys) {
    if (addedDoshas.has(dk.name)) continue;
    const d = safeObj(doshaObj[dk.key]);
    if (Object.keys(d).length === 0) continue;
    addedDoshas.add(dk.name);
    const present = Boolean(d.present ?? d.isPresent ?? d.active);
    const info = DOSHA_DESCRIPTIONS[dk.lookup];
    const timeline = dk.lookup === 'sadeSati' && present ? `${safe(d.startDate)} to ${safe(d.endDate)}` : undefined;
    detectedDoshas.push({
      name: dk.name,
      present,
      severity: safe(d.severity, present ? 'moderate' : 'none'),
      description: safe(d.description, info?.description ?? ''),
      remedies: info?.remedies ?? [],
      timeline,
    });
  }

  // ---- Career Indicators (10th house) ----
  const h10 = houses.find(h => h.house === 10);
  const h10Sign = h10?.sign ?? ascSign;
  const professions = SIGN_CAREERS[h10Sign] ?? SIGN_CAREERS[ascSign] ?? [];
  // Merge additional professions from planets in 10th
  const planetsIn10 = planets.filter(p => p.house === 10);
  const extraCareers: string[] = [];
  for (const p of planetsIn10) {
    const sc = SIGN_CAREERS[p.sign];
    if (sc) extraCareers.push(sc[0]);
  }
  const allProfessions = [...new Set([...professions, ...extraCareers])];
  const businessPlanets = ['Mercury', 'Venus', 'Rahu'];
  const servicePlanets = ['Sun', 'Saturn', 'Moon'];
  const bCount = planetsIn10.filter(p => businessPlanets.includes(p.name)).length;
  const sCount = planetsIn10.filter(p => servicePlanets.includes(p.name)).length;
  const businessVsService = bCount > sCount ? 'Business/Entrepreneurship is favored' : sCount > bCount ? 'Service/Employment is favored' : 'Both business and service paths are possible';

  // ---- Health Indicators ----
  const ascElement = SIGN_ELEMENT[ascSign] ?? 'Fire';
  const h6 = houses.find(h => h.house === 6);
  const vulnerableSystems: string[] = [];
  const weakPlanets = planets.filter(p => {
    const d = planetDignities[p.name];
    return d && (d.status === 'Debilitated' || d.status === 'Enemy Sign');
  });
  for (const wp of weakPlanets) {
    const systems = PLANET_HEALTH[wp.name];
    if (systems) vulnerableSystems.push(...systems.slice(0, 2));
  }
  if (h6) {
    const h6Lord = h6.lord;
    const h6Systems = PLANET_HEALTH[h6Lord];
    if (h6Systems) vulnerableSystems.push(h6Systems[0]);
  }
  const constitution = `${SIGN_ELEMENT[ascSign]} constitution (${ascSign} ascendant)`;

  // ---- Marriage Indicators ----
  const h7 = houses.find(h => h.house === 7);
  const h7Sign = h7?.sign ?? '';
  const h7Lord = h7?.lord ?? '';
  const venus = planets.find(p => p.name === 'Venus');
  const jupiter = planets.find(p => p.name === 'Jupiter');
  // Partner sign from 7th house
  const partnerSign = h7Sign;
  // Rough timing from Jupiter/Venus dasha
  const timing = venus && jupiter ? 'During Venus or Jupiter dasha/antardasha periods' : 'Timing depends on 7th lord dasha activation';

  // ---- Lucky Factors ----
  // chartData.ascendant.lord is not populated by the engine; derive lord from sign instead.
  if (!ascSign) console.warn('[groundTruth] ascendant.sign is empty — lucky factors will use fallback defaults');
  const ascLord = SIGN_LORDS[ascSign] ?? houses.find((h) => h.house === 1)?.lord ?? '';
  const numbers = SIGN_LUCKY_NUMBERS[ascSign] ?? [1, 9];
  const colors = SIGN_LUCKY_COLORS[ascSign] ?? ['White'];
  const days = SIGN_LUCKY_DAYS[ascSign] ?? ['Monday'];
  const directions = SIGN_DIRECTIONS[ascSign] ?? ['East'];
  const gemstone = PLANET_GEMSTONES[ascLord]?.stone ?? 'Ruby';
  const metal = PLANET_PRIMARY_METAL[ascLord] ?? SIGN_METAL[ascSign] ?? 'Gold';

  // ---- Remedies ----
  const mantras = Object.entries(PLANET_MANTRAS).map(([planet, m]) => ({ planet, ...m }));
  const gemstones = Object.entries(PLANET_GEMSTONES).map(([planet, g]) => ({ planet, ...g }));
  const fasting = Object.entries(PLANET_FASTING).map(([planet, day]) => ({ planet, day }));
  const charity = Object.entries(PLANET_CHARITY).map(([planet, c]) => ({ planet, item: c.item, day: PLANET_FASTING[planet] ?? '', toWhom: c.toWhom }));

  // ---- Personality Keywords ----
  const personalityKeywords = SIGN_PERSONALITY[ascSign] ?? [];

  // ---- Ascendant Traits ----
  const rawQuality = SIGN_QUALITY[ascSign] ?? '';
  const ascendantTraits = {
    appearance: SIGN_APPEARANCE[ascSign] ?? [],
    nature: SIGN_PERSONALITY[ascSign] ?? [],
    element: SIGN_ELEMENT[ascSign] ?? '',
    quality: rawQuality,
    qualityMeaning: QUALITY_MEANING[rawQuality] ?? rawQuality,
    rulingPlanet: ascLord,
  };

  // ---- Planet Significations ----
  const planetSignifications: Record<string, string[]> = {};
  for (const p of planets) {
    planetSignifications[p.name] = PLANET_SIGNIFICATIONS[p.name] ?? [];
  }

  // ---- Planet Aspects ----
  const planetAspects = computeAspects(planets);

  // ---- Planets needing remedies (weak/afflicted) ----
  const planetRemediesNeeded: string[] = [];
  for (const p of planets) {
    const d = planetDignities[p.name];
    if (d && (d.status === 'Debilitated' || d.status === 'Enemy Sign')) {
      planetRemediesNeeded.push(p.name);
    }
  }

  // ---- Ashtakavarga strengths ----
  const ashtakavargaStrengths: Record<string, string> = {};
  const sarvaObj = safeObj(safeObj(ashtakavarga).sarvaAshtakavarga ?? safeObj(safeObj(ashtakavarga).sarva));
  const sarvaBindusArr = safeArr(safeObj(safeObj(ashtakavarga).sarva).bindus);
  for (let i = 0; i < ZODIAC_SIGNS.length; i++) {
    const sign = ZODIAC_SIGNS[i];
    let bindus: number | null = null;
    if (typeof sarvaObj[sign] === 'number') bindus = sarvaObj[sign] as number;
    else if (typeof sarvaBindusArr[i] === 'number') bindus = sarvaBindusArr[i] as number;
    if (bindus !== null) {
      ashtakavargaStrengths[sign] = bindus >= 28 ? 'Strong' : bindus >= 25 ? 'Average' : 'Weak';
    }
  }

  // ---- Shadbala ranking ----
  // calculateShadbala() returns a PlanetShadbala[] array, but it's stored as the raw shape
  // and was being read with safeObj which rejects arrays — leaving the ranking empty.
  // Handle three serialised shapes: top-level array, { planets: [...] }, or { planet: {...} }.
  const shadbalaRanking: string[] = [];
  type ShadEntry = { planet: string; ratio: number };
  const shadEntries: ShadEntry[] = [];

  const pushFromEntry = (raw: unknown, fallbackKey?: string) => {
    const o = safeObj(raw);
    if (o.totalVirupas === undefined && !o.planet && !fallbackKey) return;
    const total = typeof o.totalVirupas === 'number' ? o.totalVirupas : 0;
    const required = typeof o.requiredVirupas === 'number' ? o.requiredVirupas : 1;
    const ratio = typeof o.ratio === 'number' ? o.ratio : total / required;
    const planet = safe(o.planet) || fallbackKey || '';
    if (planet && Number.isFinite(ratio)) shadEntries.push({ planet, ratio });
  };

  if (Array.isArray(shadbala)) {
    for (const sp of shadbala) pushFromEntry(sp);
  } else {
    const shadObj = safeObj(shadbala);
    const arrSource = safeArr(shadObj.planets ?? shadObj.data);
    if (arrSource.length > 0) {
      for (const sp of arrSource) pushFromEntry(sp);
    } else {
      const planetsObj = safeObj(shadObj.planets);
      const source = Object.keys(planetsObj).length > 0 ? planetsObj : shadObj;
      for (const key of Object.keys(source)) {
        pushFromEntry(source[key], key);
      }
    }
  }

  shadEntries.sort((a, b) => b.ratio - a.ratio);
  for (const se of shadEntries) shadbalaRanking.push(se.planet);

  const shadbalaDetails = shadEntries.map((e) => {
    // Re-fetch the full row so we can include totals — duplicating the parse is cheap.
    let total = 0, required = 1, isStrong = false;
    const consume = (raw: unknown, key?: string) => {
      const o = safeObj(raw);
      const planet = safe(o.planet) || key || '';
      if (planet !== e.planet) return;
      total = typeof o.totalVirupas === 'number' ? o.totalVirupas : total;
      required = typeof o.requiredVirupas === 'number' ? o.requiredVirupas : required;
      isStrong = typeof o.isStrong === 'boolean' ? o.isStrong : total >= required;
    };
    if (Array.isArray(shadbala)) {
      for (const sp of shadbala) consume(sp);
    } else {
      const so = safeObj(shadbala);
      const ar = safeArr(so.planets ?? so.data);
      if (ar.length > 0) for (const sp of ar) consume(sp);
      else {
        const planetsObj = safeObj(so.planets);
        const source = Object.keys(planetsObj).length > 0 ? planetsObj : so;
        for (const key of Object.keys(source)) consume(source[key], key);
      }
    }
    return { planet: e.planet, total, required, ratio: e.ratio, isStrong };
  });

  // ---- Current Dasha ----
  // Accept either shape: { vimshottari: { currentMahadasha, ... } } (DB row) or
  // the flat { currentMahadasha, ... } (already-unwrapped vimshottari object).
  const dashaObj = safeObj(dashaData);
  const dashaSource = safeObj(dashaObj.vimshottari ?? dashaObj);
  const currentMaha = safeObj(dashaSource.currentMahadasha);
  const currentAntar = safeObj(dashaSource.currentAntardasha);
  const currentPratyantar = safeObj(dashaSource.currentPratyantardasha);

  const currentDasha = {
    mahadasha: safe(currentMaha.planet),
    antardasha: safe(currentAntar.planet),
    pratyantardasha: safe(currentPratyantar.planet),
    mahaStart: safe(currentMaha.startDate),
    mahaEnd: safe(currentMaha.endDate),
    antarStart: safe(currentAntar.startDate),
    antarEnd: safe(currentAntar.endDate),
  };

  // ---- Dasha Timeline ----
  const dashaTimeline: GroundTruthData['dashaTimeline'] = [];
  const mahadashas = safeArr(dashaSource.mahadashas);
  for (const md of mahadashas) {
    const m = safeObj(md);
    dashaTimeline.push({
      planet: safe(m.planet),
      start: safe(m.startDate),
      end: safe(m.endDate),
      isCurrent: safe(m.planet) === safe(currentMaha.planet) || Boolean(m.isActive),
    });
  }

  return {
    planetDignities,
    houseAnalysis,
    detectedYogas,
    detectedDoshas,
    careerIndicators: {
      professions: allProfessions,
      businessVsService,
      peakPeriods: `During Mahadasha/Antardasha of 10th lord (${h10?.lord ?? 'unknown'}) and planets in 10th house`,
    },
    healthIndicators: {
      constitution,
      vulnerableSystems: [...new Set(vulnerableSystems)],
      dietaryElement: ELEMENT_DIET[ascElement] ?? ELEMENT_DIET.Fire,
    },
    marriageIndicators: {
      partnerSign,
      timing,
      sevenThLord: h7Lord,
    },
    luckyFactors: { numbers, colors, days, directions, gemstone, metal },
    remedies: { mantras, gemstones, fasting, charity },
    personalityKeywords,
    ascendantTraits,
    planetSignifications,
    planetAspects,
    planetRemediesNeeded,
    ashtakavargaStrengths,
    shadbalaRanking,
    shadbalaDetails,
    currentDasha,
    dashaTimeline,
    planetFullData: PLANET_DATA,
    quickAnalysis: buildQuickAnalysis(chartData, panchangAtBirth),
  };
}
