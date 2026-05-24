'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal } from '@/components/ui/motion-primitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/store/useStore';
import { useActiveChart } from '@/hooks/useActiveChart';

// ============================================================
// Static Gemstone Lookup Data
// ============================================================

interface GemstoneInfo {
  planet: string;
  planetHindi: string;
  gemstone: string;
  gemstoneHindi: string;
  alternativeStones: string[];
  finger: string;
  metal: string;
  dayToWear: string;
  mantra: string;
  mantraCount: number;
  weightCarats: string;
  color: string;
  dos: string[];
  donts: string[];
}

const GEMSTONE_DATA: Record<string, GemstoneInfo> = {
  Sun: {
    planet: 'Sun',
    planetHindi: 'Surya',
    gemstone: 'Ruby (Manik)',
    gemstoneHindi: 'Manik',
    alternativeStones: ['Garnet', 'Red Spinel', 'Sunstone'],
    finger: 'Ring finger',
    metal: 'Gold',
    dayToWear: 'Sunday',
    mantra: 'Om Hraam Hreem Hraum Sah Suryaya Namah',
    mantraCount: 7000,
    weightCarats: '3-5 carats',
    color: '#ef4444',
    dos: [
      'Wear during Shukla Paksha on a Sunday morning',
      'Energize with Surya mantra before wearing',
      'Touch the ring to your forehead before wearing',
      'Offer water to the Sun every morning',
    ],
    donts: [
      'Do not wear if Sun is in enemy sign with Saturn',
      'Avoid wearing cracked or flawed rubies',
      'Do not wear during eclipse periods',
      'Remove before sleeping if it causes heat or restlessness',
    ],
  },
  Moon: {
    planet: 'Moon',
    planetHindi: 'Chandra',
    gemstone: 'Pearl (Moti)',
    gemstoneHindi: 'Moti',
    alternativeStones: ['Moonstone', 'White Coral', 'White Sapphire'],
    finger: 'Little finger',
    metal: 'Silver',
    dayToWear: 'Monday',
    mantra: 'Om Shraam Shreem Shraum Sah Chandraya Namah',
    mantraCount: 11000,
    weightCarats: '2-4 carats',
    color: '#e2e8f0',
    dos: [
      'Wear on a Monday during Shukla Paksha',
      'Dip in Gangajal or raw milk before wearing',
      'Chant Chandra mantra 108 times',
      'Offer white flowers to Lord Shiva',
    ],
    donts: [
      'Do not wear if Moon is conjunct Rahu or Ketu',
      'Avoid yellow or discolored pearls',
      'Do not wear during Amavasya (new moon)',
      'Remove if experiencing excessive cold or lethargy',
    ],
  },
  Mars: {
    planet: 'Mars',
    planetHindi: 'Mangal',
    gemstone: 'Red Coral (Moonga)',
    gemstoneHindi: 'Moonga',
    alternativeStones: ['Carnelian', 'Red Jasper', 'Bloodstone'],
    finger: 'Ring finger',
    metal: 'Gold or Copper',
    dayToWear: 'Tuesday',
    mantra: 'Om Kraam Kreem Kraum Sah Bhaumaya Namah',
    mantraCount: 10000,
    weightCarats: '3-5 carats',
    color: '#f97316',
    dos: [
      'Wear on a Tuesday morning during Shukla Paksha',
      'Wash with Gangajal and energize with mantra',
      'Offer red flowers at Hanuman temple',
      'Recite Hanuman Chalisa before wearing',
    ],
    donts: [
      'Do not wear if Mars is lord of 6th, 8th, or 12th house for your ascendant',
      'Avoid cracked or spotted corals',
      'Do not combine with emerald or blue sapphire',
      'Remove if experiencing excessive anger or aggression',
    ],
  },
  Mercury: {
    planet: 'Mercury',
    planetHindi: 'Budh',
    gemstone: 'Emerald (Panna)',
    gemstoneHindi: 'Panna',
    alternativeStones: ['Green Tourmaline', 'Peridot', 'Green Jade'],
    finger: 'Little finger',
    metal: 'Gold',
    dayToWear: 'Wednesday',
    mantra: 'Om Braam Breem Braum Sah Budhaya Namah',
    mantraCount: 9000,
    weightCarats: '3-5 carats',
    color: '#22c55e',
    dos: [
      'Wear on a Wednesday morning during Shukla Paksha',
      'Dip in Gangajal and chant Budh mantra 108 times',
      'Offer green moong dal to Brahmins',
      'Keep emerald clean and free of scratches',
    ],
    donts: [
      'Do not combine with red coral or pearl',
      'Avoid emeralds with black spots or inclusions',
      'Do not wear if Mercury is combust',
      'Remove if experiencing skin allergies',
    ],
  },
  Jupiter: {
    planet: 'Jupiter',
    planetHindi: 'Guru/Brihaspati',
    gemstone: 'Yellow Sapphire (Pukhraj)',
    gemstoneHindi: 'Pukhraj',
    alternativeStones: ['Yellow Topaz', 'Citrine', 'Yellow Beryl'],
    finger: 'Index finger',
    metal: 'Gold',
    dayToWear: 'Thursday',
    mantra: 'Om Graam Greem Graum Sah Gurave Namah',
    mantraCount: 19000,
    weightCarats: '3-5 carats',
    color: '#eab308',
    dos: [
      'Wear on a Thursday morning during Shukla Paksha',
      'Dip in Gangajal and turmeric water',
      'Chant Guru mantra 108 times before wearing',
      'Offer yellow sweets and clothes to Brahmins',
    ],
    donts: [
      'Do not wear with blue sapphire or diamond',
      'Avoid milky or clouded yellow sapphires',
      'Do not wear if Jupiter is in 6th, 8th, or 12th house',
      'Remove if experiencing weight gain or liver issues',
    ],
  },
  Venus: {
    planet: 'Venus',
    planetHindi: 'Shukra',
    gemstone: 'Diamond (Heera)',
    gemstoneHindi: 'Heera',
    alternativeStones: ['White Sapphire', 'Zircon', 'White Topaz'],
    finger: 'Middle finger or Ring finger',
    metal: 'Platinum or Silver',
    dayToWear: 'Friday',
    mantra: 'Om Draam Dreem Draum Sah Shukraya Namah',
    mantraCount: 16000,
    weightCarats: '0.5-2 carats',
    color: '#a78bfa',
    dos: [
      'Wear on a Friday morning during Shukla Paksha',
      'Dip in raw milk and Gangajal',
      'Chant Shukra mantra 108 times',
      'Offer white flowers and sweets to a Goddess temple',
    ],
    donts: [
      'Do not combine with ruby or red coral',
      'Avoid diamonds with dark inclusions or cracks',
      'Do not wear if Venus is combust with Sun',
      'Remove if experiencing relationship turbulence',
    ],
  },
  Saturn: {
    planet: 'Saturn',
    planetHindi: 'Shani',
    gemstone: 'Blue Sapphire (Neelam)',
    gemstoneHindi: 'Neelam',
    alternativeStones: ['Amethyst', 'Blue Topaz', 'Iolite', 'Lapis Lazuli'],
    finger: 'Middle finger',
    metal: 'Panchdhatu or Silver',
    dayToWear: 'Saturday',
    mantra: 'Om Praam Preem Praum Sah Shanaischaraya Namah',
    mantraCount: 23000,
    weightCarats: '2-5 carats',
    color: '#3b82f6',
    dos: [
      'Test for 3 days by keeping under pillow before wearing',
      'Wear on a Saturday evening during Shukla Paksha',
      'Dip in sesame oil and Gangajal',
      'Offer mustard oil and black sesame to Shani temple',
    ],
    donts: [
      'NEVER wear without consulting an astrologer first',
      'Do not combine with ruby, red coral, or pearl',
      'Remove immediately if bad dreams or accidents occur within 3 days',
      'Avoid if Saturn rules the 2nd or 7th house for your lagna — consult an astrologer first',
    ],
  },
  Rahu: {
    planet: 'Rahu',
    planetHindi: 'Rahu',
    gemstone: 'Hessonite / Gomed',
    gemstoneHindi: 'Gomed',
    alternativeStones: ['Orange Zircon', 'Spessartite Garnet'],
    finger: 'Middle finger',
    metal: 'Panchdhatu or Silver',
    dayToWear: 'Saturday or Wednesday',
    mantra: 'Om Bhraam Bhreem Bhraum Sah Rahave Namah',
    mantraCount: 18000,
    weightCarats: '3-5 carats',
    color: '#6b7280',
    dos: [
      'Wear on a Saturday during Shukla Paksha',
      'Dip in raw milk and Gangajal',
      'Chant Rahu mantra 108 times',
      'Offer coconut and blue flowers at a Naga temple',
    ],
    donts: [
      'Do not combine with ruby, pearl, or red coral',
      'Avoid if Rahu is in 6th, 8th, or 12th house',
      'Do not wear cracked or dull hessonites',
      'Remove if experiencing confusion or anxiety',
    ],
  },
  Ketu: {
    planet: 'Ketu',
    planetHindi: 'Ketu',
    gemstone: "Cat's Eye (Lehsunia)",
    gemstoneHindi: 'Lehsunia / Vaidurya',
    alternativeStones: ['Tiger Eye', 'Chrysoberyl'],
    finger: 'Little finger or Ring finger',
    metal: 'Panchdhatu or Silver',
    dayToWear: 'Tuesday or Saturday',
    mantra: 'Om Sraam Sreem Sraum Sah Ketave Namah',
    mantraCount: 7000,
    weightCarats: '3-5 carats',
    color: '#92400e',
    dos: [
      'Wear on a Tuesday during Shukla Paksha',
      'Dip in Gangajal and energize with mantra',
      'Offer a flag at a Ganesha temple',
      'Donate blankets to the needy',
    ],
    donts: [
      'Do not combine with emerald or diamond',
      'Avoid if Ketu is in enemy sign or conjunct malefics',
      'Do not wear chipped or cloudy stones',
      'Remove if experiencing detachment or confusion',
    ],
  },
};

