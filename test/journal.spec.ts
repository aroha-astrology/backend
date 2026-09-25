import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { calculateVimshottariDasha } from '../src/lib/astro-engine/dashas/vimshottari.js';
import { makeUserRow } from './helpers/mocks.js';

const chart = vi.hoisted((): { kundli: unknown } => ({ kundli: undefined }));
const state = vi.hoisted(() => ({
  existing: [] as unknown[],
  upsertJournalEntry: vi.fn(),
  deleteJournalEntry: vi.fn(),
}));

vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: () => Promise.resolve(chart.kundli),
}));
vi.mock('../src/modules/journal/journal.repo.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    listJournalEntries: () => Promise.resolve(state.existing),
    upsertJournalEntry: state.upsertJournalEntry,
    deleteJournalEntry: state.deleteJournalEntry,
  };
});

import {
  buildInsights,
  journalLifeEvents,
  journalSnapshot,
  saveEntry,
  streakOf,
  type JournalEntryDto,
} from '../src/modules/journal/journal.service.js';

const USER = makeUserRow({
  dateOfBirth: '1990-05-15',
  timeOfBirth: '14:30',
  placeOfBirth: { name: 'Delhi', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' },
});

function entry(date: string, extra: Partial<JournalEntryDto> = {}): JournalEntryDto {
  return {
    date,
    mood: null,
    energy: null,
    career: null,
    relationship: null,
    money: null,
    note: null,
    events: [],
    snapshot: null,
    ...extra,
  };
}

const snap = (maha: string, antar: string, tara: number) => ({
  maha,
  antar,
  moonSign: 'Aries',
  moonNakshatra: 'Ashwini',
  tara,
});

beforeEach(() => {
  chart.kundli = undefined;
  state.existing = [];
  state.upsertJournalEntry.mockReset().mockImplementation((v: Record<string, unknown>) =>
    Promise.resolve({
      id: 'e-1',
      userId: v.userId,
      entryDate: v.entryDate,
      ...(v.ratings as object),
      note: (v.body as { note: string | null }).note,
      events: (v.body as { events: string[] }).events,
      snapshot: v.snapshot,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  );
  state.deleteJournalEntry.mockReset().mockResolvedValue(true);
});

describe('streakOf', () => {
  it('counts back from today, or from yesterday before tonight’s entry', () => {
    expect(streakOf(['2026-09-25', '2026-09-24', '2026-09-23', '2026-09-20'], '2026-09-25')).toBe(
      3,
    );
    expect(streakOf(['2026-09-24', '2026-09-23'], '2026-09-25')).toBe(2);
    expect(streakOf(['2026-09-22'], '2026-09-25')).toBe(0);
  });
});

describe('buildInsights', () => {
  it('groups by dasha period, counts events by area and compares mood on good and hard taras', () => {
    const entries = [
      entry('2026-09-25', {
        mood: 5,
        events: ['promotion'],
        snapshot: snap('Saturn', 'Mercury', 2),
      }),
      entry('2026-09-24', {
        mood: 4,
        events: ['job_started'],
        snapshot: snap('Saturn', 'Mercury', 4),
      }),
      entry('2026-09-23', { mood: 4, snapshot: snap('Saturn', 'Mercury', 6) }),
      entry('2026-09-22', { mood: 2, snapshot: snap('Saturn', 'Mercury', 3) }),
      entry('2026-09-21', { mood: 2, snapshot: snap('Saturn', 'Mercury', 5) }),
      entry('2026-09-20', {
        mood: 3,
        events: ['marriage'],
        snapshot: snap('Saturn', 'Mercury', 7),
      }),
      entry('2025-01-10', { events: ['relocation'], snapshot: snap('Saturn', 'Sun', 1) }),
    ];
    const insights = buildInsights(entries, '2026-09-25');

    expect(insights.total).toBe(7);
    expect(insights.streak).toBe(6);
    expect(insights.averages.mood).toBe(3.3);
    expect(insights.averages.money).toBeNull();
    expect(insights.eventsByArea).toEqual({ career: 2, relationships: 1, relocation: 1 });
    expect(insights.byDasha[0]).toEqual({
      maha: 'Saturn',
      antar: 'Mercury',
      entries: 6,
      events: 3,
      avgMood: 3.3,
    });
    expect(insights.highlights).toEqual([
      { kind: 'dashaEvents', maha: 'Saturn', antar: 'Mercury', area: 'career', count: 2 },
      { kind: 'taraMood', good: 4.3, bad: 2.3 },
    ]);
  });

  it('stays quiet with too little to go on', () => {
    const insights = buildInsights(
      [entry('2026-09-25', { mood: 3, snapshot: snap('Venus', 'Venus', 2) })],
      '2026-09-25',
    );
    expect(insights.highlights).toEqual([]);
  });
});

describe('saveEntry', () => {
  it('merges into the day: a mood-only save keeps the note, null clears a field', async () => {
    state.existing = [
      {
        entryDate: '2026-09-25',
        mood: 2,
        energy: 3,
        career: null,
        relationship: null,
        money: null,
        note: 'Long day',
        events: ['promotion'],
        snapshot: snap('Saturn', 'Mercury', 2),
      },
    ];
    await saveEntry(USER, '2026-09-25', { mood: 4, energy: null });
    expect(state.upsertJournalEntry).toHaveBeenCalledWith({
      userId: USER.id,
      entryDate: '2026-09-25',
      ratings: { mood: 4, energy: null, career: null, relationship: null, money: null },
      body: { note: 'Long day', events: ['promotion'] },
      snapshot: snap('Saturn', 'Mercury', 2),
    });
  });

  it('refuses a future date', async () => {
    await expect(saveEntry(USER, '2999-01-01', { mood: 3 })).rejects.toThrow(
      'JOURNAL_DATE_IN_FUTURE',
    );
    expect(state.upsertJournalEntry).not.toHaveBeenCalled();
  });

  it('saves without a snapshot while the chart is not ready, and trims the note', async () => {
    const saved = await saveEntry(USER, '2026-09-01', {
      note: '  Met Ravi  ',
      events: ['job_started', 'job_started'],
    });
    expect(saved.snapshot).toBeNull();
    expect(saved.note).toBe('Met Ravi');
    expect(saved.events).toEqual(['job_started']);
  });
});

describe('journalSnapshot on a real chart', () => {
  it("stamps the owner's dasha lords and the day's Moon and tara", async () => {
    const natal = await calculateChart(1990, 5, 15, 14, 30, 5.5, 28.6139, 77.209, 'lahiri', 'W');
    const moon = natal.planets.find((p) => p.planet === 'Moon')!;
    const vimshottari = calculateVimshottariDasha(
      moon.longitude,
      new Date(Date.UTC(1990, 4, 15, 9, 0)),
    );
    chart.kundli = {
      status: 'ready',
      chartData: JSON.parse(JSON.stringify(natal)) as unknown,
      dashaData: JSON.parse(JSON.stringify({ vimshottari, yogini: {} })) as unknown,
      ayanamsa: 'lahiri',
      houseSystem: 'W',
      nodeType: 'mean',
      calculationVersion: '2026.08.1',
      generatedAt: new Date(),
    };
    const s = await journalSnapshot(USER, '2026-09-25');
    expect(s?.maha).toBeTruthy();
    expect(s?.antar).toBeTruthy();
    expect(s?.tara).toBeGreaterThanOrEqual(1);
    expect(s?.tara).toBeLessThanOrEqual(9);
    expect(s?.moonNakshatra).toMatch(/^[A-Z]/);
  }, 60_000);
});

describe('journalLifeEvents', () => {
  it('flattens every dated event, once each', async () => {
    state.existing = [
      { entryDate: '2015-06-01', events: ['job_started'] },
      { entryDate: '2018-02-10', events: ['marriage', 'relocation'] },
      { entryDate: '2026-09-25', events: [] },
    ];
    expect(await journalLifeEvents(USER)).toEqual({
      events: [
        { date: '2015-06-01', domain: 'job_started' },
        { date: '2018-02-10', domain: 'marriage' },
        { date: '2018-02-10', domain: 'relocation' },
      ],
    });
  });
});
