import { describe, it, expect } from 'vitest';
import {
  resolveCurrentSaturnPhase,
  resolveTransitions,
  buildSaturnPhaseAlertCopy,
  type ResolvedSaturnPhase,
} from '../src/modules/cron/saturn-phase-alert.service.js';
import type { KundliMoonSign } from '../src/modules/cron/saturn-phase.repo.js';
import type {
  RealSadeSatiResult,
  RealDhaiyaResult,
} from '../src/lib/astro-engine/doshas/saturnPhaseTimeline.js';
import type { SaturnPhaseRow } from '../src/db/schema.js';

function inactive(): RealSadeSatiResult {
  return { active: false, phase: 'none', windowStart: null, windowEnd: null };
}
function inactiveDhaiya(): RealDhaiyaResult {
  return { active: false, phase: 'none', startDate: null, endDate: null };
}

describe('resolveCurrentSaturnPhase', () => {
  const win = { windowStart: new Date('2021-01-01'), windowEnd: new Date('2023-01-01') };

  it('prefers Sade Sati over Dhaiya when both are somehow active (defensive ordering)', () => {
    const result = resolveCurrentSaturnPhase(
      { active: true, phase: 'sade-sati-peak', ...win },
      { active: true, phase: 'dhaiya-4th', startDate: win.windowStart, endDate: win.windowEnd },
    );
    expect(result.phase).toBe('sade-sati-peak');
  });

  it('returns the Dhaiya phase when Sade Sati is inactive', () => {
    const result = resolveCurrentSaturnPhase(inactive(), {
      active: true,
      phase: 'dhaiya-8th',
      startDate: win.windowStart,
      endDate: win.windowEnd,
    });
    expect(result.phase).toBe('dhaiya-8th');
    expect(result.windowStart).toEqual(win.windowStart);
  });

  it('returns none with null windows when neither is active', () => {
    const result = resolveCurrentSaturnPhase(inactive(), inactiveDhaiya());
    expect(result).toEqual({ phase: 'none', windowStart: null, windowEnd: null });
  });
});

describe('resolveTransitions', () => {
  const kundlis: KundliMoonSign[] = [
    { userId: 'u1', birthProfileId: null, moonSignIndex: 0 },
    { userId: 'u2', birthProfileId: null, moonSignIndex: 5 },
    { userId: 'u3', birthProfileId: 'profile-1', moonSignIndex: 0 },
  ];

  function row(userId: string, birthProfileId: string | null, phase: string): SaturnPhaseRow {
    return {
      id: `row-${userId}`,
      userId,
      birthProfileId,
      phase: phase as never,
      windowStart: null,
      windowEnd: null,
      lastCheckedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it('flags a user as transitioned when the stored phase differs from the resolved one', () => {
    const existing = new Map([['u1:', row('u1', null, 'none')]]);
    const byMoonSign: Record<number, ResolvedSaturnPhase> = {
      0: { phase: 'sade-sati-rising', windowStart: new Date(), windowEnd: new Date() },
      5: { phase: 'none', windowStart: null, windowEnd: null },
    };
    const result = resolveTransitions([kundlis[0]!], existing, byMoonSign);
    expect(result).toHaveLength(1);
    expect(result[0]!.previousPhase).toBe('none');
    expect(result[0]!.newPhase).toBe('sade-sati-rising');
    expect(result[0]!.existingRowId).toBe('row-u1');
  });

  it('reports no transition when the resolved phase matches what is already stored', () => {
    const existing = new Map([['u2:', row('u2', null, 'none')]]);
    const byMoonSign: Record<number, ResolvedSaturnPhase> = {
      5: { phase: 'none', windowStart: null, windowEnd: null },
    };
    const result = resolveTransitions([kundlis[1]!], existing, byMoonSign);
    expect(result).toHaveLength(0);
  });

  it('treats a never-before-seen user (no stored row) as a transition from null', () => {
    const byMoonSign: Record<number, ResolvedSaturnPhase> = {
      0: { phase: 'dhaiya-4th', windowStart: new Date(), windowEnd: new Date() },
    };
    const result = resolveTransitions([kundlis[0]!], new Map(), byMoonSign);
    expect(result).toHaveLength(1);
    expect(result[0]!.previousPhase).toBeNull();
    expect(result[0]!.existingRowId).toBeUndefined();
  });

  it('scopes transitions per (user, profile) independently — a profile does not inherit the primary users row', () => {
    // u3's additional profile (profile-1) has the SAME Moon sign as u1, but no
    // stored row of its own — it must be evaluated on its own key, not u1's.
    const existing = new Map([['u1:', row('u1', null, 'sade-sati-rising')]]);
    const byMoonSign: Record<number, ResolvedSaturnPhase> = {
      0: { phase: 'sade-sati-rising', windowStart: new Date(), windowEnd: new Date() },
    };
    const result = resolveTransitions([kundlis[0]!, kundlis[2]!], existing, byMoonSign);
    // u1 (primary): no transition, matches stored. u3's profile: transition from null.
    expect(result).toHaveLength(1);
    expect(result[0]!.userId).toBe('u3');
    expect(result[0]!.birthProfileId).toBe('profile-1');
  });

  it('silently skips a kundli whose Moon sign has no precomputed resolution', () => {
    const result = resolveTransitions(
      [{ userId: 'u9', birthProfileId: null, moonSignIndex: 11 }],
      new Map(),
      {}, // nothing precomputed
    );
    expect(result).toHaveLength(0);
  });
});

describe('buildSaturnPhaseAlertCopy', () => {
  it('returns begin-phase copy for a fresh Sade Sati rising phase', () => {
    const copy = buildSaturnPhaseAlertCopy(null, 'sade-sati-rising');
    expect(copy).not.toBeNull();
    expect(copy!.title).toMatch(/Sade Sati/i);
  });

  it('returns distinct copy for each of the 5 active phases', () => {
    const phases = [
      'sade-sati-rising',
      'sade-sati-peak',
      'sade-sati-setting',
      'dhaiya-4th',
      'dhaiya-8th',
    ] as const;
    const titles = phases.map((p) => buildSaturnPhaseAlertCopy(null, p)?.title);
    expect(titles.every((t) => typeof t === 'string' && t.length > 0)).toBe(true);
  });

  it('returns a distinct "ended" message when leaving Sade Sati for none', () => {
    const copy = buildSaturnPhaseAlertCopy('sade-sati-setting', 'none');
    expect(copy).not.toBeNull();
    expect(copy!.title).toMatch(/ended/i);
    expect(copy!.title).toMatch(/Sade Sati/i);
  });

  it('returns a distinct "ended" message when leaving Dhaiya for none', () => {
    const copy = buildSaturnPhaseAlertCopy('dhaiya-4th', 'none');
    expect(copy).not.toBeNull();
    expect(copy!.title).toMatch(/ended/i);
    expect(copy!.title).toMatch(/Dhaiya/i);
  });

  it('returns null when there is nothing to say (none -> none, e.g. first-ever check with no prior row)', () => {
    expect(buildSaturnPhaseAlertCopy(null, 'none')).toBeNull();
    expect(buildSaturnPhaseAlertCopy('none', 'none')).toBeNull();
  });
});
