import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeProfileContext, makeUserRow } from './helpers/mocks.js';

interface State {
  loaded: unknown;
  horoscope: unknown;
  done: Array<{ date: string; itemId: string }>;
  markPracticeDone: ReturnType<typeof vi.fn>;
}

const state = vi.hoisted(
  (): State => ({ loaded: null, horoscope: undefined, done: [], markPracticeDone: vi.fn() }),
);

vi.mock('../src/modules/insights/insights.service.js', () => ({
  istNoon: (d: string) => new Date(`${d}T06:30:00Z`),
  loadChartContext: () => Promise.resolve(state.loaded),
}));
vi.mock('../src/modules/birth-profiles/profile-context.js', async () => {
  const { makeProfileContext: profile } = await import('./helpers/mocks.js');
  return { resolveActiveProfileContext: () => Promise.resolve(profile()) };
});
vi.mock('../src/modules/horoscope/horoscope.repo.js', () => ({
  findHoroscope: () => Promise.resolve(state.horoscope),
}));
vi.mock('../src/modules/practice/practice.repo.js', () => ({
  listPracticeDone: () => Promise.resolve(state.done),
  markPracticeDone: state.markPracticeDone,
}));

import {
  buildItems,
  completePractice,
  getPracticeToday,
  summarizeDone,
} from '../src/modules/practice/practice.service.js';

const NOW = new Date('2026-09-25T06:30:00Z'); // Friday in IST

beforeEach(() => {
  state.loaded = null;
  state.horoscope = undefined;
  state.done = [];
  state.markPracticeDone
    .mockReset()
    .mockImplementation((_u: string, date: string, itemId: string) => {
      state.done.push({ date, itemId });
      return Promise.resolve();
    });
});

describe('buildItems', () => {
  it("offers the reading's mantra, 108 japs for the dasha lord and the weekday's prayer", () => {
    const items = buildItems({
      weekday: 4,
      remedy: { slug: 'shanti-mantra', japCount: 21, reason: 'A calm mind today.' },
      dasha: { planet: 'Saturn', level: 'antardasha', until: '2027-03-01' },
      moonHouseFromMoon: 3,
    });
    expect(items.map((i) => [i.id, i.slug, i.japCount])).toEqual([
      ['remedy', 'shanti-mantra', 21],
      ['dasha', 'hanuman-gayatri', 108],
      ['weekday', 'vishnu-shantakaram', 11],
    ]);
    expect(items[1]!.why[0]).toMatchObject({
      textKey: 'practice.why.dasha',
      params: { planet: 'Saturn', until: '2027-03-01' },
    });
  });

  it("swaps the weekday prayer for Gayatri when it's already today's mantra", () => {
    // Saturday's verse is Hanuman Gayatri, which is also Saturn's.
    const items = buildItems({
      weekday: 6,
      dasha: { planet: 'Saturn', level: 'mahadasha', until: '2030-01-01' },
    });
    expect(items.find((i) => i.id === 'weekday')).toMatchObject({
      slug: 'gayatri-mantra',
      why: [{ textKey: 'practice.why.gayatri' }],
    });
  });

  it('adds a Lal Kitab remedy only when the Moon is 4th, 5th or 8th from the natal Moon', () => {
    const on8 = buildItems({ weekday: 1, moonHouseFromMoon: 8 }).find((i) => i.id === 'lalKitab');
    expect(on8).toMatchObject({ kind: 'action', lalKitab: { house: 8, lines: [0, 1] } });
    expect(on8!.why[0]!.textKey).toBe('decide.why.chandrashtama');
    expect(buildItems({ weekday: 1, moonHouseFromMoon: 7 }).some((i) => i.id === 'lalKitab')).toBe(
      false,
    );
    expect(buildItems({ weekday: 1, moonHouseFromMoon: 12 }).some((i) => i.id === 'lalKitab')).toBe(
      false,
    );
  });
});

describe('summarizeDone', () => {
  it("counts today's items, the streak, the week strip and the month", () => {
    const items = buildItems({ weekday: 5 });
    const s = summarizeDone(
      [
        { date: '2026-09-25', itemId: 'weekday' },
        { date: '2026-09-25', itemId: 'dasha' }, // not offered today, so not "done"
        { date: '2026-09-24', itemId: 'weekday' },
        { date: '2026-09-20', itemId: 'weekday' },
        { date: '2026-08-01', itemId: 'weekday' },
      ],
      '2026-09-25',
      items,
    );
    expect(s.done).toEqual(['weekday']);
    expect(s.streak).toBe(2);
    expect(s.week.map((d) => d.date)).toEqual([
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ]);
    expect(s.week.map((d) => d.done)).toEqual([0, 1, 0, 0, 0, 1, 2]);
    expect(s.monthDays).toBe(3);
  });
});

describe('getPracticeToday / completePractice', () => {
  it("reads the day's mantra from the ready horoscope and works without a chart", async () => {
    state.horoscope = {
      status: 'ready',
      structured: {
        remedy: { slug: 'lakshmi-mantra', japCount: 27, reason: 'Money worries ease.' },
      },
    };
    const today = await getPracticeToday(makeUserRow(), NOW);
    expect(today.date).toBe('2026-09-25');
    expect(today.items.map((i) => i.id)).toEqual(['remedy', 'weekday']);
    // Friday's verse (Lakshmi) is already the remedy, so the weekday item falls back to Gayatri.
    expect(today.items[1]!.slug).toBe('gayatri-mantra');
  });

  it('uses the running Antardasha and the Moon from the chart', async () => {
    state.loaded = {
      profile: makeProfileContext(),
      ctx: {
        dasha: {
          mahadasha: {
            planet: 'Jupiter',
            startDate: '2020-01-01T00:00:00.000Z',
            endDate: '2036-01-01T00:00:00.000Z',
          },
          antardasha: {
            planet: 'Venus',
            startDate: '2025-01-01T00:00:00.000Z',
            endDate: '2027-09-01T00:00:00.000Z',
          },
          pratyantardasha: null,
        },
        transits: [{ planet: 'Moon', houseFromMoon: 4 }],
      },
    };
    const today = await getPracticeToday(makeUserRow(), NOW);
    expect(today.items.find((i) => i.id === 'dasha')).toMatchObject({
      slug: 'lakshmi-mantra',
      japCount: 108,
    });
    expect(today.items.find((i) => i.id === 'lalKitab')?.lalKitab?.house).toBe(4);
  });

  it('marks an offered item done and refuses one not offered today', async () => {
    const user = makeUserRow();
    const after = await completePractice(user, 'weekday');
    expect(state.markPracticeDone).toHaveBeenCalledWith(
      user.id,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      'weekday',
    );
    expect(after.done).toEqual(['weekday']);
    await expect(completePractice(user, 'lalKitab')).rejects.toThrow('PRACTICE_ITEM_NOT_OFFERED');
  });
});
