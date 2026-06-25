'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal } from '@/components/ui/motion-primitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/store/useStore';
import { useActiveChart } from '@/hooks/useActiveChart';
import { Planet3DInline } from '@/components/3d/Planet3DInline';

// ============================================================
// Static Remedy Lookup Tables
// ============================================================

interface MantraInfo {
  planet: string;
  mantra: string;
  beejMantra: string;
  deity: string;
  count: number;
  bestDay: string;
}

const PLANET_MANTRAS: Record<string, MantraInfo> = {
  Sun: {
    planet: 'Sun',
    mantra: 'Om Hraam Hreem Hraum Sah Suryaya Namah',
    beejMantra: 'Om Hraam',
    deity: 'Lord Surya',
    count: 7000,
    bestDay: 'Sunday',
  },
  Moon: {
    planet: 'Moon',
    mantra: 'Om Shraam Shreem Shraum Sah Chandraya Namah',
    beejMantra: 'Om Shraam',
    deity: 'Lord Shiva',
    count: 11000,
    bestDay: 'Monday',
  },
  Mars: {
    planet: 'Mars',
    mantra: 'Om Kraam Kreem Kraum Sah Bhaumaya Namah',
    beejMantra: 'Om Kraam',
    deity: 'Lord Hanuman / Kartikeya',
    count: 10000,
    bestDay: 'Tuesday',
  },
  Mercury: {
    planet: 'Mercury',
    mantra: 'Om Braam Breem Braum Sah Budhaya Namah',
    beejMantra: 'Om Braam',
    deity: 'Lord Vishnu',
    count: 9000,
    bestDay: 'Wednesday',
  },
  Jupiter: {
    planet: 'Jupiter',
    mantra: 'Om Graam Greem Graum Sah Gurave Namah',
    beejMantra: 'Om Graam',
    deity: 'Lord Brihaspati / Dakshinamurthy',
    count: 19000,
    bestDay: 'Thursday',
  },
  Venus: {
    planet: 'Venus',
    mantra: 'Om Draam Dreem Draum Sah Shukraya Namah',
    beejMantra: 'Om Draam',
    deity: 'Goddess Lakshmi',
    count: 16000,
    bestDay: 'Friday',
  },
  Saturn: {
    planet: 'Saturn',
    mantra: 'Om Praam Preem Praum Sah Shanaischaraya Namah',
    beejMantra: 'Om Praam',
    deity: 'Lord Shani Dev',
    count: 23000,
    bestDay: 'Saturday',
  },
  Rahu: {
    planet: 'Rahu',
    mantra: 'Om Bhraam Bhreem Bhraum Sah Rahave Namah',
    beejMantra: 'Om Bhraam',
    deity: 'Goddess Durga',
    count: 18000,
    bestDay: 'Saturday',
  },
  Ketu: {
    planet: 'Ketu',
    mantra: 'Om Sraam Sreem Sraum Sah Ketave Namah',
    beejMantra: 'Om Sraam',
    deity: 'Lord Ganesha',
    count: 7000,
    bestDay: 'Tuesday',
  },
};

interface FastingInfo {
  planet: string;
  day: string;
  details: string;
  foodToAvoid: string;
  breakFastWith: string;
}

