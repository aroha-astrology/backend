/**
 * audit-impact.ts
 *
 * Runs a deterministic set of 300 synthetic births through the calculation
 * engine and prints an impact summary table before any release:
 *   - Planets flipping strong/weak in Shadbala
 *   - Yogas added / removed
 *   - Doshas added / removed
 *   - Ashtakoota matching scores across 300 pairs
 *   - Vimshottari dasha transition timestamps moved
 *
 * Usage:
 *   npx tsx scripts/audit-impact.ts                # Compare against baseline (or generate if missing)
 *   npx tsx scripts/audit-impact.ts --save-baseline  # Overwrite baseline snapshot
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateChart,
  calculateShadbala,
  detectAllYogas,
  analyzeAllDoshas,
  calculateAshtakoota,
  calculateVimshottariDasha,
} from '../src/lib/astro-engine/index.js';
import { dayContextAt, getAstroDay } from '../src/lib/astro-engine/rules/day.js';

import type { ZodiacSign } from '../src/lib/shared/types/astrology.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASELINE_FILE = path.join(__dirname, '..', 'docs', 'engine-audit', 'impact-baseline.json');

// Deterministic Mulberry32 PRNG
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SyntheticBirth {
  id: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  tz: number;
  lat: number;
  lon: number;
}

const CITIES = [
  { lat: 19.076, lon: 72.8777, tz: 5.5 }, // Mumbai
  { lat: 28.6139, lon: 77.209, tz: 5.5 }, // Delhi
  { lat: 13.0827, lon: 80.2707, tz: 5.5 }, // Chennai
  { lat: 12.9716, lon: 77.5946, tz: 5.5 }, // Bangalore
  { lat: 22.5726, lon: 88.3639, tz: 5.5 }, // Kolkata
  { lat: 51.5074, lon: -0.1278, tz: 0.0 }, // London
  { lat: 40.7128, lon: -74.006, tz: -5.0 }, // New York
  { lat: 34.0522, lon: -118.2437, tz: -8.0 }, // Los Angeles
  { lat: 35.6762, lon: 139.6503, tz: 9.0 }, // Tokyo
  { lat: -33.8688, lon: 151.2093, tz: 10.0 }, // Sydney
];

function generate300Births(): SyntheticBirth[] {
  const rng = mulberry32(42108); // Fixed seed
  const births: SyntheticBirth[] = [];

  for (let i = 0; i < 300; i++) {
    const year = 1950 + Math.floor(rng() * 75); // 1950 - 2024
    const month = 1 + Math.floor(rng() * 12);
    const day = 1 + Math.floor(rng() * 28);
    const hour = Math.floor(rng() * 24);
    const minute = Math.floor(rng() * 60);
    const city = CITIES[Math.floor(rng() * CITIES.length)];

    births.push({
      id: i + 1,
      year,
      month,
      day,
      hour,
      minute,
      tz: city.tz,
      lat: city.lat,
      lon: city.lon,
    });
  }

  return births;
}

interface ChartRunResult {
  id: number;
  planetStrength: Record<string, boolean>; // planet -> isStrong
  totalVirupas: Record<string, number>;
  yogasPresent: string[];
  doshas: {
    mangal: boolean;
    kaalSarp: boolean;
    sadeSati: boolean;
    pitra: boolean;
    kemDruma: boolean;
    grahan: boolean;
    guruChandal: boolean;
  };
  dashaFirstEndIso: string;
  activeMahadasha: string;
  moonSign: string;
  nakshatraIndex: number;
}

interface MatchResult {
  pairId: number;
  totalScore: number;
}

interface RunSnapshot {
  engineVersion: string;
  generatedAt: string;
  birthCount: number;
  pairCount: number;
  charts: ChartRunResult[];
  matches: MatchResult[];
}

const NAKSHATRA_SPAN = 360 / 27;

async function runEvaluation(births: SyntheticBirth[]): Promise<RunSnapshot> {
  const charts: ChartRunResult[] = [];
  const matches: MatchResult[] = [];

  // Transit Saturn longitude frozen for consistent dosha/sade-sati evaluation
  const FROZEN_SATURN_TRANSIT = 330.0; // Sidereal Pisces

  for (const b of births) {
    const chart = await calculateChart(
      b.year,
      b.month,
      b.day,
      b.hour,
      b.minute,
      b.tz,
      b.lat,
      b.lon,
      'lahiri',
      'W',
    );
    // As kundli generation does: weekday, hour and day/night from the real
    // sunrise at the birth place (null where the Sun does not rise that day).
    const birthInstant = new Date(
      Date.UTC(b.year, b.month - 1, b.day, b.hour, b.minute) - b.tz * 3_600_000,
    );
    const astroDay = await getAstroDay(birthInstant, b.lat, b.lon, b.tz);
    const shadbala = calculateShadbala(
      chart,
      astroDay ? dayContextAt(astroDay, birthInstant) : null,
    );
    const yogas = detectAllYogas(chart);
    const doshas = analyzeAllDoshas(chart, FROZEN_SATURN_TRANSIT);

    const moonPos = chart.planets.find((p) => p.planet === 'Moon');
    const moonLong = moonPos ? moonPos.longitude : 0;
    const moonSign = moonPos ? moonPos.sign : 'Aries';
    const nakshatraIndex = Math.floor((((moonLong % 360) + 360) % 360) / NAKSHATRA_SPAN);

    const birthDate = new Date(Date.UTC(b.year, b.month - 1, b.day, b.hour, b.minute));
    const dasha = calculateVimshottariDasha(
      moonLong,
      birthDate,
      new Date(birthDate.getTime() + 10 * 365.25 * 86400000),
    );

    const planetStrength: Record<string, boolean> = {};
    const totalVirupas: Record<string, number> = {};
    for (const sb of shadbala) {
      planetStrength[sb.planet] = sb.isStrong;
      totalVirupas[sb.planet] = sb.totalVirupas;
    }

    const yogasPresent = yogas
      .filter((y) => y.present)
      .map((y) => y.name)
      .sort();

    charts.push({
      id: b.id,
      planetStrength,
      totalVirupas,
      yogasPresent,
      doshas: {
        mangal: Boolean(doshas.mangal.present),
        kaalSarp: Boolean(doshas.kaalSarp.present),
        sadeSati: Boolean(doshas.sadeSati.active),
        pitra: Boolean(doshas.pitra.present),
        kemDruma: Boolean(doshas.kemDruma.present),
        grahan: Boolean(doshas.grahan.present),
        guruChandal: Boolean(doshas.guruChandal.present),
      },
      dashaFirstEndIso: dasha.mahadashas[0]?.endDate.toISOString() ?? '',
      activeMahadasha: dasha.currentMahadasha?.planet ?? '',
      moonSign,
      nakshatraIndex,
    });
  }

  // 300 Matching pairs (chart[i] with chart[(i + 1) % 300])
  for (let i = 0; i < charts.length; i++) {
    const boy = charts[i];
    const girl = charts[(i + 1) % charts.length];
    const match = calculateAshtakoota(
      boy.nakshatraIndex,
      girl.nakshatraIndex,
      boy.moonSign as ZodiacSign,
      girl.moonSign as ZodiacSign,
    );
    matches.push({
      pairId: i + 1,
      totalScore: match.totalScore,
    });
  }

  return {
    engineVersion: '2026.08.1',
    generatedAt: new Date().toISOString(),
    birthCount: charts.length,
    pairCount: matches.length,
    charts,
    matches,
  };
}

function compareSnapshots(baseline: RunSnapshot, current: RunSnapshot) {
  console.log('\n======================================================================');
  console.log('             AROHA ENGINE AUDIT — IMPACT ANALYSIS (300 CHARTS)         ');
  console.log('======================================================================\n');
  console.log(`Baseline Generated: ${baseline.generatedAt}`);
  console.log(`Current Generated:  ${current.generatedAt}\n`);

  // 1. Planet Shadbala Strength Flips
  console.log('### 1. Shadbala Strength Flips (Weak <-> Strong)');
  console.log(
    '| Planet | Baseline Strong | Current Strong | Flips (W->S) | Flips (S->W) | Total Flips |',
  );
  console.log('|---|---|---|---|---|---|');

  const planets = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  let totalAllFlips = 0;

  for (const p of planets) {
    let baseStrongCount = 0;
    let currStrongCount = 0;
    let wToS = 0;
    let sToW = 0;

    for (let i = 0; i < baseline.charts.length; i++) {
      const bStrong = baseline.charts[i].planetStrength[p] ?? false;
      const cStrong = current.charts[i].planetStrength[p] ?? false;
      if (bStrong) baseStrongCount++;
      if (cStrong) currStrongCount++;
      if (!bStrong && cStrong) wToS++;
      if (bStrong && !cStrong) sToW++;
    }

    const flips = wToS + sToW;
    totalAllFlips += flips;
    console.log(
      `| ${p.padEnd(7)} | ${String(baseStrongCount).padStart(15)} | ${String(currStrongCount).padStart(14)} | ${String(wToS).padStart(12)} | ${String(sToW).padStart(12)} | ${String(flips).padStart(11)} |`,
    );
  }
  console.log(`Total Shadbala Flips Across All Planets: ${totalAllFlips}\n`);

  // 2. Yoga Changes
  console.log('### 2. Yogas Added / Removed Across 300 Charts');
  const allYogaNames = new Set<string>();
  for (const c of baseline.charts) c.yogasPresent.forEach((y) => allYogaNames.add(y));
  for (const c of current.charts) c.yogasPresent.forEach((y) => allYogaNames.add(y));

  const yogaDiffs: Array<{
    name: string;
    added: number;
    removed: number;
    baseCount: number;
    currCount: number;
  }> = [];

  for (const yName of Array.from(allYogaNames).sort()) {
    let added = 0;
    let removed = 0;
    let baseCount = 0;
    let currCount = 0;

    for (let i = 0; i < baseline.charts.length; i++) {
      const inBase = baseline.charts[i].yogasPresent.includes(yName);
      const inCurr = current.charts[i].yogasPresent.includes(yName);
      if (inBase) baseCount++;
      if (inCurr) currCount++;
      if (!inBase && inCurr) added++;
      if (inBase && !inCurr) removed++;
    }

    if (added > 0 || removed > 0) {
      yogaDiffs.push({ name: yName, added, removed, baseCount, currCount });
    }
  }

  if (yogaDiffs.length === 0) {
    console.log('No yoga changes detected across all 300 charts.\n');
  } else {
    console.log('| Yoga Name | Baseline Count | Current Count | Added | Removed | Net Change |');
    console.log('|---|---|---|---|---|---|');
    for (const d of yogaDiffs) {
      const net = d.currCount - d.baseCount;
      const netStr = net > 0 ? `+${net}` : `${net}`;
      console.log(
        `| ${d.name.padEnd(28)} | ${String(d.baseCount).padStart(14)} | ${String(d.currCount).padStart(13)} | ${String(d.added).padStart(5)} | ${String(d.removed).padStart(7)} | ${netStr.padStart(10)} |`,
      );
    }
    console.log('');
  }

  // 3. Dosha Changes
  console.log('### 3. Doshas Added / Removed Across 300 Charts');
  console.log('| Dosha | Baseline Count | Current Count | Added | Removed | Net Change |');
  console.log('|---|---|---|---|---|---|');
  const doshaKeys = [
    'mangal',
    'kaalSarp',
    'sadeSati',
    'pitra',
    'kemDruma',
    'grahan',
    'guruChandal',
  ] as const;

  for (const dk of doshaKeys) {
    let baseCount = 0;
    let currCount = 0;
    let added = 0;
    let removed = 0;

    for (let i = 0; i < baseline.charts.length; i++) {
      const inBase = baseline.charts[i].doshas[dk];
      const inCurr = current.charts[i].doshas[dk];
      if (inBase) baseCount++;
      if (inCurr) currCount++;
      if (!inBase && inCurr) added++;
      if (inBase && !inCurr) removed++;
    }

    const net = currCount - baseCount;
    const netStr = net > 0 ? `+${net}` : `${net}`;
    console.log(
      `| ${dk.padEnd(12)} | ${String(baseCount).padStart(14)} | ${String(currCount).padStart(13)} | ${String(added).padStart(5)} | ${String(removed).padStart(7)} | ${netStr.padStart(10)} |`,
    );
  }
  console.log('');

  // 4. Ashtakoota Matching Scores
  console.log('### 4. Ashtakoota Matching Score Diffs (300 Pairs)');
  let matchDiffCount = 0;
  let totalDelta = 0;
  let maxAbsDelta = 0;

  for (let i = 0; i < baseline.matches.length; i++) {
    const bScore = baseline.matches[i].totalScore;
    const cScore = current.matches[i].totalScore;
    const delta = cScore - bScore;
    if (delta !== 0) {
      matchDiffCount++;
      totalDelta += delta;
      maxAbsDelta = Math.max(maxAbsDelta, Math.abs(delta));
    }
  }

  console.log(`- Pairs with score change: ${matchDiffCount} / ${baseline.matches.length}`);
  console.log(
    `- Average score delta:     ${matchDiffCount > 0 ? (totalDelta / baseline.matches.length).toFixed(3) : '0.000'} points`,
  );
  console.log(`- Max absolute score delta: ${maxAbsDelta} points\n`);

  // 5. Dasha Dates Shift
  console.log('### 5. Vimshottari First Mahadasha End Date Shift');
  let dashaDateShiftCount = 0;
  let maxDaysShifted = 0;

  for (let i = 0; i < baseline.charts.length; i++) {
    const bDate = new Date(baseline.charts[i].dashaFirstEndIso).getTime();
    const cDate = new Date(current.charts[i].dashaFirstEndIso).getTime();
    const diffMs = Math.abs(cDate - bDate);
    const diffDays = diffMs / 86400000;
    if (diffDays > 0.001) {
      dashaDateShiftCount++;
      maxDaysShifted = Math.max(maxDaysShifted, diffDays);
    }
  }

  console.log(
    `- Charts with first Mahadasha end date shifted: ${dashaDateShiftCount} / ${baseline.charts.length}`,
  );
  console.log(`- Max shift: ${maxDaysShifted.toFixed(2)} days\n`);
  console.log('======================================================================\n');
}

async function main() {
  const args = process.argv.slice(2);
  const saveBaselineArg = args.includes('--save-baseline');

  console.log('Generating 300 synthetic births...');
  const births = generate300Births();

  console.log('Running evaluation across 300 births and 300 pairs...');
  const currentSnapshot = await runEvaluation(births);

  const baselineExists = fs.existsSync(BASELINE_FILE);

  if (saveBaselineArg || !baselineExists) {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(currentSnapshot, null, 2), 'utf-8');
    console.log(`Baseline snapshot saved to: ${BASELINE_FILE}`);
    if (!baselineExists) {
      console.log('Initial baseline established. Summary of baseline metrics:');
      console.log(`- Charts evaluated: ${currentSnapshot.birthCount}`);
      console.log(`- Matching pairs evaluated: ${currentSnapshot.pairCount}`);
    }
    return;
  }

  const baselineSnapshot = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8')) as RunSnapshot;
  compareSnapshots(baselineSnapshot, currentSnapshot);
}

main().catch((err) => {
  console.error('Impact script error:', err);
  process.exit(1);
});
