import { describe, it, expect, vi, beforeEach } from 'vitest';

const world = vi.hoisted(() => ({
  due: [] as Array<Record<string, any>>,
  claimed: new Set<string>(),
  claimedWith: [] as Array<{ id: string; note: string | null }>,
  tokenUntil: new Map<string, Date>(),
  lastCheckIn: new Map<string, Date>(),
  sessions: [] as Array<Record<string, any>>,
  pushes: [] as Array<{ userId: string; payload: Record<string, any> }>,
  switchesOn: new Set<string>(),
  items: new Map<string, Record<string, any>>(),
  updates: [] as Array<Record<string, any>>,
  anchors: 0,
}));

vi.mock('../src/lib/cache/locks', () => ({
  acquire: async () => ({ ok: true, owner: 'o' }),
  release: async () => {},
}));

vi.mock('../src/lib/notifications/notify-user', () => ({
  notifyUser: async (userId: string, payload: Record<string, any>) => {
    world.pushes.push({ userId, payload });
    world.lastCheckIn.set(userId, new Date());
  },
}));

vi.mock('../src/modules/astro/chat-sessions.repo', () => ({
  createChatSession: async (userId: string, profileId: string | null, title: string, history: unknown[]) => {
    const s = { id: `s${world.sessions.length + 1}`, userId, profileId, title, history };
    world.sessions.push(s);
    return s;
  },
}));

vi.mock('../src/modules/features/features.service', () => ({
  isFeatureOn: async (_u: string, key: string) => world.switchesOn.has(key),
  isFeatureOnGlobally: async (key: string) => world.switchesOn.has(key),
}));

vi.mock('../src/modules/memory/memory.repo', () => ({
  listDueFollowUps: async () => world.due,
  claimFollowUp: async (id: string, _now: Date, note: string | null) => {
    if (world.claimed.has(id)) return false;
    world.claimed.add(id);
    world.claimedWith.push({ id, note });
    return true;
  },
  lastCheckInAt: async (userId: string) => world.lastCheckIn.get(userId),
  setFreeReplyUntil: async (userId: string, until: Date) => {
    world.tokenUntil.set(userId, until);
  },
  hasFreeReply: async (userId: string) => (world.tokenUntil.get(userId)?.getTime() ?? 0) > Date.now(),
  countRectifyAnchors: async () => world.anchors,
  listMemory: async () => [...world.items.values()],
  getMemoryItem: async (_u: string, id: string) => world.items.get(id),
  updateMemoryStatus: async (_u: string, id: string, patch: Record<string, any>) => {
    world.updates.push({ id, ...patch });
    return world.items.get(id);
  },
  deleteMemoryItem: async () => true,
  deleteAllMemory: async () => 3,
}));

import {
  confirmEvent,
  factsToSave,
  getVault,
  memorySummary,
  runBabaMemory,
  STALE_AFTER_DAYS,
} from '../src/modules/memory/memory.service';

// 2026-11-06 12:00 IST: inside the polite window
const NOW = new Date('2026-11-06T06:30:00Z');

function due(over: Record<string, any> = {}) {
  return {
    id: 'f1',
    userId: 'u1',
    birthProfileId: null,
    fact: 'has an interview on 5 November 2026',
    followUpQuestion: 'How did the interview go?',
    eventKind: 'interview',
    followUpAt: new Date('2026-11-06T04:30:00Z'),
    locale: 'hi-IN',
    currentTimezone: 'Asia/Kolkata',
    quietHours: null,
    ...over,
  };
}

beforeEach(() => {
  world.due = [];
  world.claimed.clear();
  world.claimedWith = [];
  world.tokenUntil.clear();
  world.lastCheckIn.clear();
  world.sessions = [];
  world.pushes = [];
  world.switchesOn = new Set(['memory.babaMemory']);
  world.items.clear();
  world.updates = [];
  world.anchors = 0;
});