const FASTING_DATA: Record<string, FastingInfo> = {
  Sun: { planet: 'Sun', day: 'Sunday', details: 'Fast from sunrise to sunset. Eat one meal before sunset.', foodToAvoid: 'Salt, wheat', breakFastWith: 'Jaggery, wheat preparation' },
  Moon: { planet: 'Moon', day: 'Monday', details: 'Fast the entire day or eat only one meal. Offer water to Shivling.', foodToAvoid: 'Rice, salt', breakFastWith: 'Milk, white foods' },
  Mars: { planet: 'Mars', day: 'Tuesday', details: 'Fast for Hanuman ji. Visit Hanuman temple in the evening.', foodToAvoid: 'Salt, lentils', breakFastWith: 'Jaggery, wheat, red fruits' },
  Mercury: { planet: 'Mercury', day: 'Wednesday', details: 'Fast for Lord Vishnu / Budh Dev. Wear green clothes.', foodToAvoid: 'Green vegetables (ironically)', breakFastWith: 'Moong dal, green foods' },
  Jupiter: { planet: 'Jupiter', day: 'Thursday', details: 'Fast for Brihaspati Dev. Wear yellow clothes. Visit Vishnu temple.', foodToAvoid: 'Salt, banana', breakFastWith: 'Chana dal, yellow foods, banana' },
  Venus: { planet: 'Venus', day: 'Friday', details: 'Fast for Santoshi Maa / Goddess Lakshmi. Wear white.', foodToAvoid: 'Sour foods, citrus', breakFastWith: 'Kheer, white sweets' },
  Saturn: { planet: 'Saturn', day: 'Saturday', details: 'Fast for Shani Dev. Donate to the poor. Light sesame oil lamp.', foodToAvoid: 'Salt, oil, mustard', breakFastWith: 'Khichdi with sesame oil' },
  Rahu: { planet: 'Rahu', day: 'Saturday', details: 'Fast on Saturdays or during Rahu Kaal. Donate to sweepers/cleaners.', foodToAvoid: 'Non-veg, alcohol, onion, garlic', breakFastWith: 'Simple vegetarian food' },
  Ketu: { planet: 'Ketu', day: 'Tuesday', details: 'Fast on Tuesdays. Offer prayers to Lord Ganesha.', foodToAvoid: 'Non-veg, tamasic food', breakFastWith: 'Simple sattvic food' },
};

interface CharityInfo {
  planet: string;
  day: string;
  items: string[];
  toWhom: string;
}

const CHARITY_DATA: Record<string, CharityInfo> = {
  Sun: { planet: 'Sun', day: 'Sunday', items: ['Wheat', 'Jaggery', 'Red cloth', 'Copper utensil', 'Ruby-colored items'], toWhom: 'Father figure, elderly, temple priest' },
  Moon: { planet: 'Moon', day: 'Monday', items: ['Rice', 'White cloth', 'Silver', 'Milk', 'White flowers'], toWhom: 'Mother figure, women, Shiva temple' },
  Mars: { planet: 'Mars', day: 'Tuesday', items: ['Red lentils (masoor dal)', 'Red cloth', 'Copper', 'Jaggery', 'Sweets'], toWhom: 'Soldiers, brothers, Hanuman temple' },
  Mercury: { planet: 'Mercury', day: 'Wednesday', items: ['Green moong dal', 'Green cloth', 'Emerald-colored items', 'Books', 'Stationery'], toWhom: 'Students, scholars, orphans, Vishnu temple' },
  Jupiter: { planet: 'Jupiter', day: 'Thursday', items: ['Yellow cloth', 'Turmeric', 'Chana dal', 'Gold', 'Banana', 'Yellow sweets'], toWhom: 'Brahmins, teachers, guru, temple' },
  Venus: { planet: 'Venus', day: 'Friday', items: ['White rice', 'White cloth', 'Perfume', 'Sweets', 'Silk cloth', 'Ghee'], toWhom: 'Young women, married women, Devi temple' },
  Saturn: { planet: 'Saturn', day: 'Saturday', items: ['Black sesame', 'Mustard oil', 'Black cloth', 'Iron items', 'Urad dal'], toWhom: 'Poor, disabled, servants, Shani temple' },
  Rahu: { planet: 'Rahu', day: 'Saturday', items: ['Coconut', 'Blue cloth', 'Blanket', 'Sesame seeds', 'Lead items'], toWhom: 'Sweepers, untouchables, Naga temple' },
  Ketu: { planet: 'Ketu', day: 'Tuesday or Saturday', items: ['Mixed grains (saptadhanya)', 'Brown/grey blanket', 'Dog food', 'Sesame seeds'], toWhom: 'Sadhus, monks, Ganesha temple, stray dogs' },
};

interface RudrakshaInfo {
  planet: string;
  mukhi: string;
  deity: string;
  benefits: string;
}

