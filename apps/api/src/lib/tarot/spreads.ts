/**
 * Tarot spread definitions.
 *
 * Each spread has a geometry hint that drives the 3D layout in TarotScene.
 * Position labels are the canonical positions that get attached to each
 * drawn card and used by interpret.ts to frame the per-card meaning.
 */

export type SpreadKey = 'single' | 'three' | 'relationship' | 'horseshoe' | 'celtic_cross';

export type SpreadGeometry = 'single' | 'row' | 'pyramid' | 'arc' | 'cross';

export interface SpreadDef {
  key: SpreadKey;
  label: string;
  description: string;
  cardCount: number;
  positions: string[];
  geometry: SpreadGeometry;
}

export const SPREADS: Record<SpreadKey, SpreadDef> = {
  single: {
    key: 'single',
    label: 'Single Card',
    description: 'A focused insight on one question',
    cardCount: 1,
    positions: ['Significator'],
    geometry: 'single',
  },
  three: {
    key: 'three',
    label: 'Three Card',
    description: 'Past, Present, and Future',
    cardCount: 3,
    positions: ['Past', 'Present', 'Future'],
    geometry: 'row',
  },
  relationship: {
    key: 'relationship',
    label: 'Relationship',
    description: 'How you and the other are meeting — and where it can go',
    cardCount: 6,
    positions: ['You', 'The Other', 'The Connection', 'Strength', 'Challenge', 'Outcome'],
    geometry: 'pyramid',
  },
  horseshoe: {
    key: 'horseshoe',
    label: 'Horseshoe',
    description: 'Seven-card arc — past, present, hidden, obstacle, external, advice, outcome',
    cardCount: 7,
    positions: ['Past', 'Present', 'Hidden', 'Obstacle', 'External', 'Advice', 'Outcome'],
    geometry: 'arc',
  },
  celtic_cross: {
    key: 'celtic_cross',
    label: 'Celtic Cross',
    description: 'A complete ten-card reading',
    cardCount: 10,
    positions: [
      'Present Situation',
      'Challenge',
      'Foundation',
      'Recent Past',
      'Best Outcome',
      'Near Future',
      'Your Attitude',
      'External Influences',
      'Hopes and Fears',
      'Final Outcome',
    ],
    geometry: 'cross',
  },
};

export const SPREAD_KEYS = Object.keys(SPREADS) as SpreadKey[];

export function isSpreadKey(value: unknown): value is SpreadKey {
  return typeof value === 'string' && value in SPREADS;
}