describe('factsToSave', () => {
  const facts = [
    {
      fact: 'has an interview on 5 November 2026',
      followUpQuestion: 'How did it go?',
      eventKind: 'interview',
      eventDate: '2026-11-05',
    },
  ];

  it('with the switch off keeps exactly the old shape: no event, no check-in', () => {
    const out = factsToSave(facts, false, 'Asia/Kolkata', new Date('2026-10-23T06:30:00Z'));
    expect(out).toEqual([{ fact: facts[0]!.fact, followUpQuestion: 'How did it go?' }]);
  });

  it('with the switch on plans the check-in', () => {
    const out = factsToSave(facts, true, 'Asia/Kolkata', new Date('2026-10-23T06:30:00Z'));
    expect(out[0]?.eventDate).toBe('2026-11-05');
    expect(out[0]?.followUpAt?.toISOString()).toBe('2026-11-06T04:30:00.000Z');
  });
});

describe('runBabaMemory', () => {
  it('does nothing while memory.babaMemory is off', async () => {
    world.switchesOn.clear();
    world.due = [due()];
    const r = await runBabaMemory({ now: NOW });
    expect(r).toMatchObject({ skipped: true, reason: 'off', sent: 0 });
    expect(world.pushes).toHaveLength(0);
  });

  it('sends one check-in: a push with no private detail, a first chat line and a free reply', async () => {
    world.due = [due()];
    const r = await runBabaMemory({ now: NOW });
    expect(r).toMatchObject({ skipped: false, due: 1, sent: 1, waiting: 0, expired: 0 });

    expect(world.pushes).toHaveLength(1);
    const { payload } = world.pushes[0]!;
    expect(payload.type).toBe('baba_memory');
    expect(payload.link).toBe('/ai-chat?sessionId=s1');
    // the lock screen never carries the reader's own words
    expect(`${payload.title} ${payload.body}`).not.toMatch(/interview/i);

    expect(world.sessions).toHaveLength(1);
    expect(world.sessions[0]!.history[0].role).toBe('assistant');
    expect(world.sessions[0]!.history[0].content).toContain('How did the interview go?');

    const until = world.tokenUntil.get('u1')!;
    expect(until.getTime() - NOW.getTime()).toBe(48 * 3_600_000);
  });

  it('a Hindi reader gets the check-in in Hindi (one of the original seven languages)', async () => {
    world.due = [due({ locale: 'hi-IN' })];
    await runBabaMemory({ now: NOW });
    expect(world.pushes[0]!.payload.title).toBe('आपका हाल जानना था');
  });

  it('a Spanish reader gets English until lang.pushAll is on, Spanish after', async () => {
    world.due = [due({ locale: 'es-ES' })];
    await runBabaMemory({ now: NOW });
    expect(world.pushes[0]!.payload.title).toBe('Checking in on you');

    world.pushes = [];
    world.claimed.clear();
    world.switchesOn.add('lang.pushAll');
    world.due = [due({ id: 'f2', locale: 'es-ES' })];
    world.lastCheckIn.clear();
    await runBabaMemory({ now: NOW });
    expect(world.pushes[0]!.payload.title).toBe('Quería saber de ti');
  });

  it('holds the check-in outside the polite hours and leaves it due for the next hour', async () => {
    world.due = [due()];
    const night = new Date('2026-11-06T19:00:00Z'); // 00:30 IST
    const r = await runBabaMemory({ now: night });
    expect(r).toMatchObject({ sent: 0, waiting: 1 });
    expect(world.claimed.size).toBe(0);
  });

  it('holds it during the reader\'s own quiet hours', async () => {
    world.due = [due({ quietHours: { start: '11:00', end: '14:00' } })];
    const r = await runBabaMemory({ now: NOW });
    expect(r).toMatchObject({ sent: 0, waiting: 1 });
  });

  it('keeps to one check-in a day per reader', async () => {
    world.lastCheckIn.set('u1', new Date(NOW.getTime() - 3 * 3_600_000));
    world.due = [due()];
    expect((await runBabaMemory({ now: NOW })).waiting).toBe(1);

    world.lastCheckIn.clear();
    world.due = [due(), due({ id: 'f2' })];
    const r = await runBabaMemory({ now: NOW });
    expect(r.sent).toBe(1);
    expect(r.waiting).toBe(1);
  });

  it('drops a check-in that is more than five days late without sending it', async () => {
    world.due = [due({ followUpAt: new Date(NOW.getTime() - (STALE_AFTER_DAYS + 1) * 86_400_000) })];
    const r = await runBabaMemory({ now: NOW });
    expect(r).toMatchObject({ sent: 0, expired: 1 });
    expect(world.claimed.has('f1')).toBe(true);
    expect(world.pushes).toHaveLength(0);
  });

  it('a retried run cannot send the same check-in twice', async () => {
    world.due = [due()];
    await runBabaMemory({ now: NOW });
    world.lastCheckIn.clear();
    world.due = [due()];
    const second = await runBabaMemory({ now: NOW });
    expect(second.sent).toBe(0);
    expect(world.pushes).toHaveLength(1);
  });

  it('a dry run sends and claims nothing', async () => {
    world.due = [due()];
    const r = await runBabaMemory({ now: NOW, dryRun: true });
    expect(r.sent).toBe(1);
    expect(world.pushes).toHaveLength(0);
    expect(world.claimed.size).toBe(0);
  });
});

