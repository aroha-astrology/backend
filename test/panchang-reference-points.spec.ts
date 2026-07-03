import { describe, it, expect } from 'vitest';
import {
  PANCHANG_REFERENCE_POINTS,
  snapToReferencePoint,
} from '../src/lib/astro-tools/panchang-reference-points.js';

describe('snapToReferencePoint', () => {
  it('snaps each reference point exactly to its own key', () => {
    for (const point of PANCHANG_REFERENCE_POINTS) {
      expect(snapToReferencePoint(point.lat, point.lon)).toBe(point.key);
    }
  });

  it('snaps coordinates within tolerance of a reference point', () => {
    const delhi = PANCHANG_REFERENCE_POINTS.find((p) => p.key === 'delhi')!;
    expect(snapToReferencePoint(delhi.lat + 0.01, delhi.lon - 0.01)).toBe('delhi');
  });

  it('returns null for a location nowhere near any reference point', () => {
    expect(snapToReferencePoint(26.18, 91.75)).toBeNull(); // Guwahati
  });
});
