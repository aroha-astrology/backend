// Deterministic Vastu rules engine (server copy).
// Kept in sync with the frontend copy at frontend `lib/vastu/rules.ts` — both
// are small, stable, and framework-free. The frontend runs this for the live
// on-canvas rating; the backend runs it to seed the AI analysis context and to
// store the authoritative overall score.

export interface VastuRule {
  room: string;
  idealDirections: string[];
  acceptableDirections: string[];
  avoidDirections: string[];
  weight: number;
  reason: string;
}

export const VASTU_RULES: VastuRule[] = [
  {
    room: 'kitchen',
    idealDirections: ['SE'],
    acceptableDirections: ['NW', 'E'],
    avoidDirections: ['NE', 'SW', 'N'],
    weight: 9,
    reason: 'Agni (fire) element resides in SE. Kitchen here promotes health and prosperity.',
  },
  {
    room: 'master_bed',
    idealDirections: ['SW'],
    acceptableDirections: ['S', 'W'],
    avoidDirections: ['NE', 'SE', 'N'],
    weight: 9,
    reason: 'SW provides stability, grounding, and authority to the head of household.',
  },
  {
    room: 'bed_2',
    idealDirections: ['NW', 'W'],
    acceptableDirections: ['S', 'N'],
    avoidDirections: ['NE', 'SE'],
    weight: 6,
    reason:
      'Secondary bedrooms in NW/W support restful sleep without competing with the master bedroom energy in SW.',
  },
  {
    room: 'puja_room',
    idealDirections: ['NE'],
    acceptableDirections: ['E', 'N'],
    avoidDirections: ['S', 'SW', 'SE'],
    weight: 10,
    reason: 'NE (Ishaan) is the direction of divine energy and spiritual upliftment.',
  },
  {
    room: 'living',
    idealDirections: ['N', 'NE'],
    acceptableDirections: ['E', 'NW'],
    avoidDirections: ['SW', 'SE'],
    weight: 7,
    reason: 'North and NE attract positive energy, wealth, and social harmony.',
  },
  {
    room: 'entrance',
    idealDirections: ['N', 'NE', 'E'],
    acceptableDirections: ['NW'],
    avoidDirections: ['S', 'SW', 'SE', 'W'],
    weight: 10,
    reason: 'Entrance in N/NE/E allows maximum positive prana to enter the house.',
  },
  {
    room: 'bathroom',
    idealDirections: ['NW'],
    acceptableDirections: ['W', 'N'],
    avoidDirections: ['NE', 'E', 'SE', 'SW'],
    weight: 7,
    reason: 'NW (Vayu) helps drain negative energy. Bathroom in NE destroys positive energy.',
  },
  {
    room: 'store',
    idealDirections: ['SW'],
    acceptableDirections: ['S', 'W', 'NW'],
    avoidDirections: ['NE', 'E'],
    weight: 5,
    reason: 'SW is ideal for storage as it represents earth element and stability.',
  },
  {
    room: 'kids_room',
    idealDirections: ['W', 'NW'],
    acceptableDirections: ['N', 'E'],
    avoidDirections: ['SW', 'SE'],
    weight: 7,
    reason: 'West and NW promote creativity and growth for children.',
  },
  {
    room: 'dining',
    idealDirections: ['W', 'E'],
    acceptableDirections: ['N', 'NW'],
    avoidDirections: ['S', 'SE'],
    weight: 6,
    reason: 'West and East promote healthy digestion and family bonding during meals.',
  },
  {
    room: 'parking',
    idealDirections: ['NW', 'SE'],
    acceptableDirections: ['W', 'S'],
    avoidDirections: ['NE', 'E'],
    weight: 4,
    reason:
      'NW (Vayu/movement) is ideal for vehicles. NE parking blocks the most sacred energy zone.',
  },
  {
    room: 'stairs',
    idealDirections: ['S', 'SW', 'W'],
    acceptableDirections: ['SE'],
    avoidDirections: ['NE', 'N', 'E'],
    weight: 6,
    reason:
      'Stairs in SW/S keep grounding stable. NE stairs cut through the most sacred zone and drain household energy.',
  },
  {
    room: 'balcony',
    idealDirections: ['N', 'NE', 'E'],
    acceptableDirections: ['NW'],
    avoidDirections: ['SW', 'S'],
    weight: 4,
    reason: 'Open spaces in N/NE/E let morning light and prana flow through the home.',
  },
  {
    room: 'water_tank',
    idealDirections: ['NE', 'N'],
    acceptableDirections: ['E', 'NW'],
    avoidDirections: ['SE', 'S', 'SW'],
    weight: 6,
    reason:
      'Water in NE supports prosperity and health. Water in SE clashes with the fire element and causes friction.',
  },
];

export interface RoomScore {
  room: string;
  currentDirection: string;
  idealDirections: string[];
  score: number;
  status: 'ideal' | 'acceptable' | 'poor' | 'harmful';
  suggestion: string;
  reason: string;
}

