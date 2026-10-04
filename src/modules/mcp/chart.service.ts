import { z } from 'zod';
import type { ChartData, DoshaAnalysis, VimshottariDasha, Yoga } from '@aroha-astrology/shared';
import {
  analyzeAllDoshas,
  calculateChart,
  calculateVimshottariDasha,
  detectAllYogas,
  getCurrentSaturnLongitude,
} from '../../lib/astro-engine/index.js';
import { logger } from '../../lib/logger.js';
import { placeLabel, type BirthMoment } from './birth.js';
import { spaced } from './format.js';

/**
 * The birth chart as the ChatGPT tools return it: the same engine output the
 * app stores (see kundli.service.ts runGeneration), cut down to what a reader
 * needs. No ids, no timestamps, no raw longitudes.
 */

const MAX_YOGAS = 8;
const MAX_TEXT = 400;

const periodSchema = z.object({
  planet: z.string(),
  start: z.string().describe('YYYY-MM-DD'),
  end: z.string().describe('YYYY-MM-DD'),
});

export const birthChartShape = {
  birth: z.object({
    date: z.string(),
    time: z.string().describe('Local time used for the chart, HH:mm'),
    time_known: z
      .boolean()
      .describe('False when no birth time was given and local noon was used instead'),
    place: z.string().describe('The place the birth place was matched to'),
    timezone: z.string(),
  }),
  system: z.string().describe('Zodiac, ayanamsa and house system used'),
  ascendant: z.object({
    sign: z.string(),
    degree: z.number(),
    nakshatra: z.string(),
    pada: z.number(),
  }),
  moon_sign: z.string(),
  sun_sign: z.string(),
  birth_nakshatra: z.string(),
  planets: z.array(
    z.object({
      planet: z.string(),
      sign: z.string(),
      degree: z.number().describe('Degrees within the sign, 0-30'),
      house: z.number().describe('House from the ascendant, 1-12'),
      nakshatra: z.string(),
      pada: z.number(),
      retrograde: z.boolean(),
    }),
  ),
  houses: z.array(
    z.object({
      house: z.number(),
      sign: z.string(),
      lord: z.string(),
      planets: z.array(z.string()),
    }),
  ),
  dasha: z
    .object({
      system: z.string(),
      current_mahadasha: periodSchema,
      current_antardasha: periodSchema,
      mahadashas: z.array(periodSchema),
    })
    .optional(),
  doshas: z.array(
    z.object({
      name: z.string(),
      present: z.boolean(),
      severity: z.string(),
      summary: z.string(),
    }),
  ),
  yogas: z.array(
    z.object({
      name: z.string(),
      kind: z.string(),
      strength: z.number().describe('0-100'),
      summary: z.string(),
    }),
  ),
  caveat: z.string().optional(),
};

export type BirthChart = z.infer<z.ZodObject<typeof birthChartShape>>;

const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const clip = (text: string) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text);
const round2 = (n: number) => Number(n.toFixed(2));

export const UNKNOWN_TIME_CAVEAT =
  'No birth time was given, so the chart is cast for local noon. The ascendant, the houses and anything read from them (including Mangal Dosha from the ascendant) may be wrong. Planet signs are reliable, except the Moon on a day it changes sign.';

function dashaOf(dasha: VimshottariDasha): BirthChart['dasha'] {
  const period = (p: { planet: string; startDate: Date; endDate: Date }) => ({
    planet: p.planet,
    start: day(p.startDate),
    end: day(p.endDate),
  });
  return {
    system: 'Vimshottari',
    current_mahadasha: period(dasha.currentMahadasha),
    current_antardasha: period(dasha.currentAntardasha),
    mahadashas: dasha.mahadashas.map(period),
  };
}

function doshasOf(d: DoshaAnalysis): BirthChart['doshas'] {
  const row = (name: string, present: boolean, severity: string, summary: string) => ({
    name,
    present,
    severity,
    summary: clip(summary),
  });
  return [
    row(
      'Mangal Dosha',
      d.mangal.present && d.mangal.type !== 'cancelled',
      d.mangal.type === 'cancelled' ? 'cancelled' : d.mangal.severity,
      d.mangal.description,
    ),
    row('Kaal Sarp Dosha', d.kaalSarp.present, d.kaalSarp.severity, d.kaalSarp.description),
    row('Sade Sati', d.sadeSati.active, d.sadeSati.active ? d.sadeSati.phase : 'none', d.sadeSati.description),
    row('Pitra Dosha', d.pitra.present, d.pitra.severity, d.pitra.description),
    row('Kemadruma Dosha', d.kemDruma.present, d.kemDruma.severity, d.kemDruma.description),
    row('Grahan Dosha', d.grahan.present, d.grahan.severity, d.grahan.description),
    row('Guru Chandal Dosha', d.guruChandal.present, d.guruChandal.severity, d.guruChandal.description),
  ];
}

