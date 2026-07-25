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
  runHouses(
    jd: number,
    lat: number,
    lng: number,
    system: string,
    ayanamsa: string,
  ): Promise<unknown>;
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
