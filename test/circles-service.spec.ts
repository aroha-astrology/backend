import { describe, it, expect, vi, beforeEach } from 'vitest';

const world = vi.hoisted(() => ({
  members: [] as Array<Record<string, any>>,
  pulses: new Map<string, { score: number; tone: string }>(),
  invites: new Map<string, Record<string, any>>(),
  profiles: new Map<string, Record<string, any>>(),
  users: new Map<string, Record<string, any>>(),
  stage3: [] as string[],
  seq: 0,
}));

vi.mock('../src/lib/crypto/field-encryption', () => ({
  hashForLookup: (text: string) => `h(${text})`,
}));

vi.mock('../src/modules/circles/circles.repo', () => ({
  listMembers: async (owner: string) => world.members.filter((m) => m.ownerUserId === owner),
  countMembers: async (owner: string) => world.members.filter((m) => m.ownerUserId === owner).length,
  insertMember: async (v: Record<string, any>) => {
    const dup = world.members.find(
      (m) => m.ownerUserId === v.ownerUserId && (m.identityHash === v.identityHash || (v.profileId && m.profileId === v.profileId)),
    );
    if (dup) return undefined;
    const row = { id: `m${++world.seq}`, createdAt: new Date(), ...v };
    world.members.push(row);
    return row;
  },
  deleteMember: async (owner: string, id: string) => {
    const i = world.members.findIndex((m) => m.id === id && m.ownerUserId === owner);
    if (i < 0) return false;
    world.members.splice(i, 1);
    return true;
  },
  pulsesFor: async (ids: string[]) => ids.filter((id) => world.pulses.has(id)).map((id) => ({ memberId: id, ...world.pulses.get(id)! })),
  savePulse: async (r: { memberId: string; score: number; tone: string }) => {
    world.pulses.set(r.memberId, { score: r.score, tone: r.tone });
  },
  countOpenInvites: async (inviter: string) =>
    [...world.invites.values()].filter((i) => i.inviterUserId === inviter && !i.acceptedAt && i.expiresAt > new Date()).length,
  insertInvite: async (v: Record<string, any>) => {
    world.invites.set(v.code, { ...v, acceptedAt: null });
  },
  findInvite: async (code: string) => world.invites.get(code),
  claimInvite: async (code: string, by: string) => {
    const i = world.invites.get(code);
    if (!i || i.acceptedAt || i.expiresAt <= new Date()) return false;
    i.acceptedAt = new Date();
    i.acceptedByUserId = by;
    return true;
  },
}));

vi.mock('../src/modules/birth-profiles/birth-profiles.repo', () => ({
  findOwnedBirthProfile: async (id: string, owner: string) => {
    const p = world.profiles.get(id);
    return p && p.ownerUserId === owner ? p : undefined;
  },
}));

vi.mock('../src/modules/birth-profiles/profile-context', () => ({
  resolveProfileContext: async (_u: unknown, id: string | null) => ({ birthProfileId: id, gender: 'female' }),
}));

vi.mock('../src/modules/users/users.repo', () => ({
  findActiveUserById: async (id: string) => world.users.get(id),
}));

vi.mock('../src/modules/rewards/signup-drip', () => ({
  grantSignupStage: async (userId: string, stage: number) => {
    if (stage === 3) world.stage3.push(userId);
    return 0;
  },
}));

vi.mock('../src/modules/bonds/bonds.service', () => ({
  loadBondChart: async (user: { id: string }) => ({
    ctx: {
      moonNakshatraIndex: 3,
      moonSignIndex: 1,
      transits: [{ planet: 'Moon', nakshatraIndex: 3, signIndex: 1 }],
      owner: user.id,
    },
  }),
  bondSpec: () => ({ guna: false }),
  bondCompatibility: () => ({ pct: 80 }),
}));

import {
  acceptInvite,
  addProfileMember,
  createInvite,
  ensurePulses,
  getCircle,
  previewInvite,
  removeMember,
} from '../src/modules/circles/circles.service';

const owner = {
  id: 'owner',
  displayName: 'Anita Rao',
  currentTimezone: 'Asia/Kolkata',
  dateOfBirth: '1990-01-01',
  timeOfBirth: '06:00',
  placeOfBirth: { lat: 28.61, lon: 77.21 },
} as never;

const friend = {
  id: 'friend',
  displayName: 'Ravi Kumar',
  currentTimezone: 'Asia/Kolkata',
  dateOfBirth: '1988-05-05',
  timeOfBirth: '09:15',
  placeOfBirth: { lat: 19.07, lon: 72.87 },
} as never;

function profile(id: string, dob: string, name: string, ownerUserId = 'owner') {
  world.profiles.set(id, {
    id,
    ownerUserId,
    displayName: name,
    relationship: 'mother',
    gender: 'female',
    dateOfBirth: dob,
    timeOfBirth: '07:00',
    placeOfBirth: { lat: 26.91, lon: 75.79 },
  });
}

beforeEach(() => {
  world.members = [];
  world.pulses = new Map();
  world.invites = new Map();
  world.profiles = new Map();
  world.users = new Map([
    ['owner', owner as never],
    ['friend', friend as never],
  ]);
  world.stage3 = [];
  world.seq = 0;
});