export function evaluateRoomPlacement(roomLayout: Record<string, string[]>): {
  roomScores: RoomScore[];
  overallScore: number;
} {
  const roomScores: RoomScore[] = [];
  let totalWeight = 0;
  let totalWeightedScore = 0;

  for (const rule of VASTU_RULES) {
    const directions = roomLayout[rule.room];
    if (!directions || directions.length === 0) continue;

    for (const direction of directions) {
      const upperDir = direction.toUpperCase();
      let score: number;
      let status: RoomScore['status'];
      let suggestion: string;

      if (rule.idealDirections.includes(upperDir)) {
        score = 100;
        status = 'ideal';
        suggestion = `Excellent placement! ${rule.room} in ${upperDir} is perfectly aligned with Vastu principles.`;
      } else if (rule.acceptableDirections.includes(upperDir)) {
        score = 65;
        status = 'acceptable';
        suggestion = `Acceptable placement. Ideally, ${rule.room} should be in ${rule.idealDirections.join(' or ')}.`;
      } else if (rule.avoidDirections.includes(upperDir)) {
        score = 15;
        status = 'harmful';
        suggestion = `Vastu defect! ${rule.room} in ${upperDir} is harmful. Move to ${rule.idealDirections.join(' or ')} if possible. Apply remedies if not.`;
      } else {
        score = 45;
        status = 'poor';
        suggestion = `Not ideal. ${rule.room} should ideally be in ${rule.idealDirections.join(' or ')}.`;
      }

      roomScores.push({
        room: rule.room,
        currentDirection: upperDir,
        idealDirections: rule.idealDirections,
        score,
        status,
        suggestion,
        reason: rule.reason,
      });

      totalWeight += rule.weight;
      totalWeightedScore += score * rule.weight;
    }
  }

  const overallScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 50;
  return { roomScores, overallScore };
}

// =============================================================================
// Astro-Vastu Directional Sensitivity & Vakri Planetary Integration
// =============================================================================

export const PLANETARY_DIRECTIONS: Record<
  string,
  { direction: string; deity: string; element: string }
> = {
  Sun: { direction: 'E', deity: 'Surya / Indra', element: 'Fire / Light' },
  Moon: { direction: 'NW', deity: 'Chandra / Vayu', element: 'Air / Mind' },
  Mars: { direction: 'S', deity: 'Mangala / Yama', element: 'Fire / Vitality' },
  Mercury: { direction: 'N', deity: 'Budha / Kubera', element: 'Earth / Commerce' },
  Jupiter: { direction: 'NE', deity: 'Guru / Ishaan', element: 'Water / Ether / Wisdom' },
  Venus: { direction: 'SE', deity: 'Shukra / Agni', element: 'Fire / Comfort' },
  Saturn: { direction: 'W', deity: 'Shani / Varuna', element: 'Air / Structure' },
  Rahu: { direction: 'SW', deity: 'Rahu / Nirruti', element: 'Earth / Stability' },
  Ketu: { direction: 'NE', deity: 'Ketu / Moksha', element: 'Ether / Spirituality' },
};

export interface AstroVastuVakriInsight {
  planet: string;
  direction: string;
  element: string;
  zoneSignificance: string;
  recommendation: string;
}

export function evaluateAstroVastuVakri(
  vakriPlanets: Array<{ planet: string; house?: number; sign?: string }>,
): AstroVastuVakriInsight[] {
  const insights: AstroVastuVakriInsight[] = [];

  for (const vp of vakriPlanets) {
    const dirInfo = PLANETARY_DIRECTIONS[vp.planet];
    if (!dirInfo) continue;

    let zoneSignificance = '';
    let recommendation = '';

    switch (vp.planet) {
      case 'Jupiter':
        zoneSignificance = `North-East (Ishaan) is governed by Jupiter. Retrograde Jupiter indicates internalized wisdom and sensitivity to spiritual energy flow.`;
        recommendation = `Keep the North-East zone clutter-free, open, and serene. Place sacred items, water elements, or meditation setups here to harmonize Jupiter's expansive energy.`;
        break;
      case 'Saturn':
        zoneSignificance = `West (Pashchima) is governed by Saturn. Retrograde Saturn intensifies discipline, structural foundations, and endurance.`;
        recommendation = `Ensure the West zone is solid, well-grounded, and free from heavy dampness. Ideal for study areas, solid storage, or dining spaces that promote steady persistence.`;
        break;
      case 'Mars':
        zoneSignificance = `South (Dakshina) is governed by Mars. Retrograde Mars internalizes drive, requiring balanced containment of assertive energy.`;
        recommendation = `Maintain the South zone with clean architectural stability, warm earthy/red tones, and avoid north-facing clutter near this sector.`;
        break;
      case 'Venus':
        zoneSignificance = `South-East (Agneya) is governed by Venus. Retrograde Venus reflects deep re-evaluation of aesthetics, comfort, and financial values.`;
        recommendation = `Harmonize the South-East zone by keeping electrical equipment, kitchen hearth, or creative lighting balanced and beautifully organized.`;
        break;
      case 'Mercury':
        zoneSignificance = `North (Uttara) is governed by Mercury. Retrograde Mercury prompts thorough intellectual analysis and careful commerce evaluation.`;
        recommendation = `Keep the North zone vibrant, well-lit, and unobstructed with green plants or wealth symbols to support non-linear intellectual and commercial clarity.`;
        break;
      default:
        zoneSignificance = `${dirInfo.direction} is governed by ${vp.planet}.`;
        recommendation = `Maintain harmony, cleanliness, and proper elemental balance in the ${dirInfo.direction} zone.`;
    }

    insights.push({
      planet: vp.planet,
      direction: dirInfo.direction,
      element: dirInfo.element,
      zoneSignificance,
      recommendation,
    });
  }

  return insights;
}
