import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Google Play RTDN webhook as Pub/Sub sees it: who may call it (OIDC token or the URL
// secret) and when it asks for a notice again (500) instead of acknowledging it (200).

const state = vi.hoisted(() => ({
  handlePlaySubscriptionNotification: vi.fn(),
  reconcileGooglePlayNotification: vi.fn(),
  handleVoidedPurchaseNotification: vi.fn(),
  verifyIdToken: vi.fn(),
}));

interface FakeEnv {
  LOG_LEVEL: string;
  GOOGLE_PLAY_RTDN_SECRET?: string;
  GOOGLE_PLAY_RTDN_AUDIENCE?: string;
  GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT?: string;
}
const fakeEnv = vi.hoisted((): FakeEnv => ({ LOG_LEVEL: 'silent' }));

vi.mock('../src/config/env.js', () => ({ env: fakeEnv, isProduction: false, isTest: true }));
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        verifyIdToken = state.verifyIdToken;
      },
    },
  },
}));
vi.mock('../src/modules/pass/pass-play.service.js', () => ({
  handlePlaySubscriptionNotification: state.handlePlaySubscriptionNotification,
}));
vi.mock('../src/modules/billing/play-refunds.service.js', () => ({
  handleVoidedPurchaseNotification: state.handleVoidedPurchaseNotification,
}));
vi.mock('../src/modules/billing/billing.service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reconcileGooglePlayNotification: state.reconcileGooglePlayNotification,
}));

const { OpenAPIHono } = await import('@hono/zod-openapi');
const { billingWebhooksRouter } = await import('../src/modules/billing/billing.routes.js');
const { errorHandler } = await import('../src/middleware/error.js');

function app() {
  const a = new OpenAPIHono();
  a.onError(errorHandler);
  a.route('/internal', billingWebhooksRouter);
  return a;
}

const push = (payload: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(payload)).toString('base64'), messageId: '1' },
  subscription: 'projects/p/subscriptions/s',
});
const passNotice = push({
  subscriptionNotification: {
    notificationType: 6,
    purchaseToken: 'tok-1',
    subscriptionId: 'aroha_pass_monthly',
  },
});

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app().request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  fakeEnv.GOOGLE_PLAY_RTDN_SECRET = 's3cret';
  fakeEnv.GOOGLE_PLAY_RTDN_AUDIENCE = undefined;
  fakeEnv.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT = undefined;
  for (const fn of [
    state.handlePlaySubscriptionNotification,
    state.reconcileGooglePlayNotification,
    state.verifyIdToken,
  ]) {
    fn.mockReset();
  }
  state.handlePlaySubscriptionNotification.mockResolvedValue(undefined);
  state.reconcileGooglePlayNotification.mockResolvedValue(undefined);
});

describe('RTDN webhook: retry instead of losing a Pass notice', () => {
  it('answers 200 once the notice is handled', async () => {
    const res = await post('/internal/billing/google-play-rtdn?secret=s3cret', passNotice);
    expect(res.status).toBe(200);
    expect(state.handlePlaySubscriptionNotification).toHaveBeenCalledWith(
      expect.objectContaining({ purchaseToken: 'tok-1', notificationType: 6 }),
    );
  });

  it('answers 500 when the handler could not finish (Google or the database down), so Pub/Sub retries', async () => {
    state.handlePlaySubscriptionNotification.mockRejectedValue(new Error('google 503'));
    const res = await post('/internal/billing/google-play-rtdn?secret=s3cret', passNotice);
    expect(res.status).toBe(500);
  });

  it('still answers 200 for an unreadable body or a failed top-up notice (a retry cannot fix those)', async () => {
    const bad = await post('/internal/billing/google-play-rtdn?secret=s3cret', {
      message: { data: 'not base64 json' },
    });
    expect(bad.status).toBe(200);
    state.reconcileGooglePlayNotification.mockRejectedValue(new Error('order mismatch'));
    const topUp = await post(
      '/internal/billing/google-play-rtdn?secret=s3cret',
      push({
        oneTimeProductNotification: { notificationType: 1, purchaseToken: 't', sku: 'topup_500' },
      }),
    );
    expect(topUp.status).toBe(200);
  });

  it('hands a refund or chargeback notice to the refund check', async () => {
    const res = await post(
      '/internal/billing/google-play-rtdn?secret=s3cret',
      push({
        voidedPurchaseNotification: { purchaseToken: 'tok-v', orderId: 'GPA.9', productType: 2 },
      }),
    );
    expect(res.status).toBe(200);
    expect(state.handleVoidedPurchaseNotification).toHaveBeenCalledWith(
      expect.objectContaining({ purchaseToken: 'tok-v', orderId: 'GPA.9' }),
    );
  });
});

describe('RTDN webhook: who may call it', () => {
  it('refuses a wrong or missing secret', async () => {
    expect((await post('/internal/billing/google-play-rtdn?secret=nope', passNotice)).status).toBe(
      403,
    );
    expect((await post('/internal/billing/google-play-rtdn', passNotice)).status).toBe(403);
    expect(state.handlePlaySubscriptionNotification).not.toHaveBeenCalled();
  });

  it('accepts a Google-signed Pub/Sub token for our audience and sender, with no secret in the URL', async () => {
    fakeEnv.GOOGLE_PLAY_RTDN_SECRET = undefined;
    fakeEnv.GOOGLE_PLAY_RTDN_AUDIENCE = 'https://api.example/internal/billing/google-play-rtdn';
    fakeEnv.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT = 'rtdn@proj.iam.gserviceaccount.com';
    state.verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'rtdn@proj.iam.gserviceaccount.com', email_verified: true }),
    });
    const res = await post('/internal/billing/google-play-rtdn', passNotice, {
      authorization: 'Bearer good.jwt',
    });
    expect(res.status).toBe(200);
    expect(state.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'good.jwt',
      audience: 'https://api.example/internal/billing/google-play-rtdn',
    });
  });

  it('refuses a token from another sender, or one Google does not vouch for', async () => {
    fakeEnv.GOOGLE_PLAY_RTDN_SECRET = undefined;
    fakeEnv.GOOGLE_PLAY_RTDN_AUDIENCE = 'aud';
    fakeEnv.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT = 'rtdn@proj.iam.gserviceaccount.com';
    state.verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'someone@else.com', email_verified: true }),
    });
    expect(
      (await post('/internal/billing/google-play-rtdn', passNotice, { authorization: 'Bearer x' }))
        .status,
    ).toBe(403);
    state.verifyIdToken.mockRejectedValue(new Error('Wrong recipient'));
    expect(
      (await post('/internal/billing/google-play-rtdn', passNotice, { authorization: 'Bearer x' }))
        .status,
    ).toBe(403);
  });

  it('ignores a bearer token while no audience is configured (the secret still decides)', async () => {
    const res = await post('/internal/billing/google-play-rtdn', passNotice, {
      authorization: 'Bearer anything',
    });
    expect(res.status).toBe(403);
    expect(state.verifyIdToken).not.toHaveBeenCalled();
  });
});