describe('vault', () => {
  const item = (over: Record<string, any> = {}) => ({
    id: 'i1',
    profileId: null,
    fact: 'PREVIOUSLY TOLD THEM: their job change window is January 2027',
    followUpQuestion: null,
    eventKind: null,
    eventDate: null,
    status: 'ACTIVE',
    followUpAt: null,
    followedUpAt: null,
    rectifyFlag: false,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...over,
  });

  it('shows what is remembered without the internal marker, and says whether the reader can confirm', async () => {
    world.items.set('i1', item());
    world.items.set('i2', item({ id: 'i2', fact: 'had an exam', eventKind: 'exam', eventDate: '2026-11-01' }));
    world.items.set('i3', item({ id: 'i3', fact: 'has a trip', eventKind: 'travel', eventDate: '2026-12-01' }));
    const vault = await getVault('u1', 'Asia/Kolkata', NOW);
    const byId = Object.fromEntries(vault.items.map((e) => [e.id, e]));
    expect(byId.i1!.text).toBe('their job change window is January 2027');
    expect(byId.i1!.toldByGuide).toBe(true);
    expect(byId.i1!.canConfirm).toBe(false);
    expect(byId.i2!.canConfirm).toBe(true);
    expect(byId.i3!.canConfirm).toBe(false);
  });

  it('confirming a past event marks it done and ready to anchor a birth-time check', async () => {
    world.items.set('i2', item({ id: 'i2', eventKind: 'exam', eventDate: '2026-11-01' }));
    expect(await confirmEvent('u1', 'i2', 'Asia/Kolkata', NOW)).toBe('ok');
    expect(world.updates).toEqual([{ id: 'i2', status: 'DONE', rectifyFlag: true }]);
  });

  it('refuses to confirm an event that has not happened yet, or one that does not exist', async () => {
    world.items.set('i3', item({ id: 'i3', eventDate: '2026-12-01' }));
    expect(await confirmEvent('u1', 'i3', 'Asia/Kolkata', NOW)).toBe('not-yet');
    expect(await confirmEvent('u1', 'nope', 'Asia/Kolkata', NOW)).toBe('not-found');
    expect(world.updates).toEqual([]);
  });
});

describe('memorySummary', () => {
  it('offers the birth-time check only after a confirmed event, when the chip is on and the time is not exact', async () => {
    world.switchesOn = new Set(['memory.rectifyChip']);
    world.anchors = 1;
    expect(await memorySummary('u1', 'approximate')).toMatchObject({ confirmedEvents: 1, suggestRectify: true });
    expect(await memorySummary('u1', 'exact')).toMatchObject({ suggestRectify: false });

    world.anchors = 0;
    expect((await memorySummary('u1', 'approximate')).suggestRectify).toBe(false);

    world.anchors = 2;
    world.switchesOn.clear();
    expect((await memorySummary('u1', 'approximate')).suggestRectify).toBe(false);
  });

  it('reports the free reply while the token is open', async () => {
    world.tokenUntil.set('u1', new Date(Date.now() + 3_600_000));
    expect((await memorySummary('u1', 'exact')).freeReply).toBe(true);
    world.tokenUntil.set('u1', new Date(Date.now() - 1000));
    expect((await memorySummary('u1', 'exact')).freeReply).toBe(false);
  });
});
