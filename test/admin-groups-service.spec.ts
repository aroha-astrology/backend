import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  createGroup: vi.fn(),
  listGroupsWithMemberCount: vi.fn(),
  deleteGroup: vi.fn(),
  addMember: vi.fn(),
  removeMember: vi.fn(),
  listMembers: vi.fn(),
  upsertGroupFeatureOverride: vi.fn(),
  deleteGroupFeatureOverride: vi.fn(),
  listGroupFeatureOverrides: vi.fn(),
  invalidateGroupOverrideCache: vi.fn(),
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/modules/user-groups/user-groups.repo.js', () => ({
  createGroup: state.createGroup,
  listGroupsWithMemberCount: state.listGroupsWithMemberCount,
  deleteGroup: state.deleteGroup,
  addMember: state.addMember,
  removeMember: state.removeMember,
  listMembers: state.listMembers,
  upsertGroupFeatureOverride: state.upsertGroupFeatureOverride,
  deleteGroupFeatureOverride: state.deleteGroupFeatureOverride,
  listGroupFeatureOverrides: state.listGroupFeatureOverrides,
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  invalidateGroupOverrideCache: state.invalidateGroupOverrideCache,
}));

vi.mock('../src/modules/admin/admin.repo.js', () => ({
  logAdminAction: state.logAdminAction,
}));

const {
  listGroupsForAdmin,
  createGroupForAdmin,
  deleteGroupForAdmin,
  listMembersForAdmin,
  addMemberForAdmin,
  removeMemberForAdmin,
  listGroupFeaturesForAdmin,
  updateGroupFeatureForAdmin,
} = await import('../src/modules/admin/admin-groups.service.js');

const ADMIN_PHONE = '+919999111111';

beforeEach(() => {
  for (const fn of Object.values(state)) {
    if (typeof fn === 'function' && 'mockReset' in fn) (fn as any).mockReset();
  }
  state.logAdminAction.mockResolvedValue(undefined);
});

describe('listGroupsForAdmin', () => {
  it('serializes createdAt to ISO and passes memberCount through', async () => {
    state.listGroupsWithMemberCount.mockResolvedValue([
      {
        id: 'g1',
        name: 'Beta testers',
        description: 'early access',
        createdAt: new Date('2026-07-01T00:00:00Z'),
        createdBy: ADMIN_PHONE,
        memberCount: 3,
      },
    ]);

    const result = await listGroupsForAdmin();

    expect(result).toEqual([
      {
        id: 'g1',
        name: 'Beta testers',
        description: 'early access',
        createdAt: '2026-07-01T00:00:00.000Z',
        createdBy: ADMIN_PHONE,
        memberCount: 3,
      },
    ]);
  });
});

describe('createGroupForAdmin', () => {
  it('creates the group, audit-logs, and returns it with memberCount 0', async () => {
    state.createGroup.mockResolvedValue({
      id: 'g1',
      name: 'Beta testers',
      description: 'early access',
      createdAt: new Date('2026-07-01T00:00:00Z'),
      createdBy: ADMIN_PHONE,
    });

    const result = await createGroupForAdmin('Beta testers', 'early access', ADMIN_PHONE);

    expect(state.createGroup).toHaveBeenCalledWith('Beta testers', 'early access', ADMIN_PHONE);
    expect(result).toEqual({
      id: 'g1',
      name: 'Beta testers',
      description: 'early access',
      createdAt: '2026-07-01T00:00:00.000Z',
      createdBy: ADMIN_PHONE,
      memberCount: 0,
    });
    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining('/v1/admin/groups'),
      expect.anything(),
    );
  });

  it('treats an undefined description as null', async () => {
    state.createGroup.mockResolvedValue({
      id: 'g1',
      name: 'No description group',
      description: null,
      createdAt: new Date(),
      createdBy: ADMIN_PHONE,
    });

    await createGroupForAdmin('No description group', undefined, ADMIN_PHONE);

    expect(state.createGroup).toHaveBeenCalledWith('No description group', null, ADMIN_PHONE);
  });

  it('rejects a duplicate name (case-insensitive) with a 400, not a 500', async () => {
    state.createGroup.mockRejectedValue(
      Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }),
    );

    await expect(createGroupForAdmin('Beta Testers', null, ADMIN_PHONE)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('propagates a non-uniqueness error untouched', async () => {
    state.createGroup.mockRejectedValue(new Error('connection refused'));

    await expect(createGroupForAdmin('Beta testers', null, ADMIN_PHONE)).rejects.toThrow(
      'connection refused',
    );
  });
});

