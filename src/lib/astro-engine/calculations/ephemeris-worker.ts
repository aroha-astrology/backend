// =============================================================================
// worker_threads entry point. Runs the raw (uncached, unpooled) ephemeris
// compute inside a background thread so it never blocks the main event loop.
// Built as its own tsup entry (see tsup.config.ts) -> dist/ephemeris-worker.js.
// =============================================================================

import { parentPort } from 'node:worker_threads';
import type { Ayanamsa, HouseSystem } from '@aroha-astrology/shared';
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
    system?: HouseSystem;
    ayanamsa: Ayanamsa;
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

async function handle(
  type: EphemerisTaskMessage['type'],
  payload: EphemerisTaskMessage['payload'],
) {
  switch (type) {
    case 'planetPositions':
      return calculatePlanetPositions(payload.jd, payload.ayanamsa);
    case 'houses':
      return calculateHouses(
        payload.jd,
        payload.lat as number,
        payload.lng as number,
        payload.system ?? 'W',
        payload.ayanamsa,
      );
    case 'ascendant':
      return calculateAscendant(
        payload.jd,
        payload.lat as number,
        payload.lng as number,
        payload.ayanamsa,
      );
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown ephemeris task type: ${String(_exhaustive)}`);
    }
  }
}