const RUDRAKSHA_DATA: Record<string, RudrakshaInfo> = {
  Sun: { planet: 'Sun', mukhi: '1 Mukhi or 12 Mukhi', deity: 'Lord Shiva / Surya', benefits: 'Leadership, confidence, fame, government favor' },
  Moon: { planet: 'Moon', mukhi: '2 Mukhi', deity: 'Ardhanarishwara', benefits: 'Emotional balance, peace of mind, relationships' },
  Mars: { planet: 'Mars', mukhi: '3 Mukhi', deity: 'Agni Dev', benefits: 'Courage, energy, blood-related issues, confidence' },
  Mercury: { planet: 'Mercury', mukhi: '4 Mukhi', deity: 'Lord Brahma', benefits: 'Intelligence, communication, education, memory' },
  Jupiter: { planet: 'Jupiter', mukhi: '5 Mukhi', deity: 'Kalagni Rudra', benefits: 'Wisdom, prosperity, spiritual growth, health' },
  Venus: { planet: 'Venus', mukhi: '6 Mukhi', deity: 'Kartikeya', benefits: 'Love, beauty, wealth, artistic abilities' },
  Saturn: { planet: 'Saturn', mukhi: '7 Mukhi', deity: 'Goddess Lakshmi', benefits: 'Wealth, overcoming Saturn afflictions, discipline' },
  Rahu: { planet: 'Rahu', mukhi: '8 Mukhi', deity: 'Lord Ganesha', benefits: 'Removes Rahu dosha, obstacles, and negative energy' },
  Ketu: { planet: 'Ketu', mukhi: '9 Mukhi', deity: 'Goddess Durga', benefits: 'Spiritual upliftment, removes Ketu afflictions, courage' },
};

const PLANET_COLORS: Record<string, { colors: string[]; avoid: string[] }> = {
  Sun: { colors: ['Red', 'Orange', 'Copper', 'Gold'], avoid: ['Blue', 'Black'] },
  Moon: { colors: ['White', 'Silver', 'Light Blue', 'Cream'], avoid: ['Red', 'Dark colors'] },
  Mars: { colors: ['Red', 'Scarlet', 'Orange', 'Coral'], avoid: ['Blue', 'Green'] },
  Mercury: { colors: ['Green', 'Light Green', 'Parrot Green'], avoid: ['Red'] },
  Jupiter: { colors: ['Yellow', 'Gold', 'Saffron', 'Orange'], avoid: ['Blue', 'Black'] },
  Venus: { colors: ['White', 'Pink', 'Light Blue', 'Multicolor'], avoid: ['Red', 'Orange'] },
  Saturn: { colors: ['Blue', 'Black', 'Dark Purple', 'Grey'], avoid: ['Red', 'Orange'] },
  Rahu: { colors: ['Blue', 'Smoky Grey', 'Multicolored'], avoid: ['Red', 'Yellow'] },
  Ketu: { colors: ['Grey', 'Brown', 'Multi-colored'], avoid: ['Bright colors'] },
};

// Dosha-specific remedies
interface DoshaRemedy {
  dosha: string;
  severity: string;
  remedies: string[];
}

