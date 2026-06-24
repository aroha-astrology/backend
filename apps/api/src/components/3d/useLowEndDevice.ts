'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true when the device is likely too constrained for WebGL hero scenes
 * (low RAM, few cores, or honoring prefers-reduced-motion). In that case
 * consumers should render an SVG fallback instead of mounting a R3F Canvas.
 */
export function useLowEndDevice(): boolean {
  const [low, setLow] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setLow(true); return; }

    const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
    const mem = nav.deviceMemory ?? 8;
    const cores = nav.hardwareConcurrency ?? 8;

    // Heuristic: <=2GB RAM OR <=2 cores → fall back.
    setLow(mem <= 2 || cores <= 2);
  }, []);

  return low;
}