// Determine planet strength from shadbala or chart data
type PlanetStrength = 'weak' | 'average' | 'strong';

interface PlanetAnalysis {
  planet: string;
  strength: PlanetStrength;
  reason: string;
  needsGemstone: boolean;
}

function analyzePlanetStrengths(chart: Record<string, unknown>): PlanetAnalysis[] {
  const chartData = chart.chart_data as Record<string, unknown> | undefined;
  const shadbala = chart.shadbala as Record<string, unknown> | undefined;

  const planets = (chartData?.planets ?? []) as Array<{
    planet: string;
    sign: string;
    isRetrograde?: boolean;
    house?: number;
    longitude?: number;
  }>;

  // Shadbala results if available
  const shadbalaResults = (shadbala?.results ?? shadbala?.planets ?? []) as Array<{
    planet: string;
    totalVirupas: number;
    requiredVirupas: number;
    isStrong: boolean;
  }>;

  const shadbalaMap = new Map(shadbalaResults.map((s) => [s.planet, s]));

  // Debilitation signs
  const DEBILITATION: Record<string, string> = {
    Sun: 'Libra',
    Moon: 'Scorpio',
    Mars: 'Cancer',
    Mercury: 'Pisces',
    Jupiter: 'Capricorn',
    Venus: 'Virgo',
    Saturn: 'Aries',
    Rahu: 'Scorpio',
    Ketu: 'Taurus',
  };

  // Exaltation signs
  const EXALTATION: Record<string, string> = {
    Sun: 'Aries',
    Moon: 'Taurus',
    Mars: 'Capricorn',
    Mercury: 'Virgo',
    Jupiter: 'Cancer',
    Venus: 'Pisces',
    Saturn: 'Libra',
    Rahu: 'Taurus',
    Ketu: 'Scorpio',
  };

  // Own signs
  const OWN_SIGNS: Record<string, string[]> = {
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

  // Enemy signs (planet in sign ruled by enemy)
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

  const allPlanets = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

  // Check if Sun is in chart to detect combustion
  const sunPos = planets.find((p) => p.planet === 'Sun');

  return allPlanets.map((planetName) => {
    const pos = planets.find((p) => p.planet === planetName);
    const sb = shadbalaMap.get(planetName);
    const reasons: string[] = [];
    let strength: PlanetStrength = 'average';
    let needsGemstone = false;

    if (!pos) {
      return { planet: planetName, strength: 'average', reason: 'Position data unavailable', needsGemstone: false };
    }

    // Check debilitation
    if (DEBILITATION[planetName] === pos.sign) {
      reasons.push('Debilitated in ' + pos.sign);
      strength = 'weak';
      needsGemstone = true;
    }

    // Check enemy sign
    if (ENEMY_SIGNS[planetName]?.includes(pos.sign)) {
      reasons.push('In enemy sign ' + pos.sign);
      if (strength !== 'weak') strength = 'weak';
      needsGemstone = true;
    }

    // Check combustion (within certain degrees of Sun)
    if (planetName !== 'Sun' && planetName !== 'Rahu' && planetName !== 'Ketu' && sunPos && pos.longitude !== undefined && sunPos.longitude !== undefined) {
      const diff = Math.abs(pos.longitude - sunPos.longitude);
      const angDist = diff > 180 ? 360 - diff : diff;
      const combustDist: Record<string, number> = {
        Moon: 12, Mars: 17, Mercury: 14, Jupiter: 11, Venus: 10, Saturn: 15,
      };
      if (angDist < (combustDist[planetName] ?? 10)) {
        reasons.push('Combust (close to Sun)');
        if (strength !== 'weak') strength = 'weak';
        needsGemstone = true;
      }
    }

    // Check retrograde (not necessarily weak but notable)
    if (pos.isRetrograde) {
      reasons.push('Retrograde');
    }

    // Check exaltation
    if (EXALTATION[planetName] === pos.sign) {
      reasons.push('Exalted in ' + pos.sign);
      strength = 'strong';
      needsGemstone = false;
    }

    // Check own sign
    if (OWN_SIGNS[planetName]?.includes(pos.sign)) {
      reasons.push('In own sign ' + pos.sign);
      if (strength !== 'strong') strength = 'strong';
      needsGemstone = false;
    }

    // Use shadbala if available (overrides for 7 main planets)
    if (sb) {
      if (sb.isStrong) {
        if (strength === 'weak') {
          // Shadbala says strong but sign says weak — keep as average
          strength = 'average';
        } else {
          strength = 'strong';
        }
        reasons.push(`Shadbala: ${Math.round(sb.totalVirupas)}/${sb.requiredVirupas} virupas`);
      } else {
        strength = 'weak';
        needsGemstone = true;
        reasons.push(`Shadbala: ${Math.round(sb.totalVirupas)}/${sb.requiredVirupas} virupas (below threshold)`);
      }
    }

    const reason = reasons.length > 0 ? reasons.join('; ') : 'Normal placement';
    return { planet: planetName, strength, reason, needsGemstone };
  });
}

const STRENGTH_BADGE: Record<PlanetStrength, { variant: 'success' | 'warning' | 'error'; label: string }> = {
  strong: { variant: 'success', label: 'Strong' },
  average: { variant: 'warning', label: 'Average' },
  weak: { variant: 'error', label: 'Weak' },
};

export default function GemstonePage() {
  const { activeChart: chart } = useActiveChart();

  const analysis = useMemo(() => {
    if (!chart) return [];
    return analyzePlanetStrengths(chart as unknown as Record<string, unknown>);
  }, [chart]);

  // Separate into recommended (weak planets) and informational
  const recommended = analysis.filter((a) => a.needsGemstone);
  const others = analysis.filter((a) => !a.needsGemstone);

  if (!chart) {
    return (
      <MotionPage className="mx-auto max-w-4xl px-4 py-6 min-h-screen bg-bg">
        <div className="mb-5">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Vedic Astrology</p>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">Gemstone Recommendations</h1>
        </div>
        <FadeIn>
          <div className="rounded-2xl bg-surface border border-border p-8 text-center">
            <p className="text-3xl mb-3">💎</p>
            <p className="text-sm font-bold text-text mb-1.5">No Kundli Chart Found</p>
            <p className="text-xs text-text-muted mb-4">
              Generate your Kundli first to get personalized gemstone recommendations based on your planetary positions.
            </p>
            <Link
              href="/kundli/generate"
              className="inline-block rounded-full px-5 py-2.5 text-xs font-semibold transition-all bg-primary/10 border border-primary/20 text-primary hover:bg-primary/15"
            >
              Generate Kundli
            </Link>
          </div>
        </FadeIn>
      </MotionPage>
    );
  }

  return (
    <MotionPage className="mx-auto max-w-4xl px-4 py-6 min-h-screen bg-bg">
      <div className="mb-5">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Vedic Astrology</p>
        <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">Gemstone Recommendations</h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          Based on your Kundli chart analysis. Weak or afflicted planets can be strengthened by wearing the right gemstone.
        </p>
      </div>

      {/* Recommended Gemstones Section */}
      {recommended.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-3 text-sm font-semibold font-[family-name:var(--font-serif)] text-text flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-error" />
            Recommended Gemstones
          </h2>
          <p className="mb-3 text-[10px] text-text-secondary">
            These planets are weak or afflicted in your chart. Wearing the corresponding gemstone may help strengthen them.
          </p>
          <StaggerList className="space-y-3">
            {recommended.map((item) => {
              const gem = GEMSTONE_DATA[item.planet];
              if (!gem) return null;
              return (
                <StaggerItem key={item.planet}>
                  <GemstoneCard analysis={item} gem={gem} highlighted />
                </StaggerItem>
              );
            })}
          </StaggerList>
        </section>
      )}

      {recommended.length === 0 && (
        <FadeIn>
          <Card className="mb-5 border-success/30">
            <CardContent className="py-6 text-center">
              <p className="text-2xl mb-2">✨</p>
              <p className="text-sm font-semibold text-success mb-0.5">All Planets Reasonably Strong</p>
              <p className="text-xs text-text-secondary">
                No critical gemstone recommendations at this time. You can still explore gemstones below for optional strengthening.
              </p>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* All Planets Section */}
      {others.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold font-[family-name:var(--font-serif)] text-text flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
            Other Planets
          </h2>
          <p className="mb-3 text-[10px] text-text-secondary">
            These planets are average or strong. Gemstones are optional and can be worn for additional enhancement if desired.
          </p>
          <StaggerList className="space-y-3">
            {others.map((item) => {
              const gem = GEMSTONE_DATA[item.planet];
              if (!gem) return null;
              return (
                <StaggerItem key={item.planet}>
                  <GemstoneCard analysis={item} gem={gem} highlighted={false} />
                </StaggerItem>
              );
            })}
          </StaggerList>
        </section>
      )}

      <p className="mt-5 text-center text-[10px] text-text-secondary/60">
        Gemstone recommendations are based on Vedic astrology principles. Always consult a qualified astrologer before wearing any gemstone, especially Blue Sapphire (Neelam).
      </p>
    </MotionPage>
  );
}

