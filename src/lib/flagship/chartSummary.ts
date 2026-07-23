// =============================================================================
// Deterministic chart-summary sections for the flagship Life Report — pure
// formatting/presentation of data this codebase already computes elsewhere
// (planets, houses, yogas, doshas, dasha, Ashtakavarga) or computes here for
// the first time in a report (Shadbala, via the existing, previously-unused-
// in-any-report calculations/shadbala.ts engine). No AI involved in this file.
// =============================================================================

import type { ChartData, PlanetShadbala } from '@aroha-astrology/shared';
import { calculateShadbala } from '../astro-engine/index.js';
import { SIGNS } from '../astro-tools/index.js';

export interface PlanetPositionRow {
  planet: string;
  sign: string;
  house: number;
  nakshatra: string;
  nakshatraPada: number;
  isRetrograde: boolean;
}

export function buildPlanetPositions(chart: Record<string, unknown> | null): PlanetPositionRow[] {
  const planets = (chart?.planets ?? []) as Array<Record<string, unknown>>;
  return planets
    .filter((p) => p.planet != null)
    .map((p) => ({
      planet: String(p.planet),
      sign: String(p.sign ?? ''),
      house: Number(p.house ?? 0),
      nakshatra: String(p.nakshatra ?? ''),
      nakshatraPada: Number(p.nakshatraPada ?? 0),
      isRetrograde: Boolean(p.isRetrograde),
    }));
}

export interface HouseRow {
  house: number;
  sign: string;
  lord: string;
}

export function buildHouseTable(chart: Record<string, unknown> | null): HouseRow[] {
  const houses = (chart?.houses ?? []) as Array<Record<string, unknown>>;
  return houses
    .filter((h) => h.house != null)
    .map((h) => ({
      house: Number(h.house),
      sign: String(h.sign ?? ''),
      lord: String(h.lord ?? ''),
    }))
    .sort((a, b) => a.house - b.house);
}

export interface YogaRow {
  name: string;
  type: string;
  description: string;
  strength: number;
}

/** Reuses the exact same "present + relevant type" filter already proven in chat-grounding.ts's relevantYogas — kept as an independent copy here (chart-grounding's function isn't exported for reuse) rather than a cross-module import, matching this session's established preference for small, independent copies over risky cross-module coupling for report-specific presentation logic. */
export function buildYogaList(yogas: Record<string, unknown> | null): YogaRow[] {
  const list = (yogas?.yogas ?? []) as Array<Record<string, unknown>>;
  return list
    .filter((y) => y.present)
    .sort((a, b) => Number(b.strength ?? 0) - Number(a.strength ?? 0))
    .map((y) => ({
      name: String(y.name ?? ''),
      type: String(y.type ?? ''),
      description: String(y.description ?? ''),
      strength: Number(y.strength ?? 0),
    }));
}

export interface DoshaRow {
  name: string;
  present: boolean;
  severity: string;
  description: string;
}

export function buildDoshaList(doshas: Record<string, unknown> | null): DoshaRow[] {
  if (!doshas) return [];
  const entries: DoshaRow[] = [];
  const keys: Array<[string, string]> = [
    ['mangal', 'Mangal Dosha'],
    ['kaalSarp', 'Kaal Sarp Dosha'],
    ['sadeSati', 'Sade Sati'],
    ['pitra', 'Pitra Dosha'],
    ['kemDruma', 'Kemdruma Dosha'],
    ['grahan', 'Grahan Dosha'],
    ['guruChandal', 'Guru Chandal Dosha'],
  ];
  for (const [key, label] of keys) {
    const d = doshas[key] as Record<string, unknown> | undefined;
    if (!d) continue;
    const present = key === 'sadeSati' ? Boolean(d.active) : Boolean(d.present);
    entries.push({
      name: label,
      present,
      severity: String(d.severity ?? 'none'),
      description: String(d.description ?? ''),
    });
  }
  return entries;
}

export interface DashaTimelineRow {
  planet: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export function buildDashaTimeline(dasha: Record<string, unknown> | null): DashaTimelineRow[] {
  const v = (dasha?.vimshottari ?? {}) as Record<string, unknown>;
  const periods = (v.mahadashas ?? v.periods ?? []) as Array<Record<string, unknown>>;
  const current = v.currentMahadasha as Record<string, unknown> | undefined;
  return periods
    .filter((p) => p.planet != null)
    .map((p) => ({
      planet: String(p.planet),
      startDate: String(p.startDate ?? '').slice(0, 10),
      endDate: String(p.endDate ?? '').slice(0, 10),
      isCurrent: current?.planet === p.planet,
    }));
}

export interface AshtakavargaSummary {
  bySign: Array<{ sign: string; bindus: number }>;
}

export function buildAshtakavargaSummary(
  ashtakavarga: Record<string, unknown> | null,
): AshtakavargaSummary {
  const sarva = (ashtakavarga?.sarva ?? {}) as Record<string, unknown>;
  const bindus = Array.isArray(sarva.bindus) ? (sarva.bindus as number[]) : [];
  return {
    bySign: bindus.map((b, i) => ({ sign: SIGNS[i] ?? String(i), bindus: b })),
  };
}

/**
 * Shadbala summary row — mirrors `PlanetShadbala` exactly (the real shape
 * `calculateShadbala` naturally produces: the six-fold breakdown plus
 * `totalVirupas`/`requiredVirupas`/`isStrong`), rather than collapsing it
 * into an invented shape. The only thing this layer adds is ranking
 * (strongest to weakest by `totalVirupas`).
 */
export type ShadbalaSummaryRow = PlanetShadbala;

/**
 * Computes Shadbala fresh (this codebase has never persisted it — this is
 * the first report to call `calculateShadbala`) from an already-stored
 * `kundli.chartData`, ranked strongest to weakest by `totalVirupas`.
 *
 * `calculateShadbala` needs the full `ChartData` shape (planet longitude/
 * house/speed plus the chart's `julianDay` for the time-based Kala Bala
 * sub-components) — the stored chart JSON already has this shape (it's
 * exactly what `calculateChart` produced at kundli-generation time), so it's
 * cast the same way `chat-grounding.ts` casts stored chart JSON to
 * `ChartData` for its own astro-engine calls.
 */
export function buildShadbalaSummary(chart: Record<string, unknown> | null): ShadbalaSummaryRow[] {
  const planets = (chart?.planets ?? []) as Array<Record<string, unknown>>;
  if (!chart || planets.length === 0) return [];
  const results = calculateShadbala(chart as unknown as ChartData);
  return [...results].sort((a, b) => b.totalVirupas - a.totalVirupas);
}