describe('adding a saved profile', () => {
  it('puts the profile in the circle, scores today\'s pulse and pays signup stage 3', async () => {
    profile('p1', '1960-03-03', 'Maa');
    const m = await addProfileMember(owner, 'p1');
    expect(m).toMatchObject({ kind: 'profile', profileId: 'p1', name: 'Maa', relationship: 'mother' });
    // 80 compatibility, both days "average"-or-better from the same chart: a real score in range
    expect(m.pulse!.score).toBeGreaterThan(0);
    expect(world.stage3).toEqual(['owner']);
  });

  it('refuses a profile that is not the reader\'s', async () => {
    profile('p9', '1960-03-03', 'Stranger', 'someone-else');
    await expect(addProfileMember(owner, 'p9')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses the same person twice, even as another profile with the same birth details', async () => {
    profile('p1', '1960-03-03', 'Maa');
    profile('p2', '1960-03-03', 'Mummy');
    await addProfileMember(owner, 'p1');
    await expect(addProfileMember(owner, 'p2')).rejects.toMatchObject({ message: 'ALREADY_IN_CIRCLE' });
    await expect(addProfileMember(owner, 'p1')).rejects.toMatchObject({ message: 'ALREADY_IN_CIRCLE' });
  });

  it('refuses the reader\'s own birth details', async () => {
    world.profiles.set('me', {
      id: 'me',
      ownerUserId: 'owner',
      displayName: 'Me again',
      relationship: null,
      gender: 'female',
      dateOfBirth: '1990-01-01',
      timeOfBirth: '06:00',
      placeOfBirth: { lat: 28.61, lon: 77.21 },
    });
    await expect(addProfileMember(owner, 'me')).rejects.toMatchObject({ message: 'THATS_YOU' });
  });

  it('stops at 12 people', async () => {
    for (let i = 0; i < 12; i++) {
      profile(`p${i}`, `19${50 + i}-01-01`, `P${i}`);
      await addProfileMember(owner, `p${i}`);
    }
    profile('extra', '1999-09-09', 'One too many');
    await expect(addProfileMember(owner, 'extra')).rejects.toMatchObject({ message: 'CIRCLE_FULL' });
  });

  it('removing someone leaves the profile and frees the place', async () => {
    profile('p1', '1960-03-03', 'Maa');
    const m = await addProfileMember(owner, 'p1');
    await removeMember(owner, m.id);
    expect((await getCircle(owner)).members).toHaveLength(0);
    expect(world.profiles.has('p1')).toBe(true);
    await expect(removeMember(owner, m.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('pulses', () => {
  it('computes the missing ones once and reuses the stored pulse the same day', async () => {
    profile('p1', '1960-03-03', 'Maa');
    await addProfileMember(owner, 'p1');
    const members = world.members;
    world.pulses.set(members[0].id, { score: 11, tone: 'care' });
    const again = await ensurePulses(owner, members as never, '2026-10-23', new Date());
    expect(again.get(members[0].id)).toEqual({ score: 11, tone: 'care' });
  });
});

describe('invite links', () => {
  it('makes a one-use /circle/invite/<code> path good for 14 days', async () => {
    const now = new Date('2026-10-23T00:00:00Z');
    const invite = await createInvite(owner, now);
    expect(invite.path).toBe(`/circle/invite/${invite.code}`);
    expect(new Date(invite.expiresAt).getTime() - now.getTime()).toBe(14 * 86_400_000);
  });

  it('allows at most 10 open links', async () => {
    for (let i = 0; i < 10; i++) await createInvite(owner, new Date(Date.now()));
    await expect(createInvite(owner)).rejects.toMatchObject({ message: 'TOO_MANY_OPEN_INVITES' });
  });

  it('the landing card shows the first name only', async () => {
    const { code } = await createInvite(owner);
    expect(await previewInvite(code)).toEqual({ inviterName: 'Anita', state: 'open' });
  });

  it('accepting links both accounts, uses no profile slot and pays stage 3 to both', async () => {
    const { code } = await createInvite(owner);
    const r = await acceptInvite(friend, code);
    expect(r.inviterName).toBe('Anita');
    expect(world.members.map((m) => [m.ownerUserId, m.linkedUserId, m.profileId])).toEqual([
      ['owner', 'friend', undefined],
      ['friend', 'owner', undefined],
    ]);
    expect(world.stage3.sort()).toEqual(['friend', 'owner']);
    expect((await getCircle(owner)).members[0]).toMatchObject({ kind: 'linked', name: 'Ravi' });
    expect((await previewInvite(code)).state).toBe('used');
  });

  it('a code works once', async () => {
    const { code } = await createInvite(owner);
    await acceptInvite(friend, code);
    await expect(acceptInvite({ ...(friend as object), id: 'third' } as never, code)).rejects.toMatchObject({
      message: 'INVITE_USED',
    });
  });

  it('you cannot accept your own link', async () => {
    const { code } = await createInvite(owner);
    await expect(acceptInvite(owner, code)).rejects.toMatchObject({ message: 'THATS_YOU' });
  });

  it('an expired link is refused', async () => {
    const { code } = await createInvite(owner, new Date('2026-01-01T00:00:00Z'));
    await expect(acceptInvite(friend, code, new Date('2026-10-23T00:00:00Z'))).rejects.toMatchObject({
      message: 'INVITE_EXPIRED',
    });
    expect((await previewInvite(code, new Date('2026-10-23T00:00:00Z'))).state).toBe('expired');
  });

  it('an unknown code is not found', async () => {
    await expect(previewInvite('ABCDEFGHJK')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(acceptInvite(friend, 'ABCDEFGHJK')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