function GemstoneCard({
  analysis,
  gem,
  highlighted,
}: {
  analysis: PlanetAnalysis;
  gem: GemstoneInfo;
  highlighted: boolean;
}) {
  const badgeInfo = STRENGTH_BADGE[analysis.strength];

  return (
    <Card className={highlighted ? 'border-error/30 ring-1 ring-error/10' : ''}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold"
              style={{ backgroundColor: gem.color + '33', color: gem.color, border: `1px solid ${gem.color}44` }}
            >
              {gem.planet.slice(0, 2)}
            </div>
            <div>
              <CardTitle className="text-sm">
                {gem.planet} ({gem.planetHindi}) — {gem.gemstone}
              </CardTitle>
              <p className="mt-0.5 text-[10px] text-text-secondary">{analysis.reason}</p>
            </div>
          </div>
          <Badge variant={badgeInfo.variant}>{badgeInfo.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <InfoRow label="Primary Stone" value={gem.gemstone} />
          <InfoRow label="Alternatives" value={gem.alternativeStones.join(', ')} />
          <InfoRow label="Finger" value={gem.finger} />
          <InfoRow label="Metal" value={gem.metal} />
          <InfoRow label="Day to Wear" value={gem.dayToWear} />
          <InfoRow label="Weight" value={gem.weightCarats} />
        </div>

        <div className="mt-3 rounded-lg bg-surface/50 border border-border/50 p-2.5">
          <p className="text-[10px] font-semibold text-text mb-0.5">Mantra to Energize</p>
          <p className="text-xs text-primary font-medium italic">{gem.mantra}</p>
          <p className="text-[10px] text-text-secondary mt-0.5">Chant {gem.mantraCount.toLocaleString()} times before first wearing</p>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold text-success mb-1.5">Do&apos;s</p>
            <ul className="space-y-1">
              {gem.dos.map((d, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[10px] text-text-secondary">
                  <span className="mt-0.5 text-success shrink-0">+</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-error mb-1.5">Don&apos;ts</p>
            <ul className="space-y-1">
              {gem.donts.map((d, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[10px] text-text-secondary">
                  <span className="mt-0.5 text-error shrink-0">-</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-[10px] text-text-secondary shrink-0">{label}</span>
      <span className="text-[10px] font-medium text-text text-right">{value}</span>
    </div>
  );
}
