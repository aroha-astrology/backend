import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Spied so each case can assert whether requestLogger raised a page at all.
const alertThrottledMock = vi.fn((_signature: string, _title: string, _message: string) =>
  Promise.resolve(true),
);
vi.mock('../src/lib/notifications/alerts.js', () => ({
  alertThrottled: alertThrottledMock,
}));

const { requestLogger } = await import('../src/middleware/logger.js');

function makeApp() {
  const app = new Hono();
  app.use('*', requestLogger);
  app.get('/paced', (c) => c.json({ error: { code: 'TOO_MANY_REQUESTS' } }, 429));
  app.get('/stale', (c) => c.json({ error: { code: 'UNPROCESSABLE' } }, 422));
  app.get('/broken', (c) => c.json({ error: { code: 'INTERNAL' } }, 500));
  return app;
}

describe('requestLogger alerting', () => {
  beforeEach(() => alertThrottledMock.mockClear());

  // The regression: chat's `silent` question limiter and its single-flight lock
  // both answer 429 by design, and the app hides both from the user entirely.
  // Paging on them woke someone up every time a person double-tapped send.
  it('does not page on a 429 pacing rejection', async () => {
    await makeApp().request('/paced');
    expect(alertThrottledMock).not.toHaveBeenCalled();
  });

  it('does not page on other 4xx contracts', async () => {
    await makeApp().request('/stale');
    expect(alertThrottledMock).not.toHaveBeenCalled();
  });

  it('still pages on 5xx', async () => {
    await makeApp().request('/broken');
    expect(alertThrottledMock).toHaveBeenCalledTimes(1);
    expect(alertThrottledMock.mock.calls[0]?.[1]).toContain('500 on GET /broken');
  });
});
