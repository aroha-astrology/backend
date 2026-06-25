export interface Puja {
  id: string;
  slug: string;
  name_en: string;
  name_sanskrit: string;
  short_desc: string;
  long_desc: string;
  deity: string;
  image_path: string;
  primary_dosha: string | null;
  primary_planet: string | null;
  intent_tags: string[];
  base_priority: number;
  duration_min: number | null;
}

export interface MatchedPuja extends Puja {
  score: number;
  matchReasons: string[];
}

const DOSHA_KEYS: Record<string, string> = {
  mangal: 'mangalDosha',
  kaalsarp: 'kaalSarpDosha',
  sadesati: 'sadeSati',
  pitra: 'pitraDosha',
  kemdruma: 'kemDrumaDosha',
  grahan: 'grahanDosha',
  guruchandal: 'guruChandalDosha',
};

const DOSHA_LABELS: Record<string, string> = {
  mangal: 'Mangal Dosha',
  kaalsarp: 'Kaal Sarp Dosha',
  sadesati: 'Sade Sati',
  pitra: 'Pitra Dosha',
  kemdruma: 'Kemdruma Dosha',
  grahan: 'Grahan Dosha',
  guruchandal: 'Guru Chandal Dosha',
};

export function scorePujas(
  pujas: Puja[],
  doshaData: Record<string, { present?: boolean; isPresent?: boolean; severity?: string; phase?: string }> | null,
  dashaData: { currentMahadasha?: { planet: string }; currentAntardasha?: { planet: string } } | null,
  shadbala: Record<string, { totalVirupas?: number }> | null,
  intentFilter: string | null,
): MatchedPuja[] {
  const mahaDasha = dashaData?.currentMahadasha?.planet?.toLowerCase() ?? null;
  const antarDasha = dashaData?.currentAntardasha?.planet?.toLowerCase() ?? null;

  // Weakest planet by totalVirupas
  let weakestPlanet: string | null = null;
  if (shadbala) {
    const entries = Object.entries(shadbala)
      .map(([planet, data]) => ({ planet: planet.toLowerCase(), virupas: data.totalVirupas ?? 9999 }))
      .filter(e => e.virupas < 9999);
    if (entries.length > 0) {
      weakestPlanet = entries.sort((a, b) => a.virupas - b.virupas)[0].planet;
    }
  }

  return pujas
    .filter(p => !intentFilter || intentFilter === 'all' || p.intent_tags.includes(intentFilter))
    .map(puja => {
      let score = puja.base_priority;
      const reasons: string[] = [];

      // Dosha boost
      if (puja.primary_dosha && doshaData) {
        const dbKey = DOSHA_KEYS[puja.primary_dosha];
        const dosha = dbKey ? doshaData[dbKey] : null;
        const isPresent = dosha?.present ?? dosha?.isPresent ?? false;
        if (isPresent) {
          const severity = dosha?.severity ?? 'mild';
          const seriousSadeSati = puja.primary_dosha === 'sadesati' && dosha?.phase === 'peak';
          const boost = severity === 'severe' || seriousSadeSati ? 50 : severity === 'moderate' ? 30 : 15;
          score += boost;
          reasons.push(DOSHA_LABELS[puja.primary_dosha] ?? puja.primary_dosha);
        }
      }

      // Dasha boost
      if (puja.primary_planet) {
        const planet = puja.primary_planet.toLowerCase();
        if (mahaDasha === planet) {
          score += 30;
          reasons.push(`${puja.primary_planet.charAt(0).toUpperCase() + puja.primary_planet.slice(1)} Mahadasha`);
        } else if (antarDasha === planet) {
          score += 15;
          reasons.push(`${puja.primary_planet.charAt(0).toUpperCase() + puja.primary_planet.slice(1)} Antardasha`);
        }
      }

      // Weak planet boost
      if (puja.primary_planet && weakestPlanet === puja.primary_planet.toLowerCase()) {
        score += 15;
        reasons.push(`Weak ${puja.primary_planet.charAt(0).toUpperCase() + puja.primary_planet.slice(1)} in chart`);
      }

      return { ...puja, score: Math.min(100, score), matchReasons: reasons };
    })
    .sort((a, b) => b.score - a.score);
}
