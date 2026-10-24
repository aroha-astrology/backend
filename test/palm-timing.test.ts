import { describe, it, expect } from 'vitest';
import {
  palmEventCandidates,
  reconcilePalmEvents,
  datePalmEventsFromHand,
  type PalmEventCandidate,
  type KindWindows,
} from '../src/lib/astro-engine/palm/palm-timing.js';
import type { PalmHandObservations } from '../src/lib/astro-engine/palm/palm-types.js';

function baseObservations(): PalmHandObservations {
  return {
    hand: 'right',
    imageQuality: { score: 9, lineVisibility: 9, lighting: 8, focus: 9, framing: 9 },
    handType: { element: 'Earth', palmShape: 'square', skinTexture: 'medium' },
    mounts: {
      jupiter: 'normal',
      saturn: 'normal',
      apollo: 'normal',
      mercury: 'normal',
      venus: 'normal',
      luna: 'normal',
      marsUpper: 'normal',
      marsLower: 'normal',
      rahuPlain: 'normal',
    },
    majorLines: {
      lifeLine: {
        present: true,
        polyline: [
          [0.35, 0.5],
          [0.38, 0.65],
          [0.45, 0.85],
        ],
        confidence: 0.9,
        trace: { drawable: true, support: 0.95, edgeFraction: 0 },
      },
      headLine: {
        present: true,
        polyline: [
          [0.35, 0.5],
          [0.55, 0.6],
          [0.75, 0.65],
        ],
        confidence: 0.9,
        trace: { drawable: true, support: 0.95, edgeFraction: 0 },
      },
      heartLine: {
        present: true,
        polyline: [
          [0.75, 0.45],
          [0.55, 0.42],
          [0.4, 0.45],
        ],
        confidence: 0.9,
        trace: { drawable: true, support: 0.95, edgeFraction: 0 },
      },
      fateLine: {
        present: true,
        polyline: [
          [0.5, 0.85],
          [0.5, 0.5],
          [0.5, 0.35],
        ],
        confidence: 0.9,
        trace: { drawable: true, support: 0.95, edgeFraction: 0 },
      },
    },
    minorLines: {
      marriageLines: { count: 1 },
      childrenLines: { count: 1 },
      intuitionLine: { present: false },
      travelLines: { count: 0 },
    },
    thumb: { flexibility: 'normal', setAngle: 'medium' },
    fingerprints: [],
    specialMarkings: [],
    orientation: 'fingersUp',
    palmBox: [0.2, 0.3, 0.8, 0.9],
    marriageLines: [{ position: 0.4, length: 'medium', depth: 'deep' }],
    timingMarks: [
      {
        line: 'fateLine',
        mark: 'branchUp',
        point: [0.5, 0.6],
        confidence: 0.85,
      },
    ],
  };
}

describe('palmEventCandidates', () => {
  it('sets anchor to null for percussion-edge marriage and children candidates (Step 5A)', () => {
    const obs = baseObservations();
    const candidates = palmEventCandidates(obs, 'right');

    const marriage = candidates.find((c) => c.source === 'marriageLine');
    expect(marriage).toBeDefined();
    expect(marriage!.anchor).toBeNull();
    expect(marriage!.palmAge).toBeGreaterThanOrEqual(16);

    const child = candidates.find((c) => c.source === 'childrenLine');
    expect(child).toBeDefined();
    expect(child!.anchor).toBeNull();
  });

  it('keeps on-line anchor for major line timing marks', () => {
    const obs = baseObservations();
    const candidates = palmEventCandidates(obs, 'right');

    const promotion = candidates.find((c) => c.source === 'fateLine');
    expect(promotion).toBeDefined();
    expect(promotion!.anchor).not.toBeNull();
    expect(Array.isArray(promotion!.anchor)).toBe(true);
  });
});