describe('deleteGroupForAdmin', () => {
  it('deletes, invalidates the group-override cache, and audit-logs', async () => {
    await deleteGroupForAdmin('g1', ADMIN_PHONE);

    expect(state.deleteGroup).toHaveBeenCalledWith('g1');
    expect(state.invalidateGroupOverrideCache).toHaveBeenCalledTimes(1);
    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining('/v1/admin/groups/g1'),
      expect.anything(),
    );
  });
});

describe('listMembersForAdmin', () => {
  it('serializes addedAt to ISO for each member', async () => {
    state.listMembers.mockResolvedValue([
      { userId: 'u1', displayName: 'Asha', phoneE164: '+919999999999', addedAt: new Date('2026-07-01T00:00:00Z') },
    ]);

    const result = await listMembersForAdmin('g1');

    expect(state.listMembers).toHaveBeenCalledWith('g1');
    expect(result).toEqual([
      { userId: 'u1', displayName: 'Asha', phoneE164: '+919999999999', addedAt: '2026-07-01T00:00:00.000Z' },
    ]);
  });
});

describe('addMemberForAdmin', () => {
  it('adds the member and audit-logs', async () => {
    await addMemberForAdmin('g1', 'u1', ADMIN_PHONE);

    expect(state.addMember).toHaveBeenCalledWith('g1', 'u1');
    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining('/v1/admin/groups/g1/members'),
      expect.anything(),
    );
  });
});

describe('removeMemberForAdmin', () => {
  it('removes the member and audit-logs', async () => {
    await removeMemberForAdmin('g1', 'u1', ADMIN_PHONE);

    expect(state.removeMember).toHaveBeenCalledWith('g1', 'u1');
    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining('/v1/admin/groups/g1/members/u1'),
      expect.anything(),
    );
  });
});

describe('listGroupFeaturesForAdmin', () => {
  it('merges FEATURE_REGISTRY with the group overrides, defaulting to "inherit"', async () => {
    state.listGroupFeatureOverrides.mockResolvedValue([{ featureKey: 'paid.chat', enabled: false }]);

    const result = await listGroupFeaturesForAdmin('g1');

    const chat = result.find((f) => f.key === 'paid.chat');
    expect(chat).toEqual({ key: 'paid.chat', label: 'AI Chat', group: 'paid', state: false });
    const navHome = result.find((f) => f.key === 'nav.home');
    expect(navHome).toEqual({ key: 'nav.home', label: 'Home tab', group: 'nav', state: 'inherit' });
  });

  it('reflects an explicit true override as state: true, not "inherit"', async () => {
    state.listGroupFeatureOverrides.mockResolvedValue([{ featureKey: 'paid.vastu', enabled: true }]);

    const result = await listGroupFeaturesForAdmin('g1');

    const vastu = result.find((f) => f.key === 'paid.vastu');
    expect(vastu?.state).toBe(true);
  });
});

describe('updateGroupFeatureForAdmin', () => {
  it('rejects an unknown feature key with a 400 and never writes', async () => {
    await expect(
      updateGroupFeatureForAdmin('g1', 'not.a.real.key', true, ADMIN_PHONE),
    ).rejects.toMatchObject({ status: 400 });
    expect(state.upsertGroupFeatureOverride).not.toHaveBeenCalled();
    expect(state.deleteGroupFeatureOverride).not.toHaveBeenCalled();
  });

  it('upserts a true/false override, invalidates the cache, and audit-logs', async () => {
    const result = await updateGroupFeatureForAdmin('g1', 'paid.chat', false, ADMIN_PHONE);

    expect(state.upsertGroupFeatureOverride).toHaveBeenCalledWith('g1', 'paid.chat', false, ADMIN_PHONE);
    expect(state.deleteGroupFeatureOverride).not.toHaveBeenCalled();
    expect(state.invalidateGroupOverrideCache).toHaveBeenCalledTimes(1);
    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining('/v1/admin/groups/g1/features'),
      expect.objectContaining({ key: 'paid.chat', enabled: false }),
    );
    expect(result).toEqual({ key: 'paid.chat', label: 'AI Chat', group: 'paid', state: false });
  });

  it('a null enabled DELETES the override (back to "inherit") instead of upserting', async () => {
    const result = await updateGroupFeatureForAdmin('g1', 'paid.chat', null, ADMIN_PHONE);

    expect(state.deleteGroupFeatureOverride).toHaveBeenCalledWith('g1', 'paid.chat');
    expect(state.upsertGroupFeatureOverride).not.toHaveBeenCalled();
    expect(state.invalidateGroupOverrideCache).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ key: 'paid.chat', label: 'AI Chat', group: 'paid', state: 'inherit' });
  });
});