function getDoshaRemedies(doshaData: Record<string, unknown>): DoshaRemedy[] {
  const results: DoshaRemedy[] = [];

  // Mangal Dosha
  const mangal = doshaData.mangal as Record<string, unknown> | undefined;
  if (mangal?.present) {
    results.push({
      dosha: 'Mangal Dosha (Manglik)',
      severity: String(mangal.severity || 'moderate'),
      remedies: [
        'Chant Hanuman Chalisa daily, especially on Tuesdays',
        'Visit Hanuman temple on Tuesdays and offer sindoor and oil',
        'Perform Mangal Shanti Puja',
        'Donate red lentils (masoor dal) on Tuesdays',
        'Fast on Tuesdays for Mangal dosha nivaran',
        'Marry a Manglik person or perform Kumbh Vivah before marriage',
        'Wear Red Coral (Moonga) in gold on ring finger after consulting astrologer',
        'Offer red flowers and vermilion at Navagraha temple',
      ],
    });
  }

  // Kaal Sarp Dosha
  const kaalSarp = doshaData.kaalSarp as Record<string, unknown> | undefined;
  if (kaalSarp?.present) {
    results.push({
      dosha: `Kaal Sarp Dosha (${kaalSarp.name || kaalSarp.type || 'Type unknown'})`,
      severity: String(kaalSarp.severity || 'moderate'),
      remedies: [
        'Perform Kaal Sarp Dosha Nivaran Puja at Trimbakeshwar or Mahakaleshwar',
        'Chant "Om Namah Shivaya" 108 times daily',
        'Visit Naga temple and offer milk to the Naga idol',
        'Keep Naga (serpent) idol in silver at home puja place',
        'Donate to serpent conservation causes',
        'Perform Rahu-Ketu Shanti Puja',
        'Fast on Naga Panchami day',
        'Feed milk and rice to snakes (at designated temples)',
      ],
    });
  }

  // Sade Sati
  const sadeSati = doshaData.sadeSati as Record<string, unknown> | undefined;
  if (sadeSati?.active) {
    results.push({
      dosha: `Sade Sati (${sadeSati.phase || 'active'} phase)`,
      severity: String(sadeSati.severity || 'moderate'),
      remedies: [
        'Chant Shani mantra daily: "Om Praam Preem Praum Sah Shanaischaraya Namah"',
        'Visit Shani temple every Saturday and light a sesame oil lamp',
        'Donate black sesame, mustard oil, and iron items on Saturdays',
        'Feed crows with cooked rice mixed with sesame seeds',
        'Wear 7 Mukhi Rudraksha or Blue Sapphire (after careful testing)',
        'Recite Hanuman Chalisa daily for Shani protection',
        'Serve elderly and disabled people',
        'Fast on Saturdays and eat only one meal',
      ],
    });
  }

  // Pitra Dosha
  const pitra = doshaData.pitra as Record<string, unknown> | undefined;
  if (pitra?.present) {
    results.push({
      dosha: 'Pitra Dosha',
      severity: String(pitra.severity || 'moderate'),
      remedies: [
        'Perform Pitra Tarpan on Amavasya (new moon) days',
        'Perform Shradh rituals during Pitru Paksha',
        'Offer Pind Daan at Gaya, Varanasi, or Prayagraj',
        'Feed Brahmins on Amavasya',
        'Donate food and clothes to the needy in ancestors\' name',
        'Keep an ancestor altar and offer water daily',
        'Plant a Peepal tree and water it regularly',
        'Chant "Om Pitrabhyah Namah" 108 times',
      ],
    });
  }

  // Kemdrum Dosha
  const kemDruma = doshaData.kemDruma as Record<string, unknown> | undefined;
  if (kemDruma?.present) {
    results.push({
      dosha: 'Kemdrum Dosha',
      severity: String(kemDruma.severity || 'moderate'),
      remedies: [
        'Chant Chandra (Moon) mantra daily, especially on Mondays',
        'Fast on Mondays and worship Lord Shiva',
        'Wear Pearl (Moti) in silver on the little finger',
        'Donate white items on Mondays — rice, milk, white cloth',
        'Keep a silver bowl filled with water in bedroom',
        'Offer white flowers to Shivling on Mondays',
      ],
    });
  }

  // Grahan Dosha
  const grahan = doshaData.grahan as Record<string, unknown> | undefined;
  if (grahan?.present) {
    results.push({
      dosha: `Grahan Dosha (${grahan.type || 'both'})`,
      severity: String(grahan.severity || 'moderate'),
      remedies: [
        'Perform Grahan Dosha Shanti Puja',
        'Chant Surya or Chandra mantra based on the type',
        'Donate wheat and jaggery (Surya Grahan) or rice and milk (Chandra Grahan)',
        'Recite Maha Mrityunjaya Mantra 108 times',
        'Visit Shiva temple during eclipses and perform special puja',
      ],
    });
  }

  // Guru Chandal Dosha
  const guruChandal = doshaData.guruChandal as Record<string, unknown> | undefined;
  if (guruChandal?.present) {
    results.push({
      dosha: 'Guru Chandal Dosha',
      severity: String(guruChandal.severity || 'moderate'),
      remedies: [
        'Chant Guru (Jupiter) mantra daily on Thursdays',
        'Wear Yellow Sapphire (Pukhraj) in gold on index finger',
        'Visit Vishnu temple on Thursdays and donate yellow items',
        'Donate chana dal, turmeric, and yellow cloth to Brahmins',
        'Fast on Thursdays and eat only one sattvic meal',
        'Chant Vishnu Sahasranama on Thursdays',
      ],
    });
  }

  return results;
}

