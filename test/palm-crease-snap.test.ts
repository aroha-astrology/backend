import { describe, it, expect } from 'vitest';
import { snapToCrease, trimUnverifiedEnds } from '../src/lib/palm/crease-snap.js';
import type { SnapImages } from '../src/lib/palm/image-prep.js';

function makeMockImagesWithCrease(): SnapImages {
  const width = 100;
  const height = 100;
  const data = new Uint8ClampedArray(width * height);
  // Default skin: 180
  data.fill(180);

  // Paint a dark horizontal crease at y = 50 (value 120, flanking skin 180 -> depth 60)
  for (let x = 10; x <= 90; x++) {
    data[50 * width + x] = 120;
  }

  return {
    equalised: { data, width, height },
    plain: { data: new Uint8ClampedArray(data), width, height },
  };
}

describe('crease-snap', () => {
  it('returns null on polyline with fewer than 2 points or zero length', () => {
    const images = makeMockImagesWithCrease();
    expect(snapToCrease(images, [])).toBeNull();
    expect(snapToCrease(images, [[0.5, 0.5]])).toBeNull();
  });

  it('snaps onto crease and computes meanValleyDepth and hessianSupport (Step 4A)', () => {
    const images = makeMockImagesWithCrease();
    // Path slightly off the crease at y = 0.51 (crease is at y = 0.50)
    const polyline: Array<[number, number]> = [
      [0.2, 0.51],
      [0.5, 0.51],
      [0.8, 0.51],
    ];

    const res = snapToCrease(images, polyline);
    expect(res).not.toBeNull();
    expect(res!.polyline.length).toBeGreaterThan(0);
    expect(typeof res!.meanValleyDepth).toBe('number');
    expect(typeof res!.hessianSupport).toBe('number');
    expect(res!.support).toBeGreaterThan(0.5);
  });

  it('trimUnverifiedEnds preserves points when length is within limit', () => {
    const pts: Array<[number, number]> = [
      [0.2, 0.5],
      [0.5, 0.5],
      [0.8, 0.5],
    ];
    const trimmed = trimUnverifiedEnds(pts, 100);
    expect(trimmed).toHaveLength(pts.length);
  });
});
