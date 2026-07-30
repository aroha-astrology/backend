import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { makeUserRow } from './helpers/mocks.js';

// requireFeature() is enforcement-only middleware built in isolation here —
// no route wires it up yet (that happens in a later task). Mock the resolver
// so the middleware's own gating logic is exercised without touching the DB.
// It is user-aware (must run after requireUser) — the fake app below sets
// `c.var.user` itself rather than going through the real requireUser, mirroring
// how requireConsent's own unit tests assume an already-authenticated context.
const state = vi.hoisted(() => ({
  resolveFeaturesForUser: vi.fn(),
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  resolveFeaturesForUser: state.resolveFeaturesForUser,
}));

const { requireFeature } = await import('../src/middleware/feature.js');
const { errorHandler } = await import('../src/middleware/error.js');

function makeApp(key: string, userId = 'user-1') {
  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    c.set('user', makeUserRow({ id: userId }));
    await next();
  });
  app.get('/gated', requireFeature(key), (c) => c.text('ok'));
  return app;
}

beforeEach(() => {
  state.resolveFeaturesForUser.mockReset();
});

describe('requireFeature', () => {
  it('allows the request through when the feature is enabled', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'paid.chat': { enabled: true, pricePaise: 2000 },
    });
    const app = makeApp('paid.chat');

    const res = await app.request('/gated');

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('blocks the request with 403 FEATURE_DISABLED when the feature is explicitly disabled', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'paid.chat': { enabled: false, pricePaise: 2000 },
    });
    const app = makeApp('paid.chat');

    const res = await app.request('/gated');
    const body = (await res.json()) as { error: { code: string; message: string } };

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toBe('FEATURE_DISABLED');
  });

  it('fails open (allows the request) for a key absent from the resolved map entirely', async () => {
    // Registry drift / typo case: an unknown key is a bug elsewhere, not a
    // reason to 403 a legitimate user — the registry is the source of truth
    // for what keys exist, and this key isn't in it.
    state.resolveFeaturesForUser.mockResolvedValue({});
    const app = makeApp('nav.doesNotExist');

    const res = await app.request('/gated');

    expect(res.status).toBe(200);
  });

  it('calls resolveFeaturesForUser() fresh on every request rather than caching inside the middleware itself', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'paid.chat': { enabled: true, pricePaise: 2000 },
    });
    const app = makeApp('paid.chat');

    await app.request('/gated');
    await app.request('/gated');

    expect(state.resolveFeaturesForUser).toHaveBeenCalledTimes(2);
  });

  it("resolves the CALLING user's own feature view, keyed by their user id", async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'paid.chat': { enabled: true, pricePaise: 2000 },
    });
    const app = makeApp('paid.chat', 'user-42');

    await app.request('/gated');

    expect(state.resolveFeaturesForUser).toHaveBeenCalledWith('user-42');
  });
});