// Extract weak planets from chart
function getWeakPlanets(chartData: Record<string, unknown>): string[] {
  const planets = (chartData?.planets ?? []) as Array<{ planet: string; sign: string }>;
  const DEBILITATION: Record<string, string> = {
    Sun: 'Libra', Moon: 'Scorpio', Mars: 'Cancer', Mercury: 'Pisces',
    Jupiter: 'Capricorn', Venus: 'Virgo', Saturn: 'Aries', Rahu: 'Scorpio', Ketu: 'Taurus',
  };
  const ENEMY_SIGNS: Record<string, string[]> = {
    Sun: ['Taurus', 'Libra', 'Capricorn', 'Aquarius'],
    Moon: [],
    Mars: ['Gemini', 'Virgo'],
    Mercury: ['Cancer'],
    Jupiter: ['Gemini', 'Virgo', 'Taurus', 'Libra'],
    Venus: ['Leo', 'Cancer'],
    Saturn: ['Leo', 'Cancer', 'Aries', 'Scorpio'],
    Rahu: ['Leo', 'Cancer', 'Aries', 'Scorpio'],
    Ketu: ['Leo', 'Cancer'],
  };

  const weak: string[] = [];
  for (const p of planets) {
    if (DEBILITATION[p.planet] === p.sign || ENEMY_SIGNS[p.planet]?.includes(p.sign)) {
      weak.push(p.planet);
    }
  }
  return weak;
}

// Get lucky colors based on ascendant lord and Moon sign lord
function getLuckyColors(chartData: Record<string, unknown>): { lucky: string[]; avoid: string[] } {
  const ascendant = chartData?.ascendant as Record<string, unknown> | undefined;
  const planets = (chartData?.planets ?? []) as Array<{ planet: string; sign: string }>;

  const SIGN_LORDS: Record<string, string> = {
    Aries: 'Mars', Taurus: 'Venus', Gemini: 'Mercury', Cancer: 'Moon',
    Leo: 'Sun', Virgo: 'Mercury', Libra: 'Venus', Scorpio: 'Mars',
    Sagittarius: 'Jupiter', Capricorn: 'Saturn', Aquarius: 'Saturn', Pisces: 'Jupiter',
  };

  const ascSign = String(ascendant?.sign || '');
  const ascLord = SIGN_LORDS[ascSign] || '';
  const moonPos = planets.find((p) => p.planet === 'Moon');
  const moonLord = moonPos ? (SIGN_LORDS[moonPos.sign] || '') : '';

  const luckySet = new Set<string>();
  const avoidSet = new Set<string>();

  if (ascLord && PLANET_COLORS[ascLord]) {
    PLANET_COLORS[ascLord].colors.forEach((c) => luckySet.add(c));
  }

  if (moonLord && PLANET_COLORS[moonLord]) {
    PLANET_COLORS[moonLord].colors.forEach((c) => luckySet.add(c));
  }

  const weak = getWeakPlanets(chartData);
  for (const w of weak) {
    if (PLANET_COLORS[w]) {
      PLANET_COLORS[w].avoid.forEach((c) => avoidSet.add(c));
    }
  }

  return {
    lucky: Array.from(luckySet),
    avoid: Array.from(avoidSet),
  };
}

