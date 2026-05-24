import type { DecodedIdToken } from 'firebase-admin/auth';
import type { UserRow } from '../../src/db/schema.js';

export function makeUserRow(overrides: Partial<UserRow> = {}): UserRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: '00000000-0000-0000-0000-000000000001',
    firebaseUid: 'firebase-uid-1',
    phoneE164: '+919999999999',
    displayName: null,
    gender: null,
    dateOfBirth: null,
    timeOfBirth: null,
    placeOfBirth: null,
    profileCompletedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

export function makeDecodedToken(uid = 'firebase-uid-1', phone = '+919999999999'): DecodedIdToken {
  const token: DecodedIdToken = {
    uid,
    aud: 'test',
    auth_time: 0,
    exp: 0,
    iat: 0,
    iss: 'test',
    sub: uid,
    firebase: { identities: {}, sign_in_provider: 'phone' },
    phone_number: phone,
  };
  return token;
}
