import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  buildChartContext,
  panchangLocationFor,
} from '../src/modules/purchase-plan/purchase-plan.service.js';

type Kundli = Parameters<typeof buildChartContext>[0];

describe('buildChartContext', () => {
  it('puts the current dasha in the prompt, read from the shape kundli.service.ts actually stores', () => {
    // kundli.service.ts writes dashaData as { vimshottari, yogini }, and each
    // period names its lord `planet`. The old code read a top-level
    // currentMahadasha.lord and so never found it.
    const kundli = {
      status: 'ready',
      chartData: {
        ascendant: { sign: 'Leo' },
        planets: [{ planet: 'Sun', sign: 'Taurus', house: 10 }],
      },
      dashaData: {
        vimshottari: {
          currentMahadasha: { planet: 'Mercury' },
          currentAntardasha: { planet: 'Venus' },
        },
        yogini: {},
      },
    } as unknown as Kundli;

    const context = buildChartContext(kundli);

    expect(context).toContain('Current Mahadasha: Mercury');
    expect(context).toContain('Current Antardasha: Venus');
    expect(context).toContain('Ascendant: Leo');
  });

  it('falls back to a panchang-only line when there is no ready chart', () => {
    expect(buildChartContext(undefined)).toMatch(/No birth chart/);
  });
});

describe('panchangLocationFor', () => {
  const kolkata = { lat: 22.5726, lon: 88.3639 };
  const mumbai = { lat: 19.076, lon: 72.8777 };

  it('prefers where the user is now', () => {
    expect(panchangLocationFor({ currentLocation: kolkata, placeOfBirth: mumbai })).toEqual(
      kolkata,
    );
  });

  it('falls back to the birth place, then to New Delhi', () => {
    expect(panchangLocationFor({ currentLocation: null, placeOfBirth: mumbai })).toEqual(mumbai);
    expect(panchangLocationFor({})).toEqual({ lat: 28.6139, lon: 77.209 });
  });

  it('skips a location with non-numeric coordinates', () => {
    const broken = { lat: Number.NaN, lon: 88 };
    expect(panchangLocationFor({ currentLocation: broken, placeOfBirth: mumbai })).toEqual(mumbai);
  });
});