function yogasOf(yogas: Yoga[]): BirthChart['yogas'] {
  return yogas
    .filter((y) => y.present && y.type !== 'dosha')
    .sort((a, b) => b.strength - a.strength)
    .slice(0, MAX_YOGAS)
    .map((y) => ({
      name: y.name,
      kind: y.type,
      strength: Math.round(y.strength),
      summary: clip(y.description),
    }));
}

function tryCompute<T>(label: string, fn: () => T): T | null {
  try {
    return fn();
  } catch (err) {
    logger.warn({ err, label }, 'mcp chart: enrichment step failed (skipped)');
    return null;
  }
}

/** Shapes an engine chart plus its enrichments into the tool output. */
export function toBirthChart(parts: {
  birth: Pick<BirthMoment, 'date' | 'time' | 'timeKnown'> & { placeLabel: string; timezone: string };
  chart: ChartData;
  dasha: VimshottariDasha | null;
  doshas: DoshaAnalysis | null;
  yogas: Yoga[] | null;
}): BirthChart {
  const { chart } = parts;
  const moon = chart.planets.find((p) => p.planet === 'Moon');
  const sun = chart.planets.find((p) => p.planet === 'Sun');
  return {
    birth: {
      date: parts.birth.date,
      time: parts.birth.time,
      time_known: parts.birth.timeKnown,
      place: parts.birth.placeLabel,
      timezone: parts.birth.timezone,
    },
    system: 'Vedic (sidereal), Lahiri ayanamsa, whole-sign houses',
    ascendant: {
      sign: chart.ascendant.sign,
      degree: round2(chart.ascendant.degree),
      nakshatra: spaced(chart.ascendant.nakshatra),
      pada: chart.ascendant.nakshatraPada,
    },
    moon_sign: moon?.sign ?? '',
    sun_sign: sun?.sign ?? '',
    birth_nakshatra: spaced(moon?.nakshatra ?? ''),
    planets: chart.planets.map((p) => ({
      planet: p.planet,
      sign: p.sign,
      degree: round2(p.signDegree),
      house: p.house,
      nakshatra: spaced(p.nakshatra),
      pada: p.nakshatraPada,
      retrograde: p.isRetrograde,
    })),
    houses: chart.houses.map((h) => ({
      house: h.house,
      sign: h.sign,
      lord: h.lord,
      planets: [...h.planets],
    })),
    ...(parts.dasha ? { dasha: dashaOf(parts.dasha) } : {}),
    doshas: parts.doshas ? doshasOf(parts.doshas) : [],
    yogas: parts.yogas ? yogasOf(parts.yogas) : [],
    ...(parts.birth.timeKnown ? {} : { caveat: UNKNOWN_TIME_CAVEAT }),
  };
}

export async function computeBirthChart(birth: BirthMoment): Promise<BirthChart> {
  const chart = await calculateChart(
    birth.year,
    birth.month,
    birth.day,
    birth.hour,
    birth.minute,
    birth.tzOffsetHours,
    birth.place.lat,
    birth.place.lon,
    'lahiri',
    'W',
  );

  const moon = chart.planets.find((p) => p.planet === 'Moon');
  const dasha = tryCompute('dasha', () =>
    calculateVimshottariDasha(moon?.longitude ?? 0, birth.instant),
  );

  // Sade Sati needs Saturn's position today, not at birth (see kundli.service.ts).
  let saturnNow = 0;
  try {
    saturnNow = await getCurrentSaturnLongitude();
  } catch (err) {
    logger.warn({ err }, 'mcp chart: live Saturn lookup failed (Sade Sati skipped)');
  }

  return toBirthChart({
    birth: {
      date: birth.date,
      time: birth.time,
      timeKnown: birth.timeKnown,
      placeLabel: placeLabel(birth.place),
      timezone: birth.place.timezone,
    },
    chart,
    dasha,
    doshas: tryCompute('doshas', () => analyzeAllDoshas(chart, saturnNow)),
    yogas: tryCompute('yogas', () => detectAllYogas(chart)),
  });
}

/** One paragraph the model can read at a glance. */
export function chartSummary(c: BirthChart): string {
  const placements = c.planets
    .map((p) => `${p.planet} in ${p.sign} (house ${p.house}${p.retrograde ? ', retrograde' : ''})`)
    .join('; ');
  const dasha = c.dasha
    ? ` Current period: ${c.dasha.current_mahadasha.planet} mahadasha, ${c.dasha.current_antardasha.planet} antardasha (until ${c.dasha.current_antardasha.end}).`
    : '';
  return (
    `Birth chart for ${c.birth.date} ${c.birth.time} at ${c.birth.place}. ` +
    `Ascendant ${c.ascendant.sign}, Moon sign ${c.moon_sign}, birth nakshatra ${c.birth_nakshatra}. ` +
    `${placements}.${dasha}` +
    (c.caveat ? ` Note: ${c.caveat}` : '')
  );
}
