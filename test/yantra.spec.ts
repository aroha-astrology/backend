import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeProfileContext, makeUserRow } from './helpers/mocks.js';

const held = vi.hoisted(
  (): { loaded: unknown; kundli: unknown; features: Record<string, unknown>; rows: unknown[] } => ({
    loaded: null,
    kundli: undefined,
    features: {},
    rows: [],
  }),
);
const state = vi.hoisted(() => ({
  insertDigitalProduct: vi.fn(),
  deductWalletBalance: vi.fn(),
  addWalletBalance: vi.fn(),
}));

vi.mock('../src/modules/insights/insights.service.js', () => ({
  loadChartContext: () => Promise.resolve(held.loaded),
}));
vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: () => Promise.resolve(held.kundli),
}));
vi.mock('../src/modules/features/features.service.js', () => ({
  resolveFeaturesForUser: () => Promise.resolve(held.features),
}));
vi.mock('../src/modules/users/users.repo.js', () => ({
  deductWalletBalance: state.deductWalletBalance,
  addWalletBalance: state.addWalletBalance,
}));
vi.mock('../src/modules/yantra/yantra.repo.js', () => ({
  listDigitalProducts: () => Promise.resolve(held.rows),
  insertDigitalProduct: state.insertDigitalProduct,
}));

import {
  BEEJ_MANTRA,
  NAVAGRAHA,
  buildYantraSpec,
  chooseYantraPlanet,
  magicSum,
  navagrahaGrid,
} from '../src/lib/astro-tools/yantra.js';
import { buyDigitalProduct, getYantra } from '../src/modules/yantra/yantra.service.js';

const ON = {
  enabled: true,
  pricePaise: null,
  originalPricePaise: null,
  model: null,
  enabledAt: null,
};

function chartFor(mahaPlanet: string) {
  return {
    profile: makeProfileContext(),
    ctx: {
      moonNakshatraIndex: 7,
      dasha: {
        mahadasha: {
          planet: mahaPlanet,
          startDate: '2020-01-01T00:00:00.000Z',
          endDate: '2039-01-01T00:00:00.000Z',
        },
        antardasha: null,
        pratyantardasha: null,
      },
    },
  };
}

beforeEach(() => {
  held.loaded = chartFor('Jupiter');
  held.kundli = { chartData: { shadbala: [] } };
  held.features = {};
  held.rows = [];
  state.insertDigitalProduct.mockReset().mockResolvedValue(true);
  state.deductWalletBalance.mockReset().mockResolvedValue(true);
  state.addWalletBalance.mockReset().mockResolvedValue(undefined);
});

describe('navagraha yantra squares', () => {
  it('every row, column and diagonal adds up to the graha’s number (Surya 15 … Ketu 39)', () => {
    for (const planet of NAVAGRAHA) {
      const g = navagrahaGrid(planet);
      const sum = magicSum(planet);
      for (const row of g)
        expect(
          row.reduce((a, b) => a + b, 0),
          planet,
        ).toBe(sum);
      for (let c = 0; c < 3; c++)
        expect(
          g.reduce((a, r) => a + r[c]!, 0),
          planet,
        ).toBe(sum);
      expect(g[0]![0]! + g[1]![1]! + g[2]![2]!, planet).toBe(sum);
      expect(g[0]![2]! + g[1]![1]! + g[2]![0]!, planet).toBe(sum);
    }
    expect(navagrahaGrid('Sun')).toEqual([
      [6, 1, 8],
      [7, 5, 3],
      [2, 9, 4],
    ]);
    expect(magicSum('Ketu')).toBe(39);
    expect(BEEJ_MANTRA.Saturn.devanagari).toContain('शनैश्चराय');
  });
});

