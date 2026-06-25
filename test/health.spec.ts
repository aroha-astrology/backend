import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbState = vi.hoisted(() => ({
  sqlShouldFail: false,
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => {
    if (dbState.sqlShouldFail) return Promise.reject(new Error('db down'));
    return Promise.resolve([{ '?column?': 1 }]);
  };
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('firebase-admin/app', () => ({
  cert: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: vi.fn() })),
}));

const { createApp } = await import('../src/app.js');

describe('GET /healthz', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with status ok and uptimeSeconds', async () => {
    const app = createApp();
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; uptimeSeconds: number };
    expect(body.status).toBe('ok');
    expect(typeof body.uptimeSeconds).toBe('number');
  });
});

describe('GET /readyz', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 when the db ping succeeds (stubbed sql resolves)', async () => {
    const app = createApp();
    const res = await app.request('/readyz');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; checks: { db: string } };
    expect(body.status).toBe('ok');
    expect(body.checks.db).toBe('ok');
  });
});

describe('GET /openapi.json', () => {
  it('serves an OpenAPI 3 document including the v1 endpoints', async () => {
    const app = createApp();
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe('3.0.0');
    expect(doc.paths['/v1/auth/session']).toBeDefined();
    expect(doc.paths['/v1/me']).toBeDefined();
    expect(doc.paths['/healthz']).toBeDefined();
  });
});
