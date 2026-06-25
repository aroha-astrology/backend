// =============================================================================
// Profiler Agent - Ashtakavarga, Yoga, and Dosha detection
// =============================================================================

import { logger } from '../../logger.js';
import { calculateAshtakavarga, detectAllYogas } from '../../astro-engine/index.js';
import { analyzeAllDoshas } from '../../astro-engine/doshas/index.js';
import type { SwarmState, Finding } from '../state.js';

/**
 * Profiler pipeline node: runs Ashtakavarga, yoga detection, and dosha
 * analysis on the computed chart, producing profile findings.
 */
export async function profilerNode(
  state: SwarmState,
): Promise<Partial<SwarmState>> {
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
      // We need Saturn's current transit longitude for Sade Sati.
      // Use the natal Saturn longitude as a fallback (transit data would
      // come from a separate service in production).
      const saturn = chartData.planets.find((p) => p.planet === 'Saturn');
      const saturnLongitude = saturn?.longitude ?? 0;

      const doshas = analyzeAllDoshas(chartData, saturnLongitude);

      // Process each dosha type
      const doshaEntries = Object.entries(doshas) as Array<
        [string, { present: boolean; severity?: string; description?: string; [k: string]: unknown }]
      >;

      for (const [doshaName, doshaResult] of doshaEntries) {
        if (doshaResult.present) {
          findings.push({
            id: `dosha-${doshaName}`,
            kind: 'dosha',
            claim: `${doshaName.charAt(0).toUpperCase() + doshaName.slice(1)} Dosha detected` +
              (doshaResult.severity ? ` (severity: ${doshaResult.severity})` : ''),
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