describe('chooseYantraPlanet', () => {
  const shadbala = [
    { planet: 'Venus' as const, totalVirupas: 280, requiredVirupas: 330 },
    { planet: 'Moon' as const, totalVirupas: 300, requiredVirupas: 360 },
    { planet: 'Jupiter' as const, totalVirupas: 420, requiredVirupas: 390 },
  ];

  it('leans into a benefic Mahadasha lord', () => {
    const c = chooseYantraPlanet({
      mahadasha: { planet: 'Jupiter', until: '2039-01-01' },
      shadbala,
    });
    expect(c?.planet).toBe('Jupiter');
    expect(c?.why[0]).toMatchObject({
      textKey: 'yantra.why.dasha',
      params: { planet: 'Jupiter', until: '2039-01-01' },
    });
  });

  it('under a malefic Mahadasha, strengthens the weakest benefic', () => {
    const c = chooseYantraPlanet({
      mahadasha: { planet: 'Saturn', until: '2031-01-01' },
      shadbala,
    });
    expect(c?.planet).toBe('Moon'); // 83% of its required strength, Venus is 85%
    expect(c?.why[0]).toMatchObject({
      textKey: 'yantra.why.weakBenefic',
      params: { planet: 'Moon', pct: 83 },
    });
  });

  it('with every benefic strong, steadies the Mahadasha lord', () => {
    const strong = shadbala.map((s) => ({ ...s, totalVirupas: 500 }));
    expect(
      chooseYantraPlanet({ mahadasha: { planet: 'Rahu', until: '2030-01-01' }, shadbala: strong })
        ?.planet,
    ).toBe('Rahu');
  });

  it('builds the spec with the birth nakshatra and affirmation key', () => {
    const spec = buildYantraSpec({ planet: 'Venus', why: [] }, 10);
    expect(spec).toMatchObject({
      planet: 'Venus',
      magicSum: 30,
      nakshatra: 'PurvaPhalguni',
      affirmationKey: 'yantra.affirmation.venus',
    });
  });
});

describe('getYantra / buyDigitalProduct', () => {
  it('previews the graha but keeps the square and mantra until something is bought', async () => {
    held.features = { 'paid.digitalYantra': { ...ON, pricePaise: 4900 } };
    const view = await getYantra(makeUserRow({ id: 'user-1' }));
    expect(view.preview.planet).toBe('Jupiter');
    expect(view.spec).toBeNull();
    expect(view.owned).toEqual({ yantra: false, wallpaper: false });
    expect(view.prices).toEqual({ yantra: 4900, wallpaper: null });
  });

  it('charges once, stores the design, and a second kind reuses the first design', async () => {
    held.features = { 'paid.digitalYantra': ON, 'paid.digitalWallpaper': ON };
    await buyDigitalProduct(makeUserRow({ id: 'user-1' }), 'yantra');
    expect(state.deductWalletBalance).toHaveBeenCalledWith('user-1', 4900, 'digital_yantra');
    const stored = state.insertDigitalProduct.mock.calls[0]![0] as { spec: { planet: string } };
    expect(stored.spec.planet).toBe('Jupiter');

    // The dasha changed since, but the wallpaper keeps the yantra already bought.
    held.loaded = chartFor('Saturn');
    held.rows = [{ kind: 'yantra', spec: stored.spec }];
    await buyDigitalProduct(makeUserRow({ id: 'user-1' }), 'wallpaper');
    expect(state.deductWalletBalance).toHaveBeenLastCalledWith('user-1', 2900, 'digital_wallpaper');
    expect(
      (state.insertDigitalProduct.mock.calls[1]![0] as { spec: { planet: string } }).spec.planet,
    ).toBe('Jupiter');
  });

  it('never charges twice, refuses a switched-off product, and refunds a lost race', async () => {
    held.features = { 'paid.digitalYantra': ON };
    held.rows = [{ kind: 'yantra', spec: buildYantraSpec({ planet: 'Jupiter', why: [] }, 7) }];
    await buyDigitalProduct(makeUserRow({ id: 'user-1' }), 'yantra');
    expect(state.deductWalletBalance).not.toHaveBeenCalled();

    await expect(buyDigitalProduct(makeUserRow({ id: 'user-1' }), 'wallpaper')).rejects.toThrow(
      'PRODUCT_NOT_AVAILABLE',
    );

    held.rows = [];
    state.insertDigitalProduct.mockResolvedValueOnce(false);
    await buyDigitalProduct(makeUserRow({ id: 'user-1' }), 'yantra');
    expect(state.addWalletBalance).toHaveBeenCalledWith('user-1', 4900, 'refund:digital_yantra');
  });
});