describe('reconcilePalmEvents', () => {
  const chartWindows: Record<string, KindWindows> = {
    promotion: {
      future: [
        {
          startAge: 28,
          endAge: 30,
          startDate: '2028-01-01',
          endDate: '2030-01-01',
        },
      ],
      past: [],
    },
    marriage: {
      future: [
        {
          startAge: 27,
          endAge: 29,
          startDate: '2027-01-01',
          endDate: '2029-01-01',
        },
      ],
      past: [],
    },
    child: { future: [], past: [] },
    careerChange: { future: [], past: [] },
    wealth: { future: [], past: [] },
    relocation: { future: [], past: [] },
  };

  it('matches when palmAge is within AGE_TOLERANCE (gap <= 2)', () => {
    const candidate: PalmEventCandidate = {
      kind: 'promotion',
      source: 'fateLine',
      palmAge: 29,
      anchor: [0.5, 0.6],
      confidence: 0.9,
    };

    const res = reconcilePalmEvents([candidate], chartWindows, 25);
    expect(res.events).toHaveLength(1);
    expect(res.events[0]!.ages[0]!.agreement).toBe('match');
    expect(res.events[0]!.ages[0]!.age).toBe(29);
  });

  it('adjusts when palmAge is near tolerance (gap 3)', () => {
    const candidate: PalmEventCandidate = {
      kind: 'promotion',
      source: 'fateLine',
      palmAge: 33, // window ends at 30, gap is 3 (within NEAR_TOLERANCE 4)
      anchor: [0.5, 0.6],
      confidence: 0.9,
    };

    const res = reconcilePalmEvents([candidate], chartWindows, 25);
    expect(res.events).toHaveLength(1);
    expect(res.events[0]!.ages[0]!.agreement).toBe('adjusted');
    expect(res.events[0]!.ages[0]!.age).toBe(30);
  });

  it('suppresses event when chart gives no window (gap > 4, contradiction)', () => {
    const candidate: PalmEventCandidate = {
      kind: 'promotion',
      source: 'fateLine',
      palmAge: 45, // chart window is 28-30, gap 15
      anchor: [0.5, 0.6],
      confidence: 0.9,
    };

    const res = reconcilePalmEvents([candidate], chartWindows, 25);
    expect(res.events).toHaveLength(0);
  });
});

describe('datePalmEventsFromHand (hand alone, no chart)', () => {
  const withLines = (marriageLines: PalmHandObservations['marriageLines']) => ({
    ...baseObservations(),
    marriageLines,
    timingMarks: [],
  });
  const marriageOf = (
    lines: PalmHandObservations['marriageLines'],
    person: {
      age: number | null;
      marital: 'unmarried' | 'married' | 'previously_married' | 'unknown';
    },
  ) => datePalmEventsFromHand(withLines(lines), 'right', person).find((e) => e.kind === 'marriage');
  const MID = [
    { position: 0.5, length: 'long', depth: 'deep' },
  ] as PalmHandObservations['marriageLines'];

  it('shows the hand age when it is still ahead of an unmarried reader', () => {
    const e = marriageOf(MID, { age: 25, marital: 'unmarried' });
    expect(e?.ages[0]).toMatchObject({ age: 28, agreement: 'hand', past: false });
  });

  it('never calls a 33-year-old unmarried reader married at 28: moves to the later scale', () => {
    const e = marriageOf(MID, { age: 33, marital: 'unmarried' });
    expect(e?.ages[0]).toMatchObject({ age: 36, palmAge: 28, agreement: 'later', past: false });
  });

  it('prefers the next marriage line that is still ahead over the strongest one that has passed', () => {
    const lines = [
      { position: 0.5, length: 'long', depth: 'deep' },
      { position: 0.8, length: 'short', depth: 'faint' },
    ] as PalmHandObservations['marriageLines'];
    const e = marriageOf(lines, { age: 33, marital: 'unmarried' });
    expect(e?.ages[0]).toMatchObject({ age: 38, agreement: 'hand', past: false });
  });

  it('shows no marriage age when both scales are behind an unmarried reader', () => {
    expect(marriageOf(MID, { age: 41, marital: 'unmarried' })).toBeUndefined();
  });

  it('puts no marriage date on someone married or married before', () => {
    expect(marriageOf(MID, { age: 33, marital: 'married' })).toBeUndefined();
    expect(marriageOf(MID, { age: 33, marital: 'previously_married' })).toBeUndefined();
  });

  it('with no stated status, shows the hand age and marks it passed', () => {
    const e = marriageOf(MID, { age: 33, marital: 'unknown' });
    expect(e?.ages[0]).toMatchObject({ age: 28, past: true });
  });

  it('dates other events without any chart window, and leaves children undated', () => {
    const events = datePalmEventsFromHand(
      { ...baseObservations(), timingMarks: baseObservations().timingMarks },
      'right',
      { age: 30, marital: 'unmarried' },
    );
    for (const ev of events) {
      for (const a of ev.ages) expect(a.window).toBeUndefined();
    }
    expect(events.find((e) => e.kind === 'child')?.ages).toEqual([]);
  });
});
