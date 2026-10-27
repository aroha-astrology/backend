// =============================================================================
// Profiler Agent - Ashtakavarga, Yoga, and Dosha detection
// =============================================================================

import { logger } from '../../logger.js';
import { calculateAshtakavarga, detectAllYogas } from '../../astro-engine/index.js';
import { analyzeAllDoshasAt } from '../../astro-engine/doshas/index.js';
import type { SwarmState, Finding } from '../state.js';

/** Names for the doshas whose key does not read as "<Key> Dosha". */
const TRANSIT_DOSHA_LABELS: Record<string, string> = {
  sadeSati: 'Sade Sati',
  dhaiya: 'Shani Dhaiya',
};

/**
 * Profiler pipeline node: runs Ashtakavarga, yoga detection, and dosha
 * analysis on the computed chart, producing profile findings.
 */
export async function profilerNode(state: SwarmState): Promise<Partial<SwarmState>> {
  logger.debug({ requestId: state.requestId }, 'profiler: enter');

  if (!state.metrology) {
    return {
      warnings: ['profiler: no metrology data available, skipping profiling'],
    };
  }

  const findings: Finding[] = [];

  try {
    const metrology = state.metrology;
    const chart = metrology.chart as Record<string, unknown> | undefined;

    if (!chart) {
      return {
        warnings: ['profiler: no chart data in metrology, skipping'],
      };
    }

    // The chart object from calculateChart has: planets, houses, ascendant
    // which maps to ChartData from @aroha-astrology/shared
    const chartData = chart as unknown as import('@aroha-astrology/shared').ChartData;

    // ── Ashtakavarga ──────────────────────────────────────────────────────
    try {
      const ashtakavarga = calculateAshtakavarga(chartData);
      findings.push({
        id: 'ashtakavarga',
        kind: 'strength',
        claim: 'Ashtakavarga strength analysis computed',
        evidence: {
          sarva: ashtakavarga.sarva,
          summary: 'Bindu counts computed for all planets across signs',
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err }, 'profiler: ashtakavarga failed');
      findings.push({
        id: 'ashtakavarga-error',
        kind: 'error',
        claim: `Ashtakavarga computation failed: ${msg}`,
        evidence: {},
      });
    }

    // ── Yoga Detection ────────────────────────────────────────────────────
    try {
      const yogas = detectAllYogas(chartData);
      const presentYogas = yogas.filter((y) => y.present);

      for (const yoga of presentYogas) {
        findings.push({
          id: `yoga-${yoga.name.toLowerCase().replace(/\s+/g, '-')}`,
          kind: 'yoga',
          claim: `${yoga.name} detected (strength: ${yoga.strength})`,
          evidence: {
            name: yoga.name,
            type: yoga.type,
            strength: yoga.strength,
            description: yoga.description,
            planets: yoga.planets,
            houses: yoga.houses,
            activationPeriod: yoga.activationPeriod,
          },
        });
      }

      if (presentYogas.length === 0) {
        findings.push({
          id: 'yoga-none',
          kind: 'yoga',
          claim: 'No significant yogas detected in the chart',
          evidence: { totalChecked: yogas.length },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err }, 'profiler: yoga detection failed');
      findings.push({
        id: 'yoga-error',
        kind: 'error',
        claim: `Yoga detection failed: ${msg}`,
        evidence: {},
      });
    }

    // ── Dosha Analysis ────────────────────────────────────────────────────
    try {
      // Sade Sati and Shani Dhaiya are transit conditions: they are read from
      // where Saturn is today, never from the birth chart's Saturn (which this
      // used before).
      const doshas = await analyzeAllDoshasAt(chartData);

      // Process each dosha type
      const doshaEntries = Object.entries(doshas) as Array<
        [
          string,
          {
            present?: boolean;
            active?: boolean;
            severity?: string;
            description?: string;
            [k: string]: unknown;
          },
        ]
      >;

      for (const [doshaName, doshaResult] of doshaEntries) {
        // The transit two say `active`, the natal ones `present`; reading only
        // `present` dropped a running Sade Sati from every chat.
        if (doshaResult.present || doshaResult.active) {
          const label =
            TRANSIT_DOSHA_LABELS[doshaName] ??
            `${doshaName.charAt(0).toUpperCase() + doshaName.slice(1)} Dosha`;
          findings.push({
            id: `dosha-${doshaName}`,
            kind: 'dosha',
            claim:
              `${label} detected` +
              (doshaResult.severity ? ` (severity: ${doshaResult.severity})` : '') +
              (doshaResult.active && doshaResult.description ? `: ${doshaResult.description}` : ''),
            evidence: { ...doshaResult },
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err }, 'profiler: dosha analysis failed');
      findings.push({
        id: 'dosha-error',
        kind: 'error',
        claim: `Dosha analysis failed: ${msg}`,
        evidence: {},
      });
    }

    return { findings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, requestId: state.requestId }, 'profiler: failed');
    return {
      errors: [`profiler: ${message}`],
      findings,
    };
  }
}
