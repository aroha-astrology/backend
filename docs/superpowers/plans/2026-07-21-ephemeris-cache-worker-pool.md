# Ephemeris Cache + Worker Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `swisseph-wasm`'s synchronous ephemeris calls from queueing on each pm2 worker's event loop, without touching any of the ~10 call sites (`kundli.service.ts`, `astro.service.ts`, `chat-grounding.ts`, `daily-synthesis.ts`, `sadeSati.ts`, `astrocartography/index.ts`, etc.) that consume `calculatePlanetPositions`/`calculateHouses`/`calculateAscendant`/`calculateChart`.

**Architecture:** Split `planetPositions.ts` into a `.core.ts` (raw, uncached compute — today's logic, unchanged) and a thin public wrapper that adds (1) an in-process LRU cache with in-flight de-duplication — the same Julian Day + ayanamsa is requested by many concurrent users for "current transit" style calls, so this alone collapses N identical `swe.calc()` calls into 1 — and (2) an **opt-in, env-gated** Node `worker_threads` pool that offloads the actual WASM calc to a background thread so the event loop never blocks on it. The pool defaults to **off** (`EPHEMERIS_WORKER_POOL_SIZE` unset) — this deploy ships the cache live and the worker-pool code built, tested, and dormant, matching the finding's own "not urgent, no action needed now" framing while still giving genuine headroom to flip on later with a one-line env change, no further deploy.

**Tech Stack:** TypeScript, Node 20 `node:worker_threads`, `swisseph-wasm`, Vitest, tsup (multi-entry build).

**Why not fully enable the pool now:** the prod box has 2 vCPUs and pm2 already runs 2 cluster instances; adding worker threads is about un-blocking the event loop for *other* requests during a calc (fixes head-of-line blocking / responsiveness), not adding raw CPU throughput on an already fully-subscribed 2-core box. It's real, tested headroom for when traffic grows — not a capacity increase to flip on blindly today.

---

## File Structure

- `src/lib/astro-engine/calculations/planetPositions.core.ts` — **new.** Today's `planetPositions.ts` content verbatim, minus `calculateChart` (moves out). Exports `getSwe`, `AYANAMSA_MAP`, `dateToJulianDay`, `calculatePlanetPositions`, `calculateHouses`, `calculateAscendant`, `assignPlanetsToHouses`. No behavior change — pure move.
- `src/lib/astro-engine/calculations/planetPositions.ts` — **rewritten.** Public API (same exported names/signatures as today, so every caller is untouched). Wraps the core functions with cache + optional pool dispatch; owns `calculateChart` composition.
- `src/lib/astro-engine/calculations/lru-cache.ts` — **new.** Generic bounded `LruCache<K, V>`.
- `src/lib/astro-engine/calculations/ephemeris-cache.ts` — **new.** `EphemerisCache<V>`: LRU cache + in-flight de-dup for one async compute function.
- `src/lib/astro-engine/calculations/worker-pool.ts` — **new.** Generic `WorkerPool`: round-robin dispatch to N `worker_threads`, crash/respawn handling.
- `src/lib/astro-engine/calculations/ephemeris-worker.ts` — **new.** `worker_threads` entry point; imports `planetPositions.core.ts`, handles `planetPositions`/`houses`/`ascendant` messages.
- `src/lib/astro-engine/calculations/ephemeris-pool.ts` — **new.** Adapter: reads `EPHEMERIS_WORKER_POOL_SIZE`, resolves the worker file for dev (`.ts` via `tsx/esm`) vs. prod (`.js`), exposes `getEphemerisPool()`.
- `tsup.config.ts` — **modified.** Add `ephemeris-worker.ts` as a second build entry.
- `.env.example` — **modified.** Document `EPHEMERIS_WORKER_POOL_SIZE`.
- Tests: `test/lru-cache.spec.ts`, `test/ephemeris-cache.spec.ts`, `test/worker-pool.spec.ts` (new), `test/fixtures/echo-worker.mjs` (new fixture), `test/astro-engine.spec.ts` (extended), `test/ephemeris-pool-integration.spec.ts` (new).

---

### Task 1: Extract core compute functions (pure move, no behavior change)

**Files:**
- Create: `src/lib/astro-engine/calculations/planetPositions.core.ts`
- Modify: `src/lib/astro-engine/calculations/planetPositions.ts` (will be fully replaced in Task 4 — for this task just delete it, Task 4 recreates it)
- Test: `test/astro-engine.spec.ts` (already exists — used to verify parity, not modified this task)

- [ ] **Step 1: Create `planetPositions.core.ts` with the extracted logic**

```typescript
// @ts-nocheck
// =============================================================================
// Planet Position Calculations using Swiss Ephemeris (swisseph-wasm)
// Raw, uncached compute — do not call directly from route/service code.
// Wrapped by planetPositions.ts (cache + optional worker-pool dispatch).
// =============================================================================

import type {
  Planet,
  ZodiacSign,
  Nakshatra,
  Ayanamsa,
  HouseSystem,
  PlanetPosition,
  HouseData,
  AscendantData,
} from '@aroha-astrology/shared';

import {
  ZODIAC_SIGNS,
  NAKSHATRAS,
  NAKSHATRA_LORDS,
  SIGN_LORDS,
  NAKSHATRA_SPAN,
} from '@aroha-astrology/shared';

// =============================================================================
// SwissEph WASM Singleton
// =============================================================================

let sweInstance: any = null;
let initPromise: Promise<void> | null = null;

export async function getSwe() {
  if (sweInstance) return sweInstance;
  if (initPromise) {
    await initPromise;
    return sweInstance;
  }

  initPromise = (async () => {
    const { default: SwissEph } = await import('swisseph-wasm');
    const swe = new SwissEph();
    await swe.initSwissEph();
    sweInstance = swe;
  })();

  await initPromise;
  return sweInstance;
}

// =============================================================================
// Swiss Ephemeris Constants (matching swisseph-wasm constants)
// =============================================================================

const SE_SUN = 0;
const SE_MOON = 1;
const SE_MERCURY = 2;
const SE_VENUS = 3;
const SE_MARS = 4;
const SE_JUPITER = 5;
const SE_SATURN = 6;
const SE_MEAN_NODE = 10; // Rahu (Mean Node)

const SEFLG_SWIEPH = 2;
const SEFLG_SIDEREAL = 65536;
const SEFLG_SPEED = 256;

const SE_SIDM_LAHIRI = 1;
const SE_SIDM_KRISHNAMURTI = 5;
const SE_SIDM_B_V_RAMAN = 3;

// =============================================================================
// Ayanamsa Mapping
// =============================================================================

export const AYANAMSA_MAP: Record<Ayanamsa, number> = {
  lahiri: SE_SIDM_LAHIRI,
  krishnamurti: SE_SIDM_KRISHNAMURTI,
  raman: SE_SIDM_B_V_RAMAN,
};

// Planet list for calculation (Ketu is derived from Rahu)
const PLANET_SE_IDS: { planet: Planet; seId: number }[] = [
  { planet: 'Sun', seId: SE_SUN },
  { planet: 'Moon', seId: SE_MOON },
  { planet: 'Mars', seId: SE_MARS },
  { planet: 'Mercury', seId: SE_MERCURY },
  { planet: 'Jupiter', seId: SE_JUPITER },
  { planet: 'Venus', seId: SE_VENUS },
  { planet: 'Saturn', seId: SE_SATURN },
  { planet: 'Rahu', seId: SE_MEAN_NODE },
];

// =============================================================================
// Helper Functions
// =============================================================================

function normalizeDegree(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

function getSignIndex(longitude: number): number {
  return Math.floor(normalizeDegree(longitude) / 30);
}

function getSignDegree(longitude: number): number {
  return normalizeDegree(longitude) % 30;
}

function getNakshatraInfo(longitude: number): {
  index: number;
  pada: number;
  lord: Planet;
  name: Nakshatra;
} {
  const normalizedLong = normalizeDegree(longitude);
  const nakshatraIndex = Math.floor(normalizedLong / NAKSHATRA_SPAN);
  const clampedIndex = Math.min(nakshatraIndex, 26);
  const positionInNakshatra = normalizedLong - clampedIndex * NAKSHATRA_SPAN;
  const padaSpan = NAKSHATRA_SPAN / 4;
  const pada = Math.min(Math.floor(positionInNakshatra / padaSpan) + 1, 4);

  return {
    index: clampedIndex,
    pada,
    lord: NAKSHATRA_LORDS[clampedIndex],
    name: NAKSHATRAS[clampedIndex],
  };
}

// =============================================================================
// Core Functions
// =============================================================================

export async function dateToJulianDay(
  year: number,
  month: number,
  day: number,
  hour: number,
  min: number,
  timezone: number,
): Promise<number> {
  const swe = await getSwe();
  const utHour = hour + min / 60 - timezone;
  return swe.julday(year, month, day, utHour);
}

export async function calculatePlanetPositions(
  jd: number,
  ayanamsa: Ayanamsa = 'lahiri',
): Promise<PlanetPosition[]> {
  const swe = await getSwe();

  const sidMode = AYANAMSA_MAP[ayanamsa];
  swe.set_sid_mode(sidMode, 0, 0);

  const calcFlags = SEFLG_SWIEPH | SEFLG_SIDEREAL | SEFLG_SPEED;

  const positions: PlanetPosition[] = [];
  let rahuLongitude = 0;
  let rahuLatitude = 0;
  let rahuSpeed = 0;

  for (const { planet, seId } of PLANET_SE_IDS) {
    const result = swe.calc(jd, seId, calcFlags);

    const longitude = normalizeDegree(result.longitude);
    const latitude = result.latitude;
    const speed = result.longitudeSpeed;
    const isRetrograde = speed < 0;

    const signIndex = getSignIndex(longitude);
    const signDegree = getSignDegree(longitude);
    const nakshatraInfo = getNakshatraInfo(longitude);

    if (planet === 'Rahu') {
      rahuLongitude = longitude;
      rahuLatitude = latitude;
      rahuSpeed = speed;
    }

    positions.push({
      planet,
      longitude,
      latitude,
      speed,
      sign: ZODIAC_SIGNS[signIndex],
      signIndex,
      signDegree,
      nakshatra: nakshatraInfo.name,
      nakshatraIndex: nakshatraInfo.index,
      nakshatraPada: nakshatraInfo.pada,
      nakshatraLord: nakshatraInfo.lord,
      isRetrograde,
      house: 0,
    });
  }

  const ketuLongitude = normalizeDegree(rahuLongitude + 180);
  const ketuSignIndex = getSignIndex(ketuLongitude);
  const ketuSignDegree = getSignDegree(ketuLongitude);
  const ketuNakshatraInfo = getNakshatraInfo(ketuLongitude);

  positions.push({
    planet: 'Ketu',
    longitude: ketuLongitude,
    latitude: -rahuLatitude,
    speed: rahuSpeed,
    sign: ZODIAC_SIGNS[ketuSignIndex],
    signIndex: ketuSignIndex,
    signDegree: ketuSignDegree,
    nakshatra: ketuNakshatraInfo.name,
    nakshatraIndex: ketuNakshatraInfo.index,
    nakshatraPada: ketuNakshatraInfo.pada,
    nakshatraLord: ketuNakshatraInfo.lord,
    isRetrograde: true,
    house: 0,
  });

  return positions;
}

export async function calculateHouses(
  jd: number,
  lat: number,
  lng: number,
  system: HouseSystem = 'W',
  ayanamsa: Ayanamsa = 'lahiri',
): Promise<HouseData[]> {
  const swe = await getSwe();

  const sidMode = AYANAMSA_MAP[ayanamsa];
  swe.set_sid_mode(sidMode, 0, 0);

  const result = swe.houses_ex(jd, SEFLG_SIDEREAL, lat, lng, system);
  const siderealAsc = normalizeDegree(result.ascmc[0]);
  const ascSignIndex = getSignIndex(siderealAsc);

  const houses: HouseData[] = [];

  for (let i = 1; i <= 12; i++) {
    let cusp: number;

    if (system === 'W') {
      const houseSignIndex = (ascSignIndex + i - 1) % 12;
      cusp = houseSignIndex * 30;
    } else {
      cusp = normalizeDegree(result.cusps[i]);
    }

    const signIndex = getSignIndex(cusp);

    houses.push({
      house: i,
      cusp,
      sign: ZODIAC_SIGNS[signIndex],
      signIndex,
      lord: SIGN_LORDS[ZODIAC_SIGNS[signIndex] as ZodiacSign],
      planets: [],
    });
  }

  return houses;
}

export async function calculateAscendant(
  jd: number,
  lat: number,
  lng: number,
  ayanamsa: Ayanamsa = 'lahiri',
): Promise<AscendantData> {
  const swe = await getSwe();

  const sidMode = AYANAMSA_MAP[ayanamsa];
  swe.set_sid_mode(sidMode, 0, 0);

  const result = swe.houses_ex(jd, SEFLG_SIDEREAL, lat, lng, 'W');
  const siderealAsc = normalizeDegree(result.ascmc[0]);
  const signIndex = getSignIndex(siderealAsc);
  const signDegree = getSignDegree(siderealAsc);
  const nakshatraInfo = getNakshatraInfo(siderealAsc);

  return {
    sign: ZODIAC_SIGNS[signIndex],
    signIndex,
    degree: signDegree,
    nakshatra: nakshatraInfo.name,
    nakshatraPada: nakshatraInfo.pada,
  };
}

export function assignPlanetsToHouses(planets: PlanetPosition[], houses: HouseData[]): void {
  for (const planet of planets) {
    const lon = normalizeDegree(planet.longitude);
    let assignedHouse = houses[0].house;

    for (let i = 0; i < houses.length; i++) {
      const start = normalizeDegree(houses[i].cusp);
      const end = normalizeDegree(houses[(i + 1) % houses.length].cusp);
      const inHouse = start <= end ? lon >= start && lon < end : lon >= start || lon < end;
      if (inHouse) {
        assignedHouse = houses[i].house;
        break;
      }
    }

    planet.house = assignedHouse;
    houses[assignedHouse - 1].planets.push(planet.planet);
  }
}
```

- [ ] **Step 2: Delete the old `planetPositions.ts`**

It will be recreated as a thin wrapper in Task 4. Deleting it now means the repo won't build until Task 4 — that's expected mid-plan; don't run the full test suite between Step 2 and the end of Task 4.

```bash
rm src/lib/astro-engine/calculations/planetPositions.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/astro-engine/calculations/planetPositions.core.ts
git add -u src/lib/astro-engine/calculations/planetPositions.ts
git commit -m "refactor(astro-engine): extract raw ephemeris compute into planetPositions.core.ts"
```

---

### Task 2: Generic bounded LRU cache

**Files:**
- Create: `src/lib/astro-engine/calculations/lru-cache.ts`
- Test: `test/lru-cache.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { LruCache } from '../src/lib/astro-engine/calculations/lru-cache.js';

describe('LruCache', () => {
  it('returns undefined for a missing key', () => {
    const cache = new LruCache<string, number>(2);
    expect(cache.get('a')).toBeUndefined();
  });

  it('stores and retrieves a value', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.size).toBe(1);
  });

  it('evicts the least-recently-used entry once over capacity', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // capacity 2 -> 'a' should be evicted
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('a get() refreshes recency, protecting the key from eviction', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // 'a' is now most-recently-used
    cache.set('c', 3); // 'b' should be evicted instead of 'a'
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lru-cache.spec.ts`
Expected: FAIL — `Cannot find module '../src/lib/astro-engine/calculations/lru-cache.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// =============================================================================
// Generic bounded LRU cache — Map iteration order tracks recency.
// =============================================================================

export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly maxSize: number) {
    if (maxSize <= 0) {
      throw new Error('LruCache maxSize must be positive');
    }
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    // Re-insert to mark as most-recently-used.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);

    if (this.map.size > this.maxSize) {
      const oldestKey = this.map.keys().next().value as K;
      this.map.delete(oldestKey);
    }
  }

  get size(): number {
    return this.map.size;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lru-cache.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/astro-engine/calculations/lru-cache.ts test/lru-cache.spec.ts
git commit -m "feat(astro-engine): add generic bounded LruCache"
```

---

### Task 3: Ephemeris cache with in-flight de-duplication

**Files:**
- Create: `src/lib/astro-engine/calculations/ephemeris-cache.ts`
- Test: `test/ephemeris-cache.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { EphemerisCache } from '../src/lib/astro-engine/calculations/ephemeris-cache.js';

describe('EphemerisCache', () => {
  it('caches the result of compute() for a given key', async () => {
    const cache = new EphemerisCache<number>(10);
    const compute = vi.fn().mockResolvedValue(42);

    const first = await cache.get('k1', compute);
    const second = await cache.get('k1', compute);

    expect(first).toBe(42);
    expect(second).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('computes independently for different keys', async () => {
    const cache = new EphemerisCache<number>(10);
    const compute = vi.fn().mockImplementation(async () => Math.random());

    const a = await cache.get('k1', compute);
    const b = await cache.get('k2', compute);

    expect(a).not.toBe(b);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('de-duplicates concurrent calls for the same key into one compute() call', async () => {
    const cache = new EphemerisCache<number>(10);
    let resolveCompute!: (v: number) => void;
    const compute = vi.fn().mockImplementation(
      () => new Promise<number>((resolve) => { resolveCompute = resolve; }),
    );

    const p1 = cache.get('k1', compute);
    const p2 = cache.get('k1', compute);
    resolveCompute(7);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(7);
    expect(r2).toBe(7);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('does not cache a rejected compute(), so the next call retries', async () => {
    const cache = new EphemerisCache<number>(10);
    const compute = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(99);

    await expect(cache.get('k1', compute)).rejects.toThrow('boom');
    const result = await cache.get('k1', compute);

    expect(result).toBe(99);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ephemeris-cache.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// =============================================================================
// Async compute cache: LRU-bounded results + in-flight de-duplication.
// Each instance owns one LruCache + one in-flight map — instances for
// different ephemeris functions (planet positions / houses / ascendant)
// must NOT share state, so construct a separate EphemerisCache per function.
// =============================================================================

import { LruCache } from './lru-cache.js';

export class EphemerisCache<V> {
  private readonly cache: LruCache<string, V>;
  private readonly inFlight = new Map<string, Promise<V>>();

  constructor(maxSize: number) {
    this.cache = new LruCache<string, V>(maxSize);
  }

  async get(key: string, compute: () => Promise<V>): Promise<V> {
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = compute()
      .then((result) => {
        this.cache.set(key, result);
        return result;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  get size(): number {
    return this.cache.size;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ephemeris-cache.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/astro-engine/calculations/ephemeris-cache.ts test/ephemeris-cache.spec.ts
git commit -m "feat(astro-engine): add EphemerisCache (LRU + in-flight de-dup)"
```

---

### Task 4: Rewrite the public `planetPositions.ts` wrapper (cache-only for now, no pool yet)

**Files:**
- Create: `src/lib/astro-engine/calculations/planetPositions.ts`
- Test: `test/astro-engine.spec.ts` (existing — must still pass unchanged), extended in Step 4 below

- [ ] **Step 1: Write the new failing/incomplete-behavior test (ayanamsa cache-correctness guard)**

Append to `test/astro-engine.spec.ts` (keep the existing two `describe` blocks as-is):

```typescript
// Guards a subtle correctness hazard introduced by caching: calculateChart's
// final swe.get_ayanamsa(jd) call reads GLOBAL mutable sid_mode state on the
// shared swisseph instance. If planetPositions/houses/ascendant are served
// from cache (skipping the swe.set_sid_mode() call each core function does
// internally), a stale sid_mode from a PRIOR call with a different ayanamsa
// must not leak into this chart's ayanamsaValue.
describe('astro-engine: calculateChart ayanamsa cache correctness', () => {
  it('returns the correct ayanamsaValue per-ayanamsa even when planet/house data is cache-warm', async () => {
    // Warm the cache with 'lahiri' first.
    await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'lahiri', 'W');
    // Same date/time/location, different ayanamsa — must not reuse lahiri's sid_mode.
    const raman = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'raman', 'W');
    // B.V. Raman ayanamsa near 1990 is ~21-22°, distinct from Lahiri's ~23-24°.
    expect(raman.ayanamsaValue).toBeGreaterThan(20);
    expect(raman.ayanamsaValue).toBeLessThan(23);
  }, 20_000);
});
```

Add the missing import at the top of the file:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { calculateAshtakavarga } from '../src/lib/astro-engine/calculations/ashtakavarga.js';
```

(the two named imports already exist — just confirm `calculateChart` is imported; it already was.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/astro-engine.spec.ts`
Expected: FAIL — `planetPositions.ts` doesn't exist yet (deleted in Task 1, Step 2), so the whole file fails to import.

- [ ] **Step 3: Write `planetPositions.ts`**

```typescript
// =============================================================================
// Public ephemeris API — cache + optional worker-pool dispatch.
// Same exported names/signatures as before the refactor: every existing
// caller (kundli.service.ts, astro.service.ts, chat-grounding.ts, etc.)
// keeps working unchanged.
// =============================================================================

import type { Ayanamsa, ChartData, HouseSystem, PlanetPosition, HouseData, AscendantData } from '@aroha-astrology/shared';

import {
  getSwe,
  AYANAMSA_MAP,
  dateToJulianDay,
  calculatePlanetPositions as calculatePlanetPositionsCore,
  calculateHouses as calculateHousesCore,
  calculateAscendant as calculateAscendantCore,
  assignPlanetsToHouses,
} from './planetPositions.core.js';
import { EphemerisCache } from './ephemeris-cache.js';
import { getEphemerisPool } from './ephemeris-pool.js';

export { dateToJulianDay };

const MAX_CACHE_ENTRIES = 2000;

const planetPositionsCache = new EphemerisCache<PlanetPosition[]>(MAX_CACHE_ENTRIES);
const housesCache = new EphemerisCache<HouseData[]>(MAX_CACHE_ENTRIES);
const ascendantCache = new EphemerisCache<AscendantData>(MAX_CACHE_ENTRIES);

export async function calculatePlanetPositions(
  jd: number,
  ayanamsa: Ayanamsa = 'lahiri',
): Promise<PlanetPosition[]> {
  const pool = getEphemerisPool();
  return planetPositionsCache.get(`${jd}|${ayanamsa}`, () =>
    pool.isEnabled()
      ? (pool.runPlanetPositions(jd, ayanamsa) as Promise<PlanetPosition[]>)
      : calculatePlanetPositionsCore(jd, ayanamsa),
  );
}

export async function calculateHouses(
  jd: number,
  lat: number,
  lng: number,
  system: HouseSystem = 'W',
  ayanamsa: Ayanamsa = 'lahiri',
): Promise<HouseData[]> {
  const pool = getEphemerisPool();
  return housesCache.get(`${jd}|${lat}|${lng}|${system}|${ayanamsa}`, () =>
    pool.isEnabled()
      ? (pool.runHouses(jd, lat, lng, system, ayanamsa) as Promise<HouseData[]>)
      : calculateHousesCore(jd, lat, lng, system, ayanamsa),
  );
}

export async function calculateAscendant(
  jd: number,
  lat: number,
  lng: number,
  ayanamsa: Ayanamsa = 'lahiri',
): Promise<AscendantData> {
  const pool = getEphemerisPool();
  return ascendantCache.get(`${jd}|${lat}|${lng}|${ayanamsa}`, () =>
    pool.isEnabled()
      ? (pool.runAscendant(jd, lat, lng, ayanamsa) as Promise<AscendantData>)
      : calculateAscendantCore(jd, lat, lng, ayanamsa),
  );
}

export async function calculateChart(
  year: number,
  month: number,
  day: number,
  hour: number,
  min: number,
  timezone: number,
  lat: number,
  lng: number,
  ayanamsa: Ayanamsa = 'lahiri',
  houseSystem: HouseSystem = 'W',
): Promise<ChartData> {
  const jd = await dateToJulianDay(year, month, day, hour, min, timezone);
  const [planets, houses, ascendant] = await Promise.all([
    calculatePlanetPositions(jd, ayanamsa),
    calculateHouses(jd, lat, lng, houseSystem, ayanamsa),
    calculateAscendant(jd, lat, lng, ayanamsa),
  ]);

  assignPlanetsToHouses(planets, houses);

  // Deliberately re-set sid_mode right before reading it, rather than relying
  // on a set_sid_mode() side effect from one of the three calls above — those
  // may have been cache hits (or pool dispatches) that never touched the
  // main-thread swe instance's sid_mode at all.
  const swe = await getSwe();
  swe.set_sid_mode(AYANAMSA_MAP[ayanamsa], 0, 0);
  const ayanamsaValue = swe.get_ayanamsa(jd);

  return {
    planets,
    houses,
    ascendant,
    ayanamsa,
    ayanamsaValue,
    julianDay: jd,
  };
}
```

- [ ] **Step 4: Create stub `ephemeris-pool.ts` so the file above compiles**

This task doesn't build the real pool yet (Task 7 does) — create a minimal always-disabled stub so `planetPositions.ts` has something to import:

```typescript
// =============================================================================
// STUB — replaced in full by Task 7. Always reports disabled so all traffic
// runs the in-process core path until the real pool lands.
// =============================================================================

export function getEphemerisPool() {
  return {
    isEnabled: () => false,
    runPlanetPositions: (): never => {
      throw new Error('Ephemeris worker pool not yet implemented');
    },
    runHouses: (): never => {
      throw new Error('Ephemeris worker pool not yet implemented');
    },
    runAscendant: (): never => {
      throw new Error('Ephemeris worker pool not yet implemented');
    },
  };
}
```

- [ ] **Step 5: Run the full existing + new astro-engine tests**

Run: `npx vitest run test/astro-engine.spec.ts`
Expected: PASS (4 tests: the 2 original `calculateChart` tests, the ashtakavarga test, plus the new ayanamsa cache-correctness test)

- [ ] **Step 6: Run the FULL test suite to confirm no other caller broke**

Run: `npx vitest run`
Expected: PASS — same pass/fail counts as `git stash`-ing this work and running on unmodified `main` (per [[aroha-perf-hardening-2026-07-21]], this repo has zero CI, so this local full run is the only safety net). If anything besides the astro-engine tests fails, stop and diagnose before continuing — it means some caller depended on `planetPositions.ts` internals beyond the public function signatures.

- [ ] **Step 7: Commit**

```bash
git add src/lib/astro-engine/calculations/planetPositions.ts
git add src/lib/astro-engine/calculations/ephemeris-pool.ts
git add -u test/astro-engine.spec.ts
git commit -m "feat(astro-engine): wrap ephemeris calls with caching (worker pool stubbed off)"
```

---

### Task 5: Generic `WorkerPool`

**Files:**
- Create: `src/lib/astro-engine/calculations/worker-pool.ts`
- Create: `test/fixtures/echo-worker.mjs`
- Test: `test/worker-pool.spec.ts`

- [ ] **Step 1: Create the plain-JS test fixture worker**

Plain `.mjs`, not `.ts` — this fixture must run directly under `node:worker_threads` with zero transpilation, to keep the pool tests independent of the tsx-loader complexity that only the real ephemeris worker needs (Task 7/8).

```javascript
import { parentPort } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('echo-worker.mjs must run inside a worker thread');
}

parentPort.on('message', (msg) => {
  const { id, type, payload } = msg;

  if (type === 'fail') {
    parentPort.postMessage({ id, error: 'intentional failure' });
    return;
  }

  if (type === 'crash') {
    process.exit(1);
  }

  parentPort.postMessage({ id, result: { type, payload } });
});
```

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { WorkerPool } from '../src/lib/astro-engine/calculations/worker-pool.js';

const workerUrl = new URL('./fixtures/echo-worker.mjs', import.meta.url);
void fileURLToPath; // silence unused-import lint if not otherwise used

describe('WorkerPool', () => {
  it('round-trips a task through a single worker', async () => {
    const pool = new WorkerPool({ workerUrl, size: 1 });
    const result = await pool.run<{ type: string; payload: unknown }>('echo', { a: 1 });
    expect(result).toEqual({ type: 'echo', payload: { a: 1 } });
  }, 10_000);

  it('dispatches many concurrent tasks across workers without mixing up results', async () => {
    const pool = new WorkerPool({ workerUrl, size: 3 });
    const tasks = Array.from({ length: 20 }, (_, i) =>
      pool.run<{ type: string; payload: unknown }>('echo', { n: i }),
    );
    const results = await Promise.all(tasks);
    results.forEach((r, i) => expect(r).toEqual({ type: 'echo', payload: { n: i } }));
  }, 10_000);

  it('rejects when the worker reports an error', async () => {
    const pool = new WorkerPool({ workerUrl, size: 1 });
    await expect(pool.run('fail', {})).rejects.toThrow('intentional failure');
  }, 10_000);

  it('respawns after a worker crash and keeps serving new tasks', async () => {
    const pool = new WorkerPool({ workerUrl, size: 1 });
    await expect(pool.run('crash', {})).rejects.toThrow();
    // The pool must have respawned — this should still succeed.
    const result = await pool.run<{ type: string; payload: unknown }>('echo', { ok: true });
    expect(result).toEqual({ type: 'echo', payload: { ok: true } });
  }, 10_000);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/worker-pool.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Write the implementation**

```typescript
// =============================================================================
// Generic worker_threads pool: round-robin dispatch, crash/respawn handling.
// Not specific to ephemeris — kept generic so it's testable without swisseph.
// =============================================================================

import { Worker } from 'node:worker_threads';

export interface WorkerPoolOptions {
  workerUrl: URL;
  size: number;
  execArgv?: string[];
}

interface PendingTask {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

interface WorkerMessage {
  id: number;
  result?: unknown;
  error?: string;
}

class PooledWorker {
  private worker: Worker;
  private readonly pending = new Map<number, PendingTask>();

  constructor(private readonly options: WorkerPoolOptions) {
    this.worker = this.spawn();
  }

  private spawn(): Worker {
    const worker = new Worker(this.options.workerUrl, {
      execArgv: this.options.execArgv ?? [],
    });

    worker.on('message', (msg: WorkerMessage) => {
      const task = this.pending.get(msg.id);
      if (!task) return;
      this.pending.delete(msg.id);
      if (msg.error !== undefined) {
        task.reject(new Error(msg.error));
      } else {
        task.resolve(msg.result);
      }
    });

    worker.on('error', (err) => this.handleFailure(err));
    worker.on('exit', (code) => {
      if (code !== 0) this.handleFailure(new Error(`ephemeris worker exited with code ${code}`));
    });

    return worker;
  }

  private handleFailure(error: unknown): void {
    for (const task of this.pending.values()) {
      task.reject(error);
    }
    this.pending.clear();
    this.worker = this.spawn();
  }

  run<T>(type: string, payload: unknown, id: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject } as PendingTask);
      this.worker.postMessage({ id, type, payload });
    });
  }
}

export class WorkerPool {
  private readonly workers: PooledWorker[];
  private next = 0;
  private nextTaskId = 0;

  constructor(options: WorkerPoolOptions) {
    if (options.size <= 0) {
      throw new Error('WorkerPool size must be positive');
    }
    this.workers = Array.from({ length: options.size }, () => new PooledWorker(options));
  }

  run<T>(type: string, payload: unknown): Promise<T> {
    const worker = this.workers[this.next] as PooledWorker;
    this.next = (this.next + 1) % this.workers.length;
    return worker.run<T>(type, payload, this.nextTaskId++);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/worker-pool.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/astro-engine/calculations/worker-pool.ts test/worker-pool.spec.ts test/fixtures/echo-worker.mjs
git commit -m "feat(astro-engine): add generic WorkerPool over node:worker_threads"
```

---

### Task 6: Ephemeris worker entry point

**Files:**
- Create: `src/lib/astro-engine/calculations/ephemeris-worker.ts`

No standalone unit test for this file — it's a thin message-dispatch shim over already-tested `planetPositions.core.ts`; it's exercised end-to-end by Task 8's integration test.

- [ ] **Step 1: Write the worker entry point**

```typescript
// =============================================================================
// worker_threads entry point. Runs the raw (uncached, unpooled) ephemeris
// compute inside a background thread so it never blocks the main event loop.
// Built as its own tsup entry (see tsup.config.ts) -> dist/ephemeris-worker.js.
// =============================================================================

import { parentPort } from 'node:worker_threads';
import {
  calculatePlanetPositions,
  calculateHouses,
  calculateAscendant,
} from './planetPositions.core.js';

if (!parentPort) {
  throw new Error('ephemeris-worker.ts must be run inside a worker thread');
}

const port = parentPort;

interface EphemerisTaskMessage {
  id: number;
  type: 'planetPositions' | 'houses' | 'ascendant';
  payload: {
    jd: number;
    lat?: number;
    lng?: number;
    system?: string;
    ayanamsa: 'lahiri' | 'krishnamurti' | 'raman';
  };
}

port.on('message', (msg: EphemerisTaskMessage) => {
  const { id, type, payload } = msg;
  handle(type, payload)
    .then((result) => port.postMessage({ id, result }))
    .catch((error: unknown) => {
      port.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    });
});

async function handle(type: EphemerisTaskMessage['type'], payload: EphemerisTaskMessage['payload']) {
  switch (type) {
    case 'planetPositions':
      return calculatePlanetPositions(payload.jd, payload.ayanamsa);
    case 'houses':
      return calculateHouses(
        payload.jd,
        payload.lat as number,
        payload.lng as number,
        (payload.system ?? 'W') as any,
        payload.ayanamsa,
      );
    case 'ascendant':
      return calculateAscendant(payload.jd, payload.lat as number, payload.lng as number, payload.ayanamsa);
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown ephemeris task type: ${String(_exhaustive)}`);
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors attributable to `ephemeris-worker.ts` (the `as any` on `system` mirrors the `@ts-nocheck` looseness already present in `planetPositions.core.ts`'s WASM boundary — acceptable here, not spreading further).

- [ ] **Step 3: Commit**

```bash
git add src/lib/astro-engine/calculations/ephemeris-worker.ts
git commit -m "feat(astro-engine): add ephemeris worker_threads entry point"
```

---

### Task 7: Real `ephemeris-pool.ts` adapter (env-gated, dev/prod aware)

**Files:**
- Modify: `src/lib/astro-engine/calculations/ephemeris-pool.ts` (replace Task 4's stub)

- [ ] **Step 1: Replace the stub with the real adapter**

```typescript
// =============================================================================
// Ephemeris worker-pool adapter. OFF by default — set EPHEMERIS_WORKER_POOL_SIZE
// (a positive integer) to enable. Lazily initialized once per process, mirrors
// planetPositions.core.ts's getSwe() singleton pattern.
//
// Dev/prod worker-file resolution: this module's own import.meta.url tells us
// which mode we're in. In production, tsup bundles everything that imports
// this file into dist/index.js (splitting: false) -- so at runtime
// import.meta.url IS dist/index.js's URL, and './ephemeris-worker.js'
// resolves to the sibling file tsup built from the second entry in
// tsup.config.ts. In dev (`tsx watch src/index.ts`), tsx does NOT bundle --
// each file keeps its own module URL, so import.meta.url here is this file's
// own src/ path, and './ephemeris-worker.ts' resolves to the real TS source.
// The dev worker is spawned with `--import tsx/esm` so IT can load .ts too.
// =============================================================================

import { WorkerPool } from './worker-pool.js';

export interface EphemerisPool {
  isEnabled(): boolean;
  runPlanetPositions(jd: number, ayanamsa: string): Promise<unknown>;
  runHouses(jd: number, lat: number, lng: number, system: string, ayanamsa: string): Promise<unknown>;
  runAscendant(jd: number, lat: number, lng: number, ayanamsa: string): Promise<unknown>;
}

let pool: WorkerPool | null | undefined;

function resolvePoolSize(): number {
  const raw = process.env.EPHEMERIS_WORKER_POOL_SIZE;
  if (!raw) return 0;
  const size = Number.parseInt(raw, 10);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function initPool(): WorkerPool | null {
  const size = resolvePoolSize();
  if (size === 0) return null;

  const isTsSource = import.meta.url.endsWith('.ts');
  const workerUrl = new URL(`./ephemeris-worker${isTsSource ? '.ts' : '.js'}`, import.meta.url);
  const execArgv = isTsSource ? ['--import', 'tsx/esm'] : [];

  return new WorkerPool({ workerUrl, size, execArgv });
}

export function getEphemerisPool(): EphemerisPool {
  if (pool === undefined) {
    pool = initPool();
  }
  const activePool = pool;

  return {
    isEnabled: () => activePool !== null,
    runPlanetPositions: (jd, ayanamsa) => {
      if (!activePool) throw new Error('Ephemeris worker pool is not enabled');
      return activePool.run('planetPositions', { jd, ayanamsa });
    },
    runHouses: (jd, lat, lng, system, ayanamsa) => {
      if (!activePool) throw new Error('Ephemeris worker pool is not enabled');
      return activePool.run('houses', { jd, lat, lng, system, ayanamsa });
    },
    runAscendant: (jd, lat, lng, ayanamsa) => {
      if (!activePool) throw new Error('Ephemeris worker pool is not enabled');
      return activePool.run('ascendant', { jd, lat, lng, ayanamsa });
    },
  };
}
```

- [ ] **Step 2: Update `planetPositions.ts`'s pool casts to match `EphemerisPool`'s real return types**

The three `pool.run*` calls in `planetPositions.ts` (Task 4, Step 3) already cast to the correct concrete types (`Promise<PlanetPosition[]>` etc.) — no change needed there. Just confirm:

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/astro-engine/calculations/ephemeris-pool.ts
git commit -m "feat(astro-engine): implement real env-gated ephemeris worker pool adapter"
```

---

### Task 8: End-to-end integration test proving the pool path actually works

**Files:**
- Create: `test/ephemeris-pool-integration.spec.ts`

This is the highest-risk step in the plan — it's the only place that actually exercises `tsx/esm` spawning the real `.ts` worker. If this test is flaky or fails in ways unrelated to the ephemeris logic itself (e.g., a `tsx/esm` loader resolution issue), that's fine to leave as a follow-up: **the pool ships disabled by default regardless of this test's outcome**, so it does not block Task 9-12 (build/deploy). Do not spend more than one troubleshooting pass on environment issues here before flagging it and moving on with the pool left disabled in prod.

- [ ] **Step 1: Write the test**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ephemeris worker pool (integration)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('EPHEMERIS_WORKER_POOL_SIZE', '2');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('computes the same chart through the pool as the in-process path', async () => {
    const { calculateChart } = await import('../src/lib/astro-engine/calculations/planetPositions.js');
    const chart = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'lahiri', 'W');

    expect(chart.planets).toHaveLength(9);
    for (const p of chart.planets) {
      expect(Number.isFinite(p.longitude)).toBe(true);
      expect(p.house).toBeGreaterThanOrEqual(1);
      expect(p.house).toBeLessThanOrEqual(12);
    }
    expect(chart.ayanamsaValue).toBeGreaterThan(22);
    expect(chart.ayanamsaValue).toBeLessThan(25);
  }, 30_000);
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run test/ephemeris-pool-integration.spec.ts`
Expected: PASS. If it fails on a `tsx/esm` / worker-spawn error (not a data-correctness assertion), note it in the PR description as a known dev-mode limitation, leave `EPHEMERIS_WORKER_POOL_SIZE` undocumented-as-untested-live in `.env.example` (Task 10 still documents it, just add a one-line caveat), and continue — do not block the rest of the plan on it.

- [ ] **Step 3: Commit**

```bash
git add test/ephemeris-pool-integration.spec.ts
git commit -m "test(astro-engine): verify calculateChart through the pool path matches in-process"
```

---

### Task 9: Multi-entry tsup build

**Files:**
- Modify: `tsup.config.ts`

- [ ] **Step 1: Add the worker as a second build entry**

```typescript
import { defineConfig } from 'tsup';
import { resolve } from 'path';

export default defineConfig({
  entry: ['src/index.ts', 'src/lib/astro-engine/calculations/ephemeris-worker.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: false,
  minify: false,
  dts: false,
  external: ['swisseph-wasm'],
  esbuildOptions(options) {
    options.alias = {
      '@aroha-astrology/shared': resolve('src/lib/shared/index.ts'),
    };
  },
});
```

- [ ] **Step 2: Build and verify both output files exist**

Run: `npm run build`
Expected: `dist/index.js` and `dist/ephemeris-worker.js` both exist.

Run: `ls dist/*.js` (or `Get-ChildItem dist/*.js` on Windows) — confirm both files listed.

- [ ] **Step 3: Smoke-test the built output boots**

Run: `node -e "console.log('ok')"` is not useful here — instead confirm the build didn't silently break the main entry:

Run: `node --check dist/index.js && node --check dist/ephemeris-worker.js`
Expected: both exit 0 (valid JS syntax, catches any bundling mistake before deploy).

- [ ] **Step 4: Commit**

```bash
git add tsup.config.ts
git commit -m "build: add ephemeris-worker as a second tsup entry"
```

---

### Task 10: Document the new env var

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add a documented, commented-out entry**

Insert after the `# --- Operations ---` block's last line (`#HOROSCOPE_ACTIVE_WINDOW_DAYS=7`):

```
# --- Ephemeris performance (optional, off by default) ---
# Offloads swisseph-wasm calc()/houses_ex() calls to N background
# worker_threads instead of running them synchronously on the main event
# loop. Only useful once request concurrency is actually queueing on CPU —
# not needed at current traffic. Leave unset to keep everything in-process
# (still cached — see EphemerisCache). If you enable this, pick N with the
# box's core count and pm2 instance count in mind: total OS threads doing
# ephemeris work = (pm2 instances) x N.
#EPHEMERIS_WORKER_POOL_SIZE=1
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: document EPHEMERIS_WORKER_POOL_SIZE"
```

---

### Task 11: Full verification pass

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: same pass count as a clean `main` baseline, plus the new tests from Tasks 2/3/5/8 (astro-engine.spec.ts grew by 1 test in Task 4).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors (warnings pre-existing elsewhere in the repo are not this plan's concern — only check for new errors/warnings in the files this plan touched).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds, `dist/index.js` + `dist/ephemeris-worker.js` present (re-confirms Task 9 after any later edits).

- [ ] **Step 5: Confirm the pool really is off by default**

Run: `EPHEMERIS_WORKER_POOL_SIZE= node -e "import('./dist/ephemeris-pool.js').catch(()=>{})"` is not meaningful against a bundled dist (the pool code is inlined into `dist/index.js`, not a separate module) — instead confirm via the test suite: none of `test/astro-engine.spec.ts`'s pre-existing tests set `EPHEMERIS_WORKER_POOL_SIZE`, so their green pass in Step 1 already proves the default (in-process, cached) path is what's exercised end-to-end.

---

### Task 12: Deploy

Follow the established deploy discipline from [[aroha-backend-architecture]] / [[aroha-perf-hardening-2026-07-21]] — do not skip the staleness check, this has bitten multiple past sessions.

- [ ] **Step 1: Check for drift against origin before pushing**

```bash
git fetch origin
git log HEAD..origin/main --oneline
git log origin/main..HEAD --oneline
```

If `origin/main` has commits not in local history, stop and reconcile (rebase or merge) before pushing — do not force-push.

- [ ] **Step 2: Push** (confirm with the user first per [[feedback-confirm-before-push-to-main]] before this step, even though this session already has approval for the overall task)

```bash
git push origin main
```

- [ ] **Step 3: Check prod staleness before deploying**

```bash
ssh -i "$PEM" ec2-user@13.232.179.137 "cd /home/ec2-user/aroha-backend && git log -1 --oneline"
```

Compare against local `git log -1 --oneline` — do not trust any memory's prior `.deployed-rev` claim (per [[aroha-backend-architecture]], this has been wrong 4+ times).

- [ ] **Step 4: Deploy via git (server git is source of truth per the 2026-07-21 resolution)**

```bash
ssh -i "$PEM" ec2-user@13.232.179.137 "cd /home/ec2-user/aroha-backend && git fetch && git reset --hard origin/main && npm ci && npm run build && pm2 reload aroha-api && pm2 save"
```

`npm ci` needed since this plan doesn't add new production `dependencies` (only uses already-installed `node:worker_threads`, no new package) — but run it anyway per the standard playbook in case prod is stale by more than this plan's commits. No `npm run db:migrate` needed — no schema/migration changes in this plan.

- [ ] **Step 5: Verify**

```bash
curl -s https://api.arohaastrology.in/healthz
curl -s https://api.arohaastrology.in/readyz
```

Expected: both `ok`, and `/healthz`'s `uptimeSeconds` reset (proves a real reload happened, not a no-op).

- [ ] **Step 6: Confirm `EPHEMERIS_WORKER_POOL_SIZE` is NOT set on the live `.env`**

```bash
ssh -i "$PEM" ec2-user@13.232.179.137 "grep -c EPHEMERIS_WORKER_POOL_SIZE /home/ec2-user/aroha-backend/.env || true"
```

Expected: `0` (not present) — confirms the worker pool is dormant in production as designed. This is a deliberate, conservative default; flipping it on is a separate, later decision once traffic actually approaches the ceiling.

- [ ] **Step 7: Smoke-test an authenticated chart-producing endpoint** (proves the cache/wrapper refactor didn't silently break chart generation in prod, not just that the process boots)

Use an existing valid session token if available, or confirm via `/v1/panchang/today` (unauthenticated) returning a real payload, not a 500 — panchang also flows through `astro-engine`'s ephemeris path via `dateToJulianDay`/planet calcs.

```bash
curl -s https://api.arohaastrology.in/v1/panchang/today | head -c 500
```

Expected: real JSON, not a 500 or an empty body.
