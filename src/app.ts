import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { serveStatic } from '@hono/node-server/serve-static';
import { compress } from 'hono/compress';
import { bodyLimit } from 'hono/body-limit';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { birthProfilesRouter } from './modules/birth-profiles/birth-profiles.routes.js';
import { profilesRouter } from './modules/birth-profiles/profiles.routes.js';
import { deviceTokensRouter } from './modules/device-tokens/device-tokens.routes.js';
import { astroRouter } from './modules/astro/astro.routes.js';
import { publicRouter } from './modules/public/public.routes.js';
import { legalRouter } from './modules/legal/legal.routes.js';
import { billingRouter } from './modules/billing/billing.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { adminGroupsRouter } from './modules/admin/admin-groups.routes.js';
import { supportRouter } from './modules/support/support.routes.js';
import { preferencesRouter } from './modules/preferences/preferences.routes.js';
import { feedbackRouter } from './modules/feedback/feedback.routes.js';
import { kundliRouter } from './modules/kundli/kundli.routes.js';
import { horoscopeRouter } from './modules/horoscope/horoscope.routes.js';
import { purchasePlanRouter } from './modules/purchase-plan/purchase-plan.routes.js';
import { vastuRouter } from './modules/vastu/vastu.routes.js';
import { gemstoneRouter } from './modules/gemstone/gemstone.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { palmRouter } from './modules/palm/palm.routes.js';
import { gitaRouter } from './modules/gita/gita.routes.js';
import { voiceRouter } from './modules/voice/voice.routes.js';
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
  // 6 MB — raised from the original 1 MB to fit a single palm-reading capture frame (a
  // client-downscaled JPEG, typically well under 1 MB but given generous headroom here since
  // this is a global ceiling and Hono runs it before any route is matched, so a route-specific
  // override can never loosen it — see palm.routes.ts's raw-body upload route, the only
  // caller that needs more than trivial JSON payload room). Oversized bodies still get a 413
  // via the global HTTPException handler.
  app.use('*', bodyLimit({ maxSize: 6 * 1024 * 1024 }));
  // Baseline abuse guard for every /v1 route (previously only chat/vastu/purchase-plan
  // had any limit at all — GET /v1/kundli, /v1/me, /v1/horoscope, /v1/billing/*, etc. were
  // completely unlimited). Runs before any router's own `requireUser`, so it's keyed by IP
  // rather than user id here — the route-specific limiters below (which run after auth)
  // still apply their own, stricter, per-user limits on top of this.
  //
  // The ceiling is deliberately generous: one app open fans out to ~16-20 calls
  // (12 × /v1/forecast/moon-sign/N for the horoscope slider, plus /v1/me,
  // /v1/kundli, /v1/horoscope, panchang), and several of those screens then
  // poll while content generates. At 60/min a single user refreshing twice was
  // enough to trip it. This is an abuse guard, not a quota.
  app.use('/v1/*', rateLimiter({ windowMs: 60_000, max: 300, name: 'baseline' }));

  app.route('/', healthRouter);
  app.route('/v1/auth', authRouter);
  app.route('/v1', astroRouter);
  app.route('/v1', publicRouter);
  app.route('/v1', legalRouter);
  // gitaRouter has NO auth on its GET /gita/verses route (same reasoning as
  // publicRouter/legalRouter — free content, no unlock) and MUST stay mounted
  // here, before any router that calls `.use('*', requireUser)` on itself.
  // See admin.routes.ts's top-of-file comment: that wildcard, once merged via
  // app.route(), leaks onto every router mounted after it at the same base
  // path — birthProfilesRouter below is the first of many that do this.
  // Moving gitaRouter after them (its original position, next to palmRouter)
  // silently 401'd every request; this is the exact bug that comment warns
  // about, encountered for real rather than avoided by reading the warning.
  app.route('/v1', gitaRouter);
  app.route('/v1', usersRouter);
  app.route('/v1', birthProfilesRouter);
  app.route('/v1', profilesRouter);
  app.route('/v1', deviceTokensRouter);
  app.route('/v1', billingRouter);
  app.route('/v1', adminRouter);
  app.route('/v1', adminGroupsRouter);
  app.route('/v1', supportRouter);
  app.route('/v1', preferencesRouter);
  app.route('/v1', feedbackRouter);
  app.route('/v1', kundliRouter);
  app.route('/v1', horoscopeRouter);
  app.route('/v1', purchasePlanRouter);
  app.route('/v1', vastuRouter);
  app.route('/v1', gemstoneRouter);
  app.route('/v1', reportsRouter);
  app.route('/v1', palmRouter);
  app.route('/v1', voiceRouter);

  // Gita chant audio — 701 static MP3s (~57MB), too large for the frontend's
  // public/ bundle the way the 50-mantra Shlokas set is. Served directly off
  // EC2 disk rather than committed to git; @hono/node-server's serveStatic
  // gives Range/206 support for free, which a plain readFileSync route
  // (see palm.routes.ts's whole-file c.body() pattern) does not. Deployed
  // out-of-band via scp — see scripts/deploy.sh's exclude list, this
  // directory must never be rsync --delete'd away by a code deploy.
  app.use(
    '/v1/gita/audio/*',
    serveStatic({
      root: './data/gita-audio',
      rewriteRequestPath: (path) => path.replace(/^\/v1\/gita\/audio/, ''),
    }),
  );
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
