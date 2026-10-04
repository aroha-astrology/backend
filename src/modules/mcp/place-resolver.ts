import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Turns a typed place ("Pune", "Springfield, IL", "Benares India") into
 * coordinates and an IANA timezone, from the bundled GeoNames list
 * (data/geo/places.tsv, built by scripts/build-geo-places.ts). Nothing leaves
 * the server: the ChatGPT tools must not hand a user's birth place to a
 * third-party geocoder.
 */

export interface ResolvedPlace {
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
}

export type PlaceResolution =
  | { status: 'resolved'; place: ResolvedPlace }
  /** Several places fit (or only near-spellings were found); the caller asks the user to pick. */
  | { status: 'ambiguous'; candidates: ResolvedPlace[] }
  | { status: 'not_found' };

interface PlaceRow extends ResolvedPlace {
  regionKey: string;
  regionCode: string;
  countryKey: string;
  countryCode: string;
  population: number;
}

const MAX_CANDIDATES = 5;
/** A place this many times bigger than the next namesake is taken as the one meant. */
const DOMINANCE_RATIO = 3;
/** Near-spelling search only looks at places at least this big. */
const FUZZY_MIN_POPULATION = 50_000;

/** Common ways people write a country that the list spells differently. */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'US',
  america: 'US',
  'united states of america': 'US',
  uk: 'GB',
  england: 'GB',
  britain: 'GB',
  'great britain': 'GB',
  uae: 'AE',
  bharat: 'IN',
};

/** Indian state short forms people type after a town name. */
const REGION_ALIASES: Record<string, string> = {
  up: 'uttar pradesh',
  mp: 'madhya pradesh',
  ap: 'andhra pradesh',
  hp: 'himachal pradesh',
  tn: 'tamil nadu',
  wb: 'west bengal',
};

/** Lowercase, accents removed, everything but letters and digits turned into single spaces. */
export function normalizePlaceText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

let rows: PlaceRow[] | null = null;
let byName: Map<string, PlaceRow[]> | null = null;

function load(): Map<string, PlaceRow[]> {
  if (byName) return byName;
  const text = readFileSync(join(process.cwd(), 'data', 'geo', 'places.tsv'), 'utf8');
  const loaded: PlaceRow[] = [];
  const index = new Map<string, PlaceRow[]>();

  // A Windows checkout may hand this file back with CRLF line ends.
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const c = line.split('\t');
    const row: PlaceRow = {
      name: c[0]!,
      region: c[3]!,
      regionKey: normalizePlaceText(c[3]!),
      regionCode: c[4]!.toLowerCase(),
      countryCode: c[5]!,
      country: c[6]!,
      countryKey: normalizePlaceText(c[6]!),
      lat: Number(c[7]),
      lon: Number(c[8]),
      timezone: c[9]!,
      population: Number(c[10]) || 0,
    };
    loaded.push(row);
    const keys = new Set([c[0]!, c[1]!, ...(c[2] ? c[2].split('|') : [])].map(normalizePlaceText));
    for (const key of keys) {
      if (!key) continue;
      const list = index.get(key);
      if (list) list.push(row);
      else index.set(key, [row]);
    }
  }

  rows = loaded;
  byName = index;
  return index;
}

function toPublic(row: PlaceRow): ResolvedPlace {
  return {
    name: row.name,
    region: row.region,
    country: row.country,
    lat: row.lat,
    lon: row.lon,
    timezone: row.timezone,
  };
}

/** How well the words after the place name ("maharashtra india", "il") fit this row. */
function qualifierScore(row: PlaceRow, rest: string, restTokens: string[]): number {
  let score = 0;
  const padded = ` ${rest} `;
  if (row.regionKey && padded.includes(` ${row.regionKey} `)) score += 2;
  else if (/^[a-z]+$/.test(row.regionCode) && restTokens.includes(row.regionCode)) score += 2;
  else if (restTokens.some((t) => REGION_ALIASES[t] === row.regionKey)) score += 2;

  if (padded.includes(` ${row.countryKey} `)) score += 1;
  else if (restTokens.includes(row.countryCode.toLowerCase())) score += 1;
  else if (Object.entries(COUNTRY_ALIASES).some(([alias, code]) => code === row.countryCode && padded.includes(` ${alias} `)))
    score += 1;
  return score;
}

function pick(candidates: PlaceRow[], rest: string): PlaceResolution {
  let pool = [...candidates];
  if (rest) {
    const restTokens = rest.split(' ');
    const scored = pool.map((row) => ({ row, score: qualifierScore(row, rest, restTokens) }));
    const best = Math.max(...scored.map((s) => s.score));
    if (best > 0) pool = scored.filter((s) => s.score === best).map((s) => s.row);
  }
  pool.sort((a, b) => b.population - a.population);

  const [first, second] = pool;
  if (!first) return { status: 'not_found' };
  if (!second || first.population >= second.population * DOMINANCE_RATIO) {
    return { status: 'resolved', place: toPublic(first) };
  }
  return { status: 'ambiguous', candidates: pool.slice(0, MAX_CANDIDATES).map(toPublic) };
}

function editDistanceAtMost(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
      curr.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return false;
    prev = curr;
  }
  return prev[b.length]! <= max;
}

/** Larger places whose name is one or two letters off ("Banglore"). Offered as choices, never assumed. */
function nearSpellings(name: string): PlaceRow[] {
  const max = name.length >= 8 ? 2 : 1;
  const found = new Set<PlaceRow>();
  for (const [key, list] of load()) {
    if (key[0] !== name[0] || !editDistanceAtMost(key, name, max)) continue;
    for (const row of list) if (row.population >= FUZZY_MIN_POPULATION) found.add(row);
  }
  return [...found].sort((a, b) => b.population - a.population).slice(0, MAX_CANDIDATES);
}

export function resolvePlace(input: string): PlaceResolution {
  const tokens = normalizePlaceText(input).split(' ').filter(Boolean);
  if (tokens.length === 0) return { status: 'not_found' };
  const index = load();

  // Longest leading run of words that names a place; whatever follows narrows it down.
  for (let k = tokens.length; k >= 1; k--) {
    const candidates = index.get(tokens.slice(0, k).join(' '));
    if (candidates) return pick(candidates, tokens.slice(k).join(' '));
  }

  const near = nearSpellings(tokens[0]!.length >= 4 ? tokens[0]! : tokens.slice(0, 2).join(' '));
  return near.length > 0
    ? { status: 'ambiguous', candidates: near.map(toPublic) }
    : { status: 'not_found' };
}

/** Test hook: how many places are loaded. */
export function placeCount(): number {
  load();
  return rows!.length;
}
