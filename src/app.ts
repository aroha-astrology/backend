import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { compress } from 'hono/compress';
import { bodyLimit } from 'hono/body-limit';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { birthProfilesRouter } from './modules/birth-profiles/birth-profiles.routes.js';
import { profilesRouter } from './modules/birth-profiles/profiles.routes.js';
import { deviceTokensRouter } from './modules/device-tokens/device-tokens.routes.js';
import { astroRouter } from './modules/astro/astro.routes.js';
import { legalRouter } from './modules/legal/legal.routes.js';
import { billingRouter } from './modules/billing/billing.routes.js';
import { preferencesRouter } from './modules/preferences/preferences.routes.js';
import { feedbackRouter } from './modules/feedback/feedback.routes.js';
import { kundliRouter } from './modules/kundli/kundli.routes.js';
import { horoscopeRouter } from './modules/horoscope/horoscope.routes.js';
import { purchasePlanRouter } from './modules/purchase-plan/purchase-plan.routes.js';
import { vastuRouter } from './modules/vastu/vastu.routes.js';
import { gemstoneRouter } from './modules/gemstone/gemstone.routes.js';
import { cronRouter } from './modules/cron/cron.routes.js';
import { telegramBotRouter } from './modules/telegram-bot/telegram-bot.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { requestLogger } from './middleware/logger.js';
import { corsMiddleware } from './middleware/cors.js';
import { rateLimiter } from './middleware/rate-limit.js';
import { isProduction } from './config/env.js';

export function createApp(): OpenAPIHono {
  const app = new OpenAPIHono();

  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  app.use('*', corsMiddleware);
  app.use('*', requestLogger);
  app.use('*', compress());
  app.use('*', bodyLimit({ maxSize: 1 * 1024 * 1024 })); // 1 MB — oversized bodies get a 413 via the global HTTPException handler
  // Baseline abuse guard for every /v1 route (previously only chat/vastu/purchase-plan
  // had any limit at all — GET /v1/kundli, /v1/me, /v1/horoscope, /v1/billing/*, etc. were
  // completely unlimited). Runs before any router's own `requireUser`, so it's keyed by IP
  // rather than user id here — the route-specific limiters below (which run after auth)
  // still apply their own, stricter, per-user limits on top of this.
  app.use('/v1/*', rateLimiter({ windowMs: 60_000, max: 60 }));

  app.route('/', healthRouter);
  app.route('/v1/auth', authRouter);
  app.route('/v1', astroRouter);
  app.route('/v1', legalRouter);
  app.route('/v1', usersRouter);
  app.route('/v1', birthProfilesRouter);
  app.route('/v1', profilesRouter);
  app.route('/v1', deviceTokensRouter);
  app.route('/v1', billingRouter);
  app.route('/v1', preferencesRouter);
  app.route('/v1', feedbackRouter);
  app.route('/v1', kundliRouter);
  app.route('/v1', horoscopeRouter);
  app.route('/v1', purchasePlanRouter);
  app.route('/v1', vastuRouter);
  app.route('/v1', gemstoneRouter);
  // Mounted OUTSIDE /v1: the /v1 routers attach a `requireUser` wildcard that
  // would otherwise intercept the machine-facing (cron-secret) endpoints.
  app.route('/internal', cronRouter);
  app.route('/internal', telegramBotRouter);

  // API docs expose the full route surface (including cron/Telegram internal
  // route shapes) — only serve them outside production. A production request
  // for either path falls through to the normal 404 handler.
  if (!isProduction) {
    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'Firebase ID token',
    });

    app.doc('/openapi.json', {
      openapi: '3.0.0',
      info: {
        title: 'Aroha Astrology Backend',
        version: '0.1.0',
        description:
          'HTTP API for the Aroha Astrology client. Authentication is via Firebase Auth — pass the Firebase ID token as `Authorization: Bearer <token>`.',
      },
      servers: [
        { url: 'http://13.232.179.137:3000', description: 'EC2 (Mumbai) — staging' },
        { url: 'http://localhost:3000', description: 'Local development' },
      ],
    });

    app.get('/docs', swaggerUI({ url: '/openapi.json' }));
  }

  return app;
}
