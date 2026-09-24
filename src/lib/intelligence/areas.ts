import type { Planet } from '@aroha-astrology/shared';

/**
 * The life areas every roadmap feature talks about — Astro Weather's rows,
 * the Timeline's lanes, Ask Aroha's question topics, Decision categories.
 */
export const LIFE_AREAS = [
  'overall',
  'career',
  'relationships',
  'money',
  'health',
  'education',
  'family',
  'business',
  'relocation',
] as const;

export type LifeArea = (typeof LIFE_AREAS)[number];

export interface AreaConfig {
  /** Houses from the Ascendant this area lives in, most important first. */
  houses: number[];
  /** Natural significators (karakas) of the area. */
  karakas: Planet[];
}

/**
 * Classical house/karaka assignments. The first house listed is the area's
 * primary house — its lord's placement is the "lordship" factor in why.ts.
 */
export const AREA_CONFIG: Record<LifeArea, AreaConfig> = {
  overall: { houses: [1, 9, 10], karakas: ['Sun', 'Moon'] },
  career: { houses: [10, 6, 11], karakas: ['Saturn', 'Sun'] },
  relationships: { houses: [7, 5, 11], karakas: ['Venus'] },
  money: { houses: [2, 11, 5], karakas: ['Jupiter'] },
  health: { houses: [1, 6, 8], karakas: ['Sun', 'Moon'] },
  education: { houses: [4, 5, 9], karakas: ['Jupiter', 'Mercury'] },
  family: { houses: [4, 2, 9], karakas: ['Moon'] },
  business: { houses: [7, 10, 3], karakas: ['Mercury'] },
  relocation: { houses: [12, 9, 3], karakas: ['Rahu'] },
};

export function isLifeArea(value: string): value is LifeArea {
  return (LIFE_AREAS as readonly string[]).includes(value);
}
