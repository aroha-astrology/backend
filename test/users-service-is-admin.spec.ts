import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow, makeProfileContext } from './helpers/mocks.js';

// toUserDto's isAdmin flag is a pure derivation of env.ADMIN_PHONE_E164 vs.
// the user row's phoneE164 DB column — a UI affordance only (whether to
// render the /admin link), NOT the authorization boundary. requireAdmin
// (middleware/auth.ts) is the real gate and reads the token claim instead.
const fakeEnv = vi.hoisted(() => ({
  ADMIN_PHONE_E164: ['+919999111111'],
  LOG_LEVEL: 'silent',
}));
vi.mock('../src/config/env.js', () => ({ env: fakeEnv, isProduction: false, isTest: true }));

const { toUserDto } = await import('../src/modules/users/users.service.js');

beforeEach(() => {
  fakeEnv.ADMIN_PHONE_E164 = ['+919999111111'];
});

describe('toUserDto isAdmin', () => {
  it('is true when the user row phone is on the ADMIN_PHONE_E164 allowlist', () => {
    const row = makeUserRow({ phoneE164: '+919999111111' });
    const dto = toUserDto(row, makeProfileContext(), {}, false, [], null);
    expect(dto.isAdmin).toBe(true);
  });

  it('is false when the user row phone is not on the allowlist', () => {
    const row = makeUserRow({ phoneE164: '+911111111111' });
    const dto = toUserDto(row, makeProfileContext(), {}, false, [], null);
    expect(dto.isAdmin).toBe(false);
  });

  it('is false when the user row has no phone at all', () => {
    const row = makeUserRow({ phoneE164: null });
    const dto = toUserDto(row, makeProfileContext(), {}, false, [], null);
    expect(dto.isAdmin).toBe(false);
  });
});
