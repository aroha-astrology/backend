import { FRIENDS, ENEMIES, OWN_SIGNS } from '../astro-tools/transit.js';
import { findFavorableWindow } from '../dasha-window.js';
import { buildYoginiAntardashas } from './dashas/yogini.js';
import { YOGINI_PLANETS } from '@aroha-astrology/shared';

export type Domain = 'career' | 'love' | 'health';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ConfidenceScore {
  level: ConfidenceLevel;
  reasoning: string[];
  windowStartDate?: string;
  windowEndDate?: string;
}

function getRelationship(planetA: string, planetB: string): 'friend' | 'enemy' | 'neutral' {
  const planetBOwnSigns = OWN_SIGNS[planetB] ?? [];
  const aFriends = FRIENDS[planetA] ?? [];
  const aEnemies = ENEMIES[planetA] ?? [];

  let isFriend = false;
  let isEnemy = false;

  for (const sign of planetBOwnSigns) {
    if (aFriends.includes(sign)) isFriend = true;
    if (aEnemies.includes(sign)) isEnemy = true;
  }

  // If mixed or neither, considered neutral. In basic Naisargika Maitri, they are usually strictly one of the three.
  if (isFriend && !isEnemy) return 'friend';
  if (isEnemy && !isFriend) return 'enemy';
  return 'neutral';
}

export function scoreDomainWindow(
  domain: Domain,
  significatorLords: string[],
  domainNatalHouses: number[],
  dasha: Record<string, unknown> | null,
  ascSignIndex: number | null,
  now: Date,
  transits: { saturnSignIndex: number | null; jupiterSignIndex: number | null },
): ConfidenceScore {
  const reasons: string[] = [];
  let score = 0;

  // 1. Vimshottari Anchor
  const window = findFavorableWindow(dasha, significatorLords, now);
  if (!window) {
    return {
      level: 'LOW',
      reasoning: ['No favorable Vimshottari window found in the near future.'],
    };
  }

  score += 1;
  reasons.push(
    `Vimshottari anchor: ${window.lord} ${window.level} (within ${window.withinMahadasha} major period).`,
  );

  const windowStart = new Date(window.startDate);

  // 2. Yogini Alignment
  let yoginiAligned = 0;
  const y = (dasha?.yogini ?? {}) as Record<string, unknown>;
  const yoginis = (y.yoginis ?? []) as any[];
  const activeMaha = yoginis.find(
    (m) =>
      new Date(m.startDate).getTime() <= windowStart.getTime() &&
      new Date(m.endDate).getTime() > windowStart.getTime(),
  );

  if (activeMaha) {
    const startYoginiIdx = YOGINI_PLANETS.indexOf(activeMaha.planet);
    const durationYears =
      (new Date(activeMaha.endDate).getTime() - new Date(activeMaha.startDate).getTime()) /
      (365.25 * 86_400_000);
    const antardashas = buildYoginiAntardashas(
      startYoginiIdx,
      new Date(activeMaha.startDate),
      durationYears,
      windowStart,
    );
    const activeAntar = antardashas.find(
      (a) =>
        new Date(a.startDate).getTime() <= windowStart.getTime() &&
        new Date(a.endDate).getTime() > windowStart.getTime(),
    );

    const yoginiLord = activeAntar ? activeAntar.planet : activeMaha.planet;
    const deity = activeAntar ? activeAntar.deity : activeMaha.deity;

    if (significatorLords.includes(yoginiLord)) {
      yoginiAligned = 1;
      reasons.push(
        `Yogini alignment: ${deity} period lord (${yoginiLord}) is a primary significator.`,
      );
    } else {
      const rel = getRelationship(yoginiLord, window.lord);
      if (rel === 'friend') {
        yoginiAligned = 1;
        reasons.push(
          `Yogini alignment: ${deity} period lord (${yoginiLord}) is a friend to Vimshottari lord ${window.lord}.`,
        );
      } else if (rel === 'enemy') {
        reasons.push(
          `Yogini alignment: ${deity} period lord (${yoginiLord}) is an enemy to Vimshottari lord ${window.lord}.`,
        );
      } else {
        reasons.push(
          `Yogini alignment: ${deity} period lord (${yoginiLord}) is neutral to Vimshottari lord ${window.lord}.`,
        );
      }
    }
  } else {
    reasons.push('Yogini alignment: Could not determine active Yogini period.');
  }

  // 3. Transit Gating
  let transitAligned = 0;
  if (ascSignIndex != null) {
    if (domain === 'career' && transits.saturnSignIndex != null) {
      const houseFromAsc = ((transits.saturnSignIndex - ascSignIndex + 12) % 12) + 1;
      if (domainNatalHouses.includes(houseFromAsc) || [10, 11].includes(houseFromAsc)) {
        transitAligned = 1;
        reasons.push(`Saturn transit triggers relevant houses (${houseFromAsc}).`);
      } else {
        reasons.push(
          `Saturn transit (house ${houseFromAsc}) does not strongly trigger career houses.`,
        );
      }
    } else if (domain === 'love' && transits.jupiterSignIndex != null) {
      const houseFromAsc = ((transits.jupiterSignIndex - ascSignIndex + 12) % 12) + 1;
      if (domainNatalHouses.includes(houseFromAsc) || [2, 5, 7, 9, 11].includes(houseFromAsc)) {
        transitAligned = 1;
        reasons.push(`Jupiter transit triggers relevant houses (${houseFromAsc}).`);
      } else {
        reasons.push(
          `Jupiter transit (house ${houseFromAsc}) does not strongly trigger relationship houses.`,
        );
      }
    } else if (domain === 'health' && transits.saturnSignIndex != null) {
      const houseFromAsc = ((transits.saturnSignIndex - ascSignIndex + 12) % 12) + 1;
      if (domainNatalHouses.includes(houseFromAsc) || [6, 8, 12].includes(houseFromAsc)) {
        transitAligned = 1;
        reasons.push(`Saturn transit triggers relevant health houses (${houseFromAsc}).`);
      } else {
        reasons.push(
          `Saturn transit (house ${houseFromAsc}) does not strongly trigger health houses.`,
        );
      }
    }
  }

  score += yoginiAligned + transitAligned;

  const level: ConfidenceLevel = score >= 3 ? 'HIGH' : score === 2 ? 'MEDIUM' : 'LOW';
  return {
    level,
    reasoning: reasons,
    windowStartDate: window.startDate,
    windowEndDate: window.endDate,
  };
}
