import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeProfileContext, makeUserRow } from './helpers/mocks.js';
import type * as Why from '../src/lib/intelligence/why.js';

const state = vi.hoisted(() => ({
  loadChartContext: vi.fn(),
  findKundliByUserId: vi.fn(),
  synthesize: vi.fn(),
  findHoroscope: vi.fn(),
  findMoonChanges: vi.fn(),
  getPanchang: vi.fn(),
  explainArea: vi.fn(),
}));

vi.mock('../src/modules/insights/insights.service.js', () => ({
  loadChartContext: state.loadChartContext,
  istNoon: (date: string) => new Date(`${date}T06:30:00Z`),
}));
vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: state.findKundliByUserId,
}));
vi.mock('../src/lib/astro-tools/daily-synthesis.js', () => ({
  synthesizeDailyForecastFromKundli: state.synthesize,
}));
vi.mock('../src/modules/horoscope/horoscope.repo.js', () => ({
  findHoroscope: state.findHoroscope,
}));
vi.mock('../src/lib/astro-tools/moon-events.js', () => ({
  findMoonChanges: state.findMoonChanges,
}));
vi.mock('../src/modules/astro/astro.service.js', () => ({ getPanchang: state.getPanchang }));
vi.mock('../src/lib/intelligence/why.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Why>();
  return { ...actual, explainArea: state.explainArea };
});
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  chartScore,
  dayWindows,
  getAstroWeather,
  istTime,
  toPercent,
  trendOf,
} from '../src/modules/insights/weather.service.js';

const ctx = {
  moonSignIndex: 11,
  dasha: {
    mahadasha: { planet: 'Mercury' },
    antardasha: { planet: 'Venus' },
    pratyantardasha: null,
  },
};

beforeEach(() => {
  for (const fn of Object.values(state)) fn.mockReset();
  state.loadChartContext.mockResolvedValue({ profile: makeProfileContext(), ctx });
  state.findKundliByUserId.mockResolvedValue({ chartData: {}, dashaData: {} });
  state.synthesize.mockResolvedValueOnce({ score: 3 }).mockResolvedValueOnce({ score: 4 });
  state.findMoonChanges.mockResolvedValue([
    {
      kind: 'sign',
      from: 'Aries',
      to: 'Taurus',
      toIndex: 1,
      exactAt: new Date('2026-09-24T12:48:00Z'),
      forDate: '2026-09-24',
    },
  ]);
  state.explainArea.mockReturnValue([{ kind: 'dasha', effect: 1, textKey: 'why.dasha.mahadasha' }]);
  state.getPanchang.mockResolvedValue({
    choghadiya: {
      day: [
        { name: 'Amrit', type: 'good', startTime: '06:10', endTime: '07:40' },
        { name: 'Char', type: 'neutral', startTime: '07:40', endTime: '09:10' },
        { name: 'Rog', type: 'bad', startTime: '09:10', endTime: '10:40' },
      ],
    },
    rahuKaal: { start: '13:30', end: '15:00' },
    abhijitMuhurta: { start: '11:48', end: '12:36' },
  });
});

describe('pure helpers', () => {
  it('rescales and clamps scores', () => {
    expect([toPercent(1), toPercent(3), toPercent(5), toPercent(9)]).toEqual([20, 60, 100, 100]);
    expect(
      chartScore([
        { kind: 'dasha', effect: 1, textKey: 'k' },
        { kind: 'transit', effect: 1, textKey: 'k' },
      ]),
    ).toBe(75);
    expect(
      chartScore(
        Array.from({ length: 9 }, () => ({
          kind: 'transit' as const,
          effect: -1 as const,
          textKey: 'k',
        })),
      ),
    ).toBe(15);
  });

  it('calls a trend only on a clear move', () => {
    expect(trendOf(3, 4)).toBe('improving');
    expect(trendOf(4, 3)).toBe('declining');
    expect(trendOf(3, 3.5)).toBe('steady');
    expect(trendOf(3, null)).toBe('steady');
  });

  it('keeps good and caution windows plus Abhijit and Rahu Kaal, in time order, dropping neutral ones', () => {
    const windows = dayWindows({
      choghadiya: {
        day: [
          { name: 'Labh', type: 'good', startTime: '12:00', endTime: '13:30' },
          { name: 'Char', type: 'neutral', startTime: '06:00', endTime: '07:30' },
        ],
      },
      rahuKaal: { start: '09:00', end: '10:30' },
      abhijitMuhurta: { start: '11:40', end: '12:28' },
    });
    expect(windows.map((w) => w.name)).toEqual(['rahuKaal', 'abhijit', 'Labh']);
    expect(windows.find((w) => w.name === 'rahuKaal')!.kind).toBe('caution');
  });

  it('prints IST clock time', () => {
    expect(istTime(new Date('2026-09-24T12:48:00Z'))).toBe('18:18');
  });
});

describe('getAstroWeather', () => {
  it("uses the stored horoscope's category scores when the day's reading exists", async () => {
    state.findHoroscope.mockResolvedValue({
      status: 'ready',
      structured: {
        categories: {
          career: { score: 4 },
          marriage: { score: 3 },
          finance: { score: 5 },
          health: { score: 2 },
        },
      },
    });
    const user = makeUserRow({ currentTimezone: 'Asia/Kolkata' });

    const w = await getAstroWeather(user, '2026-09-24');

    expect(w.areas.map((a) => [a.key, a.score, a.source])).toEqual([
      ['career', 80, 'horoscope'],
      ['relationships', 60, 'horoscope'],
      ['money', 100, 'horoscope'],
      ['energy', 40, 'horoscope'],
    ]);
    expect(w.overall).toEqual({ score: 60, trend: 'improving', tomorrowScore: 80 });
    expect(w.header).toEqual({ moonSign: 'Pisces', mahadasha: 'Mercury', antardasha: 'Venus' });
    expect(w.moments).toEqual([
      {
        kind: 'moonSign',
        at: '2026-09-24T12:48:00.000Z',
        time: '18:18',
        from: 'Aries',
        to: 'Taurus',
      },
    ]);
    expect(w.dayAvailable).toBe(true);
    expect(w.day.map((d) => d.name)).toEqual(['Amrit', 'Rog', 'abhijit', 'rahuKaal']);
  });

  it('falls back to chart factors when there is no reading, and skips IST windows outside India', async () => {
    state.findHoroscope.mockResolvedValue(undefined);
    const user = makeUserRow({ currentTimezone: 'Europe/London' });

    const w = await getAstroWeather(user, '2026-09-24');

    expect(w.areas.every((a) => a.source === 'chart' && a.score === 65)).toBe(true);
    expect(w.dayAvailable).toBe(false);
    expect(w.day).toEqual([]);
    expect(state.getPanchang).not.toHaveBeenCalled();
  });

  it('answers CHART_NOT_READY while the kundli is being built', async () => {
    state.loadChartContext.mockResolvedValue(null);
    await expect(getAstroWeather(makeUserRow(), '2026-09-24')).rejects.toMatchObject({
      status: 409,
    });
  });
});
