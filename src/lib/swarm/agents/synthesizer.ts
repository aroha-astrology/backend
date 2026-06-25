// =============================================================================
// Synthesizer Agent - Reads metrology, extracts dasha info, produces synthesis
// =============================================================================

import { logger } from '../../logger.js';
import type { SwarmState, Finding } from '../state.js';

// =============================================================================
// Dasha extraction helpers
// =============================================================================

interface DashaPeriod {
  lord: string;
  start: string;
  end: string;
  subPeriods?: DashaPeriod[];
}

function extractCurrentDasha(
  dasha: Record<string, unknown> | undefined,
): { mahadasha?: string; antardasha?: string; pratyantardasha?: string } {
  if (!dasha) return {};

  // The dasha object from Vimshottari has currentMahadasha, currentAntardasha, etc.
  const result: { mahadasha?: string; antardasha?: string; pratyantardasha?: string } = {};

  if (typeof dasha.currentMahadasha === 'object' && dasha.currentMahadasha !== null) {
    const md = dasha.currentMahadasha as Record<string, unknown>;
    const v = md.lord as string | undefined;
    if (v !== undefined) result.mahadasha = v;
  } else if (typeof dasha.currentMahadasha === 'string') {
    result.mahadasha = dasha.currentMahadasha;
  }

  if (typeof dasha.currentAntardasha === 'object' && dasha.currentAntardasha !== null) {
    const ad = dasha.currentAntardasha as Record<string, unknown>;
    const v = ad.lord as string | undefined;
    if (v !== undefined) result.antardasha = v;
  } else if (typeof dasha.currentAntardasha === 'string') {
    result.antardasha = dasha.currentAntardasha;
  }

  if (typeof dasha.currentPratyantardasha === 'object' && dasha.currentPratyantardasha !== null) {
    const pd = dasha.currentPratyantardasha as Record<string, unknown>;
    const v = pd.lord as string | undefined;
    if (v !== undefined) result.pratyantardasha = v;
  } else if (typeof dasha.currentPratyantardasha === 'string') {
    result.pratyantardasha = dasha.currentPratyantardasha;
  }

  return result;
}

// =============================================================================
// Planet summary helpers
// =============================================================================

interface PlanetInfo {
  planet: string;
  sign: string;
  house: number;
  nakshatra?: string;
  isRetrograde?: boolean;
  longitude?: number;
}

function extractPlanetSummary(
  planets: unknown,
): PlanetInfo[] {
  if (!Array.isArray(planets)) return [];
  return planets.map((p: Record<string, unknown>): PlanetInfo => {
    const info: PlanetInfo = {
      planet: p.planet as string,
      sign: p.sign as string,
      house: p.house as number,
    };
    const nak = p.nakshatra as string | undefined;
    if (nak !== undefined) info.nakshatra = nak;
    const retro = p.isRetrograde as boolean | undefined;
    if (retro !== undefined) info.isRetrograde = retro;
    const lon = p.longitude as number | undefined;
    if (lon !== undefined) info.longitude = lon;
    return info;
  });
}

// =============================================================================
// Synthesizer Node
// =============================================================================

/**
 * Synthesizer pipeline node: reads metrology and produces synthesis findings.
 */
export async function synthesizerNode(
  state: SwarmState,
): Promise<Partial<SwarmState>> {
  logger.debug({ requestId: state.requestId }, 'synthesizer: enter');

  if (!state.metrology) {
    return {
      warnings: ['synthesizer: no metrology data available, skipping synthesis'],
    };
  }

  const findings: Finding[] = [];

  try {
    const metrology = state.metrology;
    const dasha = metrology.dasha as Record<string, unknown> | undefined;
    const planets = metrology.planets;
    const chart = metrology.chart as Record<string, unknown> | undefined;

    // Extract current dasha periods
    const currentDasha = extractCurrentDasha(dasha);

    // Planet summary
    const planetSummary = extractPlanetSummary(planets);

    // Dasha finding
    if (currentDasha.mahadasha) {
      findings.push({
        id: 'dasha-current',
        kind: 'dasha',
        claim: `Currently running ${currentDasha.mahadasha} Mahadasha` +
          (currentDasha.antardasha ? ` / ${currentDasha.antardasha} Antardasha` : '') +
          (currentDasha.pratyantardasha ? ` / ${currentDasha.pratyantardasha} Pratyantardasha` : ''),
        evidence: { ...currentDasha },
      });
    }

    // Ascendant finding
    const ascendant = chart?.ascendant as Record<string, unknown> | undefined;
    if (ascendant?.sign) {
      findings.push({
        id: 'ascendant',
        kind: 'chart',
        claim: `Ascendant (Lagna) is in ${ascendant.sign}`,
        evidence: { sign: ascendant.sign, degree: ascendant.degree },
      });
    }

    // Moon sign finding
    const moon = planetSummary.find((p) => p.planet === 'Moon');
    if (moon) {
      findings.push({
        id: 'moon-sign',
        kind: 'chart',
        claim: `Moon is in ${moon.sign}` +
          (moon.nakshatra ? ` (${moon.nakshatra} nakshatra)` : '') +
          ` in house ${moon.house}`,
        evidence: {
          sign: moon.sign,
          house: moon.house,
          nakshatra: moon.nakshatra,
          longitude: moon.longitude,
        },
      });
    }

    // Sun sign finding
    const sun = planetSummary.find((p) => p.planet === 'Sun');
    if (sun) {
      findings.push({
        id: 'sun-sign',
        kind: 'chart',
        claim: `Sun is in ${sun.sign} in house ${sun.house}`,
        evidence: {
          sign: sun.sign,
          house: sun.house,
          nakshatra: sun.nakshatra,
        },
      });
    }

    // Retrograde planets
    const retrogrades = planetSummary.filter((p) => p.isRetrograde);
    if (retrogrades.length > 0) {
      findings.push({
        id: 'retrogrades',
        kind: 'chart',
        claim: `Retrograde planets: ${retrogrades.map((p) => p.planet).join(', ')}`,
        evidence: {
          planets: retrogrades.map((p) => ({
            planet: p.planet,
            sign: p.sign,
            house: p.house,
          })),
        },
      });
    }

    // Build synthesis summary
    const synthesis: Record<string, unknown> = {
      currentDasha,
      ascendant: ascendant ? { sign: ascendant.sign, degree: ascendant.degree } : null,
      moonSign: moon ? { sign: moon.sign, nakshatra: moon.nakshatra, house: moon.house } : null,
      sunSign: sun ? { sign: sun.sign, house: sun.house } : null,
      retrogradeCount: retrogrades.length,
      planetSummary: planetSummary.map((p) => ({
        planet: p.planet,
        sign: p.sign,
        house: p.house,
        retrograde: p.isRetrograde ?? false,
      })),
    };

    return { synthesis, findings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, requestId: state.requestId }, 'synthesizer: failed');
    return {
      errors: [`synthesizer: ${message}`],
      findings,
    };
  }
}