const SEVERITY_BADGE: Record<string, { variant: 'success' | 'warning' | 'error'; label: string }> = {
  none: { variant: 'success', label: 'None' },
  mild: { variant: 'warning', label: 'Mild' },
  moderate: { variant: 'warning', label: 'Moderate' },
  severe: { variant: 'error', label: 'Severe' },
};

export default function RemediesPage() {
  const { activeChart: chart } = useActiveChart();

  const remedyData = useMemo(() => {
    if (!chart) return null;

    const chartObj = chart as unknown as Record<string, unknown>;
    const chartData = (chartObj.chart_data ?? {}) as Record<string, unknown>;
    const doshaData = (chartObj.dosha_data ?? {}) as Record<string, unknown>;

    const weakPlanets = getWeakPlanets(chartData);
    const doshaRemedies = getDoshaRemedies(doshaData);
    const colors = getLuckyColors(chartData);

    return { weakPlanets, doshaRemedies, colors, chartData };
  }, [chart]);

  if (!chart) {
    return (
      <MotionPage className="mx-auto max-w-4xl px-4 py-6 min-h-screen">
        <div className="mb-5">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Vedic Astrology</p>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">Remedies Dashboard</h1>
        </div>
        <FadeIn>
          <div className="rounded-2xl glass-2 p-8 text-center" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
            <p className="text-3xl mb-3">🙏</p>
            <p className="text-sm font-bold font-[family-name:var(--font-serif)] text-text mb-1.5">No Kundli Chart Found</p>
            <p className="text-xs text-text-secondary mb-4">
              Generate your Kundli first to get personalized Vedic remedies for your chart.
            </p>
            <Link
              href="/kundli/generate"
              className="inline-block rounded-xl px-5 py-2.5 text-xs font-semibold transition-all"
              style={{ background: 'rgba(212, 175, 55,0.15)', border: '1px solid rgba(212, 175, 55,0.35)', color: 'var(--text)' }}
            >
              Generate Kundli
            </Link>
          </div>
        </FadeIn>
      </MotionPage>
    );
  }

  const { weakPlanets, doshaRemedies, colors } = remedyData!;

  return (
    <MotionPage className="mx-auto max-w-4xl px-4 py-6 min-h-screen">
      <div className="mb-5">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Vedic Astrology</p>
        <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">Remedies Dashboard</h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          Consolidated Vedic remedies based on your Kundli chart. Focus on remedies for your weak planets and active doshas.
        </p>
      </div>

      {/* Quick Summary */}
      <StaggerList className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StaggerItem><SummaryCard label="Weak Planets" value={String(weakPlanets.length)} icon="🪐" /></StaggerItem>
        <StaggerItem><SummaryCard label="Active Doshas" value={String(doshaRemedies.length)} icon="⚠️" /></StaggerItem>
        <StaggerItem><SummaryCard label="Lucky Colors" value={String(colors.lucky.length)} icon="🎨" /></StaggerItem>
        <StaggerItem><SummaryCard label="Remedy Types" value="7" icon="🙏" /></StaggerItem>
      </StaggerList>

      {/* Dosha Remedies */}
      {doshaRemedies.length > 0 && (
        <section className="mb-5">
          <SectionHeader icon="⚠️" title="Dosha Remedies" color="error" />
          <p className="mb-3 text-[10px] text-text-secondary">Specific remedies for doshas detected in your chart.</p>
          <StaggerList className="space-y-3">
            {doshaRemedies.map((dr, i) => {
              const sev = SEVERITY_BADGE[dr.severity] || SEVERITY_BADGE.moderate;
              return (
                <StaggerItem key={i}>
                  <Card className="border-error/20">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-[family-name:var(--font-serif)]">{dr.dosha}</CardTitle>
                        <Badge variant={sev.variant}>{sev.label}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1.5">
                        {dr.remedies.map((r, ri) => (
                          <li key={ri} className="flex items-start gap-1.5 text-xs text-text-secondary">
                            <span className="mt-0.5 text-primary shrink-0">+</span>
                            {r}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </StaggerItem>
              );
            })}
          </StaggerList>
        </section>
      )}

      {/* Mantras */}
      <ScrollReveal>
        <section className="mb-5">
          <SectionHeader icon="🕉️" title="Mantras" color="primary" />
          <p className="mb-3 text-[10px] text-text-secondary">
            {weakPlanets.length > 0
              ? `Focus on mantras for your weak planets: ${weakPlanets.join(', ')}.`
              : 'Chant these mantras to strengthen all planetary energies.'}
          </p>
          <div className="space-y-2.5">
            {Object.entries(PLANET_MANTRAS).map(([planet, info]) => {
              const isWeak = weakPlanets.includes(planet);
              return (
                <Card key={planet} className={isWeak ? 'border-warning/30 ring-1 ring-warning/10' : ''}>
                  <CardContent>
                    <div className="flex items-start justify-between gap-2.5">
                      <Planet3DInline planet={planet} size={36} className="mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-semibold text-text">{info.planet}</span>
                          {isWeak && <Badge variant="warning">Priority</Badge>}
                        </div>
                        <p className="text-xs text-primary font-medium italic break-words">{info.mantra}</p>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-secondary">
                          <span>Beej: {info.beejMantra}</span>
                          <span>Deity: {info.deity}</span>
                          <span>Count: {info.count.toLocaleString()}</span>
                          <span>Best: {info.bestDay}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </ScrollReveal>

      {/* Gemstones */}
      <ScrollReveal>
        <section className="mb-5">
          <SectionHeader icon="💎" title="Gemstones" color="accent" />
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-xs text-text-secondary mb-3">
                View detailed gemstone recommendations based on your planetary strengths, including which stone to wear, finger, metal, mantra, and do&apos;s/don&apos;ts.
              </p>
              <Link
                href="/gemstone"
                className="inline-block rounded-lg bg-primary/15 border border-primary/25 px-5 py-2.5 text-xs font-semibold text-primary hover:bg-primary/25 transition-colors"
              >
                View Gemstone Recommendations
              </Link>
            </CardContent>
          </Card>
        </section>
      </ScrollReveal>

      {/* Fasting */}
      <ScrollReveal>
        <section className="mb-5">
          <SectionHeader icon="🍽️" title="Fasting (Vrat)" color="warning" />
          <p className="mb-3 text-[10px] text-text-secondary">
            {weakPlanets.length > 0
              ? `Prioritize fasting for: ${weakPlanets.join(', ')}.`
              : 'Fasting strengthens weak planets and brings blessings.'}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {Object.entries(FASTING_DATA)
              .sort(([a], [b]) => {
                const aWeak = weakPlanets.includes(a) ? 0 : 1;
                const bWeak = weakPlanets.includes(b) ? 0 : 1;
                return aWeak - bWeak;
              })
              .map(([planet, info]) => {
                const isWeak = weakPlanets.includes(planet);
                return (
                  <Card key={planet} className={isWeak ? 'border-warning/30' : ''}>
                    <CardContent>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Planet3DInline planet={planet} size={24} />
                        <span className="text-xs font-semibold text-text">{info.planet}</span>
                        <Badge variant="outline">{info.day}</Badge>
                        {isWeak && <Badge variant="warning">Priority</Badge>}
                      </div>
                      <p className="text-[10px] text-text-secondary mb-1.5">{info.details}</p>
                      <div className="text-[10px] text-text-secondary">
                        <span className="text-error">Avoid: </span>{info.foodToAvoid}
                      </div>
                      <div className="text-[10px] text-text-secondary">
                        <span className="text-success">Break with: </span>{info.breakFastWith}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </section>
      </ScrollReveal>

      {/* Charity */}
      <ScrollReveal>
        <section className="mb-5">
          <SectionHeader icon="🤲" title="Charity (Daan)" color="success" />
          <p className="mb-3 text-[10px] text-text-secondary">
            Donate the following items on the specified day to pacify planetary energies.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {Object.entries(CHARITY_DATA)
              .sort(([a], [b]) => {
                const aWeak = weakPlanets.includes(a) ? 0 : 1;
                const bWeak = weakPlanets.includes(b) ? 0 : 1;
                return aWeak - bWeak;
              })
              .map(([planet, info]) => {
                const isWeak = weakPlanets.includes(planet);
                return (
                  <Card key={planet} className={isWeak ? 'border-success/30' : ''}>
                    <CardContent>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-xs font-semibold text-text">{info.planet}</span>
                        <Badge variant="outline">{info.day}</Badge>
                        {isWeak && <Badge variant="warning">Priority</Badge>}
                      </div>
                      <div className="mb-0.5">
                        <span className="text-[10px] text-text-secondary">Items: </span>
                        <span className="text-[10px] text-text">{info.items.join(', ')}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-text-secondary">To: </span>
                        <span className="text-[10px] text-text">{info.toWhom}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </section>
      </ScrollReveal>

      {/* Rudraksha */}
      <ScrollReveal>
        <section className="mb-5">
          <SectionHeader icon="📿" title="Rudraksha" color="primary" />
          <p className="mb-3 text-[10px] text-text-secondary">
            Wear the appropriate Rudraksha bead to strengthen weak or afflicted planets.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(RUDRAKSHA_DATA)
              .sort(([a], [b]) => {
                const aWeak = weakPlanets.includes(a) ? 0 : 1;
                const bWeak = weakPlanets.includes(b) ? 0 : 1;
                return aWeak - bWeak;
              })
              .map(([planet, info]) => {
                const isWeak = weakPlanets.includes(planet);
                return (
                  <Card key={planet} className={isWeak ? 'border-primary/30' : ''}>
                    <CardContent>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-xs font-semibold text-text">{info.planet}</span>
                        {isWeak && <Badge variant="warning">Priority</Badge>}
                      </div>
                      <div className="text-[10px] text-text-secondary space-y-0.5">
                        <p><span className="text-text font-medium">{info.mukhi}</span></p>
                        <p>Deity: {info.deity}</p>
                        <p>{info.benefits}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </section>
      </ScrollReveal>

      {/* Lucky Colors */}
      <ScrollReveal>
        <section className="mb-5">
          <SectionHeader icon="🎨" title="Lucky Colors" color="accent" />
          <Card>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-success mb-2">Favorable Colors</p>
                  <div className="flex flex-wrap gap-1.5">
                    {colors.lucky.length > 0 ? (
                      colors.lucky.map((c) => (
                        <Badge key={c} variant="success">{c}</Badge>
                      ))
                    ) : (
                      <span className="text-[10px] text-text-secondary">Generate chart for color recommendations</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-error mb-2">Colors to Avoid</p>
                  <div className="flex flex-wrap gap-1.5">
                    {colors.avoid.length > 0 ? (
                      colors.avoid.map((c) => (
                        <Badge key={c} variant="error">{c}</Badge>
                      ))
                    ) : (
                      <span className="text-[10px] text-text-secondary">No specific colors to avoid</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </ScrollReveal>

      <p className="mt-5 text-center text-[10px] text-text-secondary/60">
        Remedies are based on Vedic astrology principles and should be performed with faith and devotion. Consult a qualified astrologer or pandit for personalized guidance.
      </p>
    </MotionPage>
  );
}

// Helper components

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl glass-1 py-3 px-2 text-center" style={{ border: '1px solid rgba(212, 175, 55,0.12)' }}>
      <p className="text-lg mb-0.5">{icon}</p>
      <p className="text-base font-bold" style={{ color: 'var(--text)' }}>{value}</p>
      <p className="text-[10px] text-text-secondary">{label}</p>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string; color?: string }) {
  return (
    <h2 className="mb-2.5 text-sm font-bold font-[family-name:var(--font-serif)] text-text tracking-wide flex items-center gap-2">
      <div className="w-[2px] h-4 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(to bottom, var(--primary), #a87fff)' }} />
      <span>{icon}</span>
      <span>{title}</span>
    </h2>
  );
}
