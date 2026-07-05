import { describe, it, expect } from 'vitest';
import { calculateFullPanchang } from '../src/lib/astro-engine/panchang/index';

describe('calculateFullPanchang choghadiya/hora', () => {
  it('splits choghadiya into 8 day + 8 night periods', () => {
    const date = new Date('2026-07-04T12:00:00Z');
    const result = calculateFullPanchang(date, 28.6139, 77.209, 100, 200, 5.5);
    expect(result.choghadiya?.day).toHaveLength(8);
    expect(result.choghadiya?.night).toHaveLength(8);
  });

  it('returns 24 hora slots starting at sunrise with the weekday lord first', () => {
    const date = new Date('2026-07-04T12:00:00Z'); // Saturday
    const result = calculateFullPanchang(date, 28.6139, 77.209, 100, 200, 5.5);
    expect(result.hora).toHaveLength(24);
    expect(result.hora?.[0]?.planet).toBe('Saturn'); // Saturday's weekday lord
    expect(result.hora?.[0]?.startTime).toBe(result.sunriseTime);
  });
});
