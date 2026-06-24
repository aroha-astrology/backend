import type { PlanetShadbala } from '@aroha-astrology/shared';

export type GunaAxisKey =
  | 'communication'
  | 'analytical'
  | 'emotion'
  | 'drive'
  | 'creative'
  | 'leadership'
  | 'loyalty';

export type GunaAxes = Record<GunaAxisKey, number>;

// Loyalty draws from Saturn (commitment, perseverance), Jupiter (dharma, faith),
// and Moon (emotional bond) — the three classical karakas of steadfastness.
const AXIS_WEIGHTS: Record<GunaAxisKey, Partial<Record<string, number>>> = {
  leadership:    { Sun: 0.6, Mars: 0.4 },
  communication: { Mercury: 0.8, Moon: 0.2 },
  analytical:    { Mercury: 0.6, Saturn: 0.4 },
  emotion:       { Moon: 0.7, Venus: 0.3 },
  drive:         { Mars: 0.7, Sun: 0.3 },
  creative:      { Venus: 0.6, Jupiter: 0.4 },
  loyalty:       { Saturn: 0.5, Jupiter: 0.3, Moon: 0.2 },
};

export const GUNA_AXIS_LABELS: Record<GunaAxisKey, string> = {
  leadership:    'Leadership',
  communication: 'Communication',
  analytical:    'Analytical',
  emotion:       'Emotion',
  drive:         'Drive',
  creative:      'Creative',
  loyalty:       'Loyalty',
};

// Short labels for the radar chart axis ticks — keeps long words from being
// clipped on narrow viewports while the cards below show the full names.
export const GUNA_AXIS_SHORT_LABELS: Record<GunaAxisKey, string> = {
  leadership:    'Lead',
  communication: 'Comms',
  analytical:    'Analyt.',
  emotion:       'Emotion',
  drive:         'Drive',
  creative:      'Creati.',
  loyalty:       'Loyal',
};

export const GUNA_AXIS_DESCRIPTIONS: Record<GunaAxisKey, string> = {
  leadership:    'Confidence, courage, taking initiative.',
  communication: 'Clear thinking, expressing yourself, listening.',
  analytical:    'Logic, focus, working through detail.',
  emotion:       'Empathy, warmth, emotional steadiness.',
  drive:         'Energy, ambition, follow-through.',
  creative:      'Imagination, aesthetic sense, openness.',
  loyalty:       'Steadfastness, devotion, keeping commitments.',
};

// requiredVirupas is the *minimum* threshold — treat it as the full 100-point mark
// so a planet at exactly minimum strength scores 100. Anything above is clamped.
// A planet at 0.5× required scores 50; at 0.25× required scores 25.
function planetScore(p: PlanetShadbala): number {
  if (!p.requiredVirupas) return 0;
  return Math.max(0, Math.min(100, (p.totalVirupas / p.requiredVirupas) * 100));
}

export function mapShadbalaToAxes(shadbala: PlanetShadbala[]): GunaAxes {
  const byPlanet = new Map<string, PlanetShadbala>();
  for (const p of shadbala) byPlanet.set(p.planet, p);

  const axes = {} as GunaAxes;
  for (const key of Object.keys(AXIS_WEIGHTS) as GunaAxisKey[]) {
    const weights = AXIS_WEIGHTS[key];
    let totalWeight = 0;
    let weighted = 0;
    for (const [planet, w] of Object.entries(weights)) {
      const data = byPlanet.get(planet);
      if (!data || w === undefined) continue;
      weighted += planetScore(data) * w;
      totalWeight += w;
    }
    axes[key] = totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;
  }
  return axes;
}

export const GUNA_AXIS_ORDER: GunaAxisKey[] = [
  'leadership',
  'communication',
  'analytical',
  'emotion',
  'drive',
  'creative',
  'loyalty',
];
